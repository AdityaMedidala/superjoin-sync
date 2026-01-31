from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

import asyncio
import gspread
import json
import os
import redis.asyncio as redis

from datetime import datetime
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

# ---------------- CONFIG & MAPPING ---------------- #

DB_URL = os.getenv("MYSQL_URL")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
SHEET_ID = os.getenv("SHEET_ID", "1bM61VLxcWdg3HaNgc2RkPLL-hm2S-BJ6Jo9lX4Qv1ks")

COLUMN_MAP = {
    "Name": "Name",
    "Email": "Email",
    "Age": "Age",
    "City": "City",
    "Status": "status"
}

# Reverse mapping for DB → Sheet
DB_TO_SHEET_MAP = {v: k for k, v in COLUMN_MAP.items()}

# ---------------- DATABASE & REDIS ---------------- #

engine = create_engine(DB_URL, pool_pre_ping=True, pool_recycle=3600)
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

# ---------------- LOGGING ---------------- #

logs = []

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    msg = f"[{ts}] {msg}"
    print(msg)
    logs.insert(0, msg)
    if len(logs) > 100: logs.pop()

# ---------------- GOOGLE SHEETS ---------------- #

def _create_sheet():
    if os.getenv("RAILWAY_ENVIRONMENT"):
        creds = json.loads(os.getenv("GOOGLE_CREDENTIALS_JSON"))
        gc = gspread.service_account_from_dict(creds)
    else:
        gc = gspread.service_account("superjoin-test.json")
    return gc.open_by_key(SHEET_ID).sheet1

_sheet = None
_sheet_lock = asyncio.Lock()

async def get_sheet_safe():
    global _sheet
    if _sheet: return _sheet
    async with _sheet_lock:
        if _sheet: return _sheet
        try:
            _sheet = _create_sheet()
            log("✅ Connected to Google Sheets")
            return _sheet
        except Exception as e:
            log(f"❌ Sheet Connection Error: {e}")
            raise

# ---------------- WORKER: SHEET → DB (With Deduplication) ---------------- #

async def worker_sheet_to_db():
    log("🔵 Worker started: Sheet → DB")
    while True:
        try:
            item = await redis_client.blpop("queue:sheet_to_db", timeout=1)
            if not item: continue

            data = json.loads(item[1])
            row_id = data.get("id")
            sheet_header = data.get("header")
            val = data.get("value")

            # [EDGE CASE] System Messages (Visualizing protected errors)
            if sheet_header == "SYSTEM":
                log(f"⚠️ {val}")
                continue

            db_col = COLUMN_MAP.get(sheet_header)

            if not db_col or not row_id:
                log(f"⏭️ Ignored: No mapping for '{sheet_header}'")
                continue

            with engine.begin() as conn:
                # [EDGE CASE] Duplicates / Idempotency
                # Check current DB value before writing
                current_val = conn.execute(
                    text(f"SELECT `{db_col}` FROM mytable WHERE id = :id"),
                    {"id": row_id}
                ).scalar()

                if str(current_val) == str(val):
                    log(f"⏭️ Skipped: Row {row_id} {db_col} is already '{val}'")
                    continue

                # [EDGE CASE] DB Locks
                # Implicitly handled by sequential queue processing + transactions
                conn.execute(
                    text(f"UPDATE mytable SET `{db_col}` = :val, sync_source = 'SHEET', last_updated = NOW() WHERE id = :id"),
                    {"val": val, "id": row_id}
                )
                log(f"✅ Sheet→DB: Row {row_id} | {db_col} = {val}")

        except Exception as e:
            log(f"❌ Sheet→DB Worker Error: {e}")
            await asyncio.sleep(2)

# ---------------- WORKER: DB → SHEET (Smart Sync) ---------------- #

async def worker_db_to_sheet():
    log("🔵 Worker started: DB → Sheet")
    await asyncio.sleep(3)  # Give Sheet→DB worker time to start first
    
    while True:
        try:
            # [EDGE CASE] Infinite Loops
            # Only sync rows that were NOT updated by 'SHEET'
            # This breaks the loop: Sheet -> DB -> Sheet
            with engine.begin() as conn:
                rows = conn.execute(text(
                    "SELECT * FROM mytable WHERE sync_source = 'DB' ORDER BY last_updated ASC LIMIT 5"
                )).mappings().all()

            if not rows:
                await asyncio.sleep(2)
                continue

            sheet = await get_sheet_safe()
            headers = sheet.row_values(1)

            for row in rows:
                row_id = row["id"]
                
                try:
                    # Find the row in the sheet
                    cell = sheet.find(str(row_id), in_column=1)

                    if cell:
                        updates = []
                        for i, h in enumerate(headers, start=1):
                            db_col = COLUMN_MAP.get(h)
                            if db_col and db_col in row:
                                val = row[db_col] or ""
                                # Get current sheet value to avoid unnecessary updates
                                current_sheet_val = sheet.cell(cell.row, i).value or ""
                                
                                if str(val) != str(current_sheet_val):
                                    updates.append({
                                        "range": f"{chr(64+i)}{cell.row}", 
                                        "values": [[str(val)]]
                                    })
                        
                        if updates:
                            sheet.batch_update(updates)
                            log(f"✅ DB→Sheet: Row {row_id} | {len(updates)} field(s) updated")
                    else:
                        log(f"⚠️ DB→Sheet: Row {row_id} not found in sheet")

                    # Mark as synced so we don't pick it up again
                    with engine.begin() as conn:
                        conn.execute(
                            text("UPDATE mytable SET sync_source = 'SYNCED' WHERE id = :id"), 
                            {"id": row_id}
                        )

                except Exception as row_error:
                    log(f"❌ DB→Sheet Row {row_id} Error: {row_error}")
                    # Mark as error to prevent infinite retries
                    with engine.begin() as conn:
                        conn.execute(
                            text("UPDATE mytable SET sync_source = 'ERROR' WHERE id = :id"), 
                            {"id": row_id}
                        )

            await asyncio.sleep(2) # [EDGE CASE] Rate Limits: Throttling requests
            
        except Exception as e:
            if "429" in str(e) or "quota" in str(e).lower():
                log("⏳ Google Quota hit! Sleeping 60s...")
                await asyncio.sleep(60)
            else:
                log(f"❌ DB→Sheet Error: {e}")
                await asyncio.sleep(10)

# ---------------- APP & ROUTES ---------------- #

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(worker_sheet_to_db())
    asyncio.create_task(worker_db_to_sheet())
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.post("/webhook")
async def webhook(request: Request):
    try:
        data = await request.json()
        # [EDGE CASE] Data Loss
        # Pushing to Redis ensures data persists even if the DB worker is busy or crashes
        await redis_client.rpush("queue:sheet_to_db", json.dumps(data))
        return {"status": "queued"}
    except Exception as e:
        log(f"❌ Webhook Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/logs")
def get_logs(): 
    return {"logs": logs}

@app.get("/stats")
async def stats():
    return {
        "queue": await redis_client.llen("queue:sheet_to_db"),
        "logs": len(logs)
    }

@app.post("/execute")
async def execute_query(request: Request):
    try:
        data = await request.json()
        query = data.get("query", "").strip()
        
        if not query:
            return {"error": "Query is empty", "rows_affected": 0}
        
        # [FIX] Auto-mark DB updates so they sync to Sheet
        # If the user is updating mytable and doesn't specify sync_source, set it to 'DB'
        query_upper = query.upper()
        
        if "UPDATE MYTABLE" in query_upper:
            if "SYNC_SOURCE" not in query_upper:
                # Smart injection: Add sync_source after SET
                if " SET " in query_upper:
                    parts = query.split(" SET ", 1)
                    if len(parts) == 2:
                        query = f"{parts[0]} SET sync_source = 'DB', {parts[1]}"
                        log(f"🔍 Auto-injected sync_source='DB' into query")
        
        with engine.begin() as conn:
            result = conn.execute(text(query))
            rows_affected = result.rowcount
            
            if rows_affected > 0:
                log(f"✅ Manual Query: {rows_affected} row(s) affected")
            
            return {
                "message": f"Query executed successfully. {rows_affected} row(s) affected.",
                "rows_affected": rows_affected
            }
            
    except Exception as e:
        error_msg = str(e)
        log(f"❌ Query Error: {error_msg}")
        return {"error": error_msg, "rows_affected": 0}

@app.get("/health")
async def health():
    try:
        # Check DB connection
        with engine.begin() as conn:
            conn.execute(text("SELECT 1"))
        
        # Check Redis connection
        await redis_client.ping()
        
        # Check Sheet connection
        await get_sheet_safe()
        
        return {
            "status": "healthy",
            "database": "connected",
            "redis": "connected",
            "sheets": "connected"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }

@app.post("/test/chaos")
async def test_chaos():
    """Simulate 20 concurrent updates for stress testing"""
    import random
    
    for i in range(1, 21):
        data = {
            "id": str(min(i, 10)),
            "header": "Age",
            "value": str(random.randint(18, 78))
        }
        await redis_client.rpush("queue:sheet_to_db", json.dumps(data))
    
    log("🧪 Chaos test: 20 concurrent updates queued")
    return {"status": "queued", "count": 20}

@app.post("/test/deduplication")
async def test_deduplication():
    """Test deduplication by sending same update 5 times"""
    data = {
        "id": "2",
        "header": "Name",
        "value": "Test Deduplication"
    }
    
    for i in range(5):
        await redis_client.rpush("queue:sheet_to_db", json.dumps(data))
    
    log("🧪 Deduplication test: 5 identical updates queued")
    return {"status": "queued", "count": 5}

@app.get("/test/status")
async def test_status():
    """Get detailed system status for testing"""
    return {
        "queue_depth": await redis_client.llen("queue:sheet_to_db"),
        "recent_logs": logs[:10],
        "workers": "running"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
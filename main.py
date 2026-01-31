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
from collections import defaultdict

from httpx import AsyncClient, ASGITransport # Make sure to import ASGITransport

metrics = defaultdict(int)

logs = []
metrics = defaultdict(int)

app = FastAPI()

load_dotenv()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)




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
                metrics["processed"] += 1   # 👈 ADD HERE
                log(f"✅ Sheet→DB: Row {row_id} | {db_col} = {val}")

        except Exception as e:
            log(f"❌ Sheet→DB Worker Error: {e}")
            await asyncio.sleep(2)


# ---------------- WORKER: DB → SHEET (Smart Sync) ---------------- #
# ---------------- WORKER: DB → SHEET (Smart Sync) ---------------- #

async def worker_db_to_sheet():
    log("🔵 Worker started: DB → Sheet")
    await asyncio.sleep(3) 
    
    while True:
        try:
            # 1. Fetch rows from DB that need syncing
            with engine.begin() as conn:
                rows = conn.execute(text(
                    "SELECT * FROM mytable WHERE sync_source = 'DB' ORDER BY last_updated ASC LIMIT 10"
                )).mappings().all()

            if not rows:
                await asyncio.sleep(2)
                continue

            sheet = await get_sheet_safe()
            headers = sheet.row_values(1)

            # 2. OPTIMIZATION: Fetch ALL IDs from the sheet in ONE call
            # This prevents the 429 Quota Exceeded error
            sheet_ids = sheet.col_values(1) 
            id_map = {str(val).strip(): i + 1 for i, val in enumerate(sheet_ids)}

            updates = []
            synced_ids = []
            error_ids = []

            for row in rows:
                row_id = str(row["id"])
                
                try:
                    # Check if ID exists in our local map (No API call needed here)
                    if row_id in id_map:
                        row_num = id_map[row_id]
                        
                        for i, h in enumerate(headers, start=1):
                            db_col = COLUMN_MAP.get(h)
                            if db_col and db_col in row:
                                val = row[db_col] or ""
                                # We blindly update to save read quota on value checking
                                # or you could cache values, but blind write is safer for quota
                                updates.append({
                                    "range": f"{chr(64+i)}{row_num}", 
                                    "values": [[str(val)]]
                                })
                        
                        synced_ids.append(row_id)
                        log(f"✅ DB→Sheet: Staged update for Row {row_id}")
                    else:
                        log(f"⚠️ DB→Sheet: Row {row_id} not found in sheet")
                        # You might want to handle 'create new row' here logic if needed
                        # For now, mark as synced so we don't loop forever
                        synced_ids.append(row_id) 

                except Exception as row_error:
                    log(f"❌ Error prepping row {row_id}: {row_error}")
                    error_ids.append(row_id)

            # 3. Batch execute all updates to Sheet
            if updates:
                try:
                    sheet.batch_update(updates)
                    log(f"🚀 Batch updated {len(updates)} cells in Google Sheet")
                except Exception as e:
                    log(f"❌ Batch Update Failed: {e}")
                    # If batch fails, we shouldn't mark rows as synced
                    synced_ids = [] 

            # 4. Mark rows as SYNCED in DB
            if synced_ids:
                with engine.begin() as conn:
                    # Use a tuple for IN clause
                    placeholders = ', '.join([':id' + str(i) for i in range(len(synced_ids))])
                    params = {f'id{i}': bid for i, bid in enumerate(synced_ids)}
                    conn.execute(
                        text(f"UPDATE mytable SET sync_source = 'SYNCED' WHERE id IN ({placeholders})"),
                        params
                    )

            if error_ids:
                with engine.begin() as conn:
                    placeholders = ', '.join([':id' + str(i) for i in range(len(error_ids))])
                    params = {f'id{i}': bid for i, bid in enumerate(error_ids)}
                    conn.execute(
                        text(f"UPDATE mytable SET sync_source = 'ERROR' WHERE id IN ({placeholders})"),
                        params
                    )

            await asyncio.sleep(2)

        except Exception as e:
            if "429" in str(e) or "quota" in str(e).lower():
                log("⏳ Google Quota hit! Sleeping 60s...")
                await asyncio.sleep(60)
            else:
                log(f"❌ DB→Sheet Worker Error: {e}")
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

        metrics["webhook_hits"] += 1

        await redis_client.rpush(
            "queue:sheet_to_db",
            json.dumps(data)
        )

        return {"status": "queued"}

    except Exception as e:
        log(f"❌ Webhook Error: {e}")
        raise HTTPException(400, str(e))


@app.get("/logs")
def get_logs(): 
    return {"logs": logs}

@app.get("/metrics")
def metrics_view():
    return dict(metrics)


@app.get("/stats")
async def stats():
    return {
        "queue": await redis_client.llen("queue:sheet_to_db"),
        "logs": len(logs)
    }

@app.get("/metrics")
def metrics_view():
    return dict(metrics)


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
    
@app.get("/metrics")
def metrics_view():
    return dict(metrics)


# ---------------- TESTING ENDPOINTS (DEBUG VERSION) ---------------- #

@app.post("/test/chaos")
async def test_chaos(request: Request):
    log("🔵 DEBUG: /test/chaos endpoint hit!")
    
    try:
        import httpx
    except ImportError:
        log("❌ CRITICAL ERROR: 'httpx' library is not installed!")
        raise HTTPException(status_code=500, detail="Server missing httpx library")

    try:
        # Determine the correct internal URL
        # In production, we can't always trust localhost:8000 to be accessible via httpx
        base_url = "http://127.0.0.1:8000"
        
        log(f"🔵 Starting Chaos Test targeting: {base_url}")
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            tasks = []
            for i in range(20):
                data = {
                    "id": str(i + 100),
                    "header": "Age",
                    "value": str(20 + i)
                }
                tasks.append(client.post(f"{base_url}/webhook", json=data))
            
            # Fire requests
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Count successes vs failures
            success = sum(1 for r in responses if not isinstance(r, Exception) and r.status_code == 200)
            errors = len(responses) - success
            
            log(f"✅ Chaos Result: {success} sent, {errors} failed")
            
            if errors > 0:
                # Log the first error found
                first_err = next((r for r in responses if isinstance(r, Exception) or r.status_code != 200), None)
                log(f"⚠️ Sample Error: {first_err}")

        return {"message": f"Launched 20 requests ({success} success)"}

    except Exception as e:
        log(f"❌ CRASH inside test_chaos: {str(e)}")
        # This print ensures it shows up in Railway logs even if logger fails
        print(f"TRACKBACK: {e}") 
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@app.post("/test/deduplication")
async def test_dedup():
    log("🔵 DEBUG: /test/deduplication endpoint hit!")
    try:
        import httpx
        base_url = "http://127.0.0.1:8000"
        
        data = {"id": "999", "header": "Name", "value": "Duplicate Dave"}

        async with httpx.AsyncClient(timeout=10.0) as client:
            tasks = [client.post(f"{base_url}/webhook", json=data) for _ in range(5)]
            await asyncio.gather(*tasks)

        log("✅ Dedup Test Sent")
        return {"message": "Dedup batch sent"}

    except Exception as e:
        log(f"❌ CRASH inside test_dedup: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/test/status")
async def test_status():
    """Get detailed system status for testing"""
    return {
        "queue_depth": await redis_client.llen("queue:sheet_to_db"),
        "recent_logs": logs[:10],
        "workers": "running"
    }

@app.get("/metrics")
def metrics_view():
    return dict(metrics)

# ---------------- TESTING ENDPOINTS (FIXED FOR DOCKER) ---------------- #
from httpx import AsyncClient, ASGITransport # <--- MAKE SURE THIS IS IMPORTED

@app.post("/test/chaos")
async def test_chaos():
    """Simulates 20 users hitting save at the exact same time (In-Memory)"""
    log("🧪 STARTING CHAOS: Simulating 20 concurrent users (In-Memory)...")
    
    # This bypasses the network port entirely and talks directly to the app
    transport = ASGITransport(app=app)
    
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        tasks = []
        for i in range(20):
            # Create random data
            data = {
                "id": str(i + 1000), 
                "header": "Age",
                "value": str(20 + i)
            }
            # Note: URL is just "/webhook", not "http://localhost:8000/webhook"
            tasks.append(client.post("/webhook", json=data))
        
        # Fire requests in PARALLEL
        responses = await asyncio.gather(*tasks)
        
        success = sum(1 for r in responses if r.status_code == 200)

    return {"message": f"🚀 Chaos launched! {success}/20 requests accepted."}


@app.post("/test/deduplication")
async def test_dedup():
    """Sends the EXACT same payload 10 times rapidly (In-Memory)"""
    log("🧪 STARTING DEDUP TEST: Sending 10 identical requests...")
    
    transport = ASGITransport(app=app)
    
    data = {
        "id": "9999", 
        "header": "Name", 
        "value": "Duplicate Dave" 
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        tasks = [
            client.post("/webhook", json=data)
            for _ in range(10)
        ]
        await asyncio.gather(*tasks)

    return {"message": "🧪 Dedup sent. Check logs for 'Skipped duplicate'."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
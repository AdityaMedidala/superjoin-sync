from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

import asyncio
import gspread
import json
import os
import redis.asyncio as redis

# --- IMPORT HTTPX AT THE TOP ---
from httpx import AsyncClient, ASGITransport

from datetime import datetime
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from collections import defaultdict

# ---------------- CONFIG & MAPPING ---------------- #

load_dotenv()

metrics = defaultdict(int)
logs = []

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

# ---------------- DATABASE & REDIS ---------------- #

engine = create_engine(DB_URL, pool_pre_ping=True, pool_recycle=3600)
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

# ---------------- LOGGING ---------------- #

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

# ---------------- WORKERS ---------------- #

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

            if sheet_header == "SYSTEM":
                log(f"⚠️ {val}")
                continue

            db_col = COLUMN_MAP.get(sheet_header)
            if not db_col or not row_id: continue

            with engine.begin() as conn:
                # Deduplication check
                current_val = conn.execute(
                    text(f"SELECT `{db_col}` FROM mytable WHERE id = :id"),
                    {"id": row_id}
                ).scalar()

                if str(current_val) == str(val):
                    log(f"⏭️ Skipped duplicate: ID {row_id}")
                    continue

                conn.execute(
                    text(f"UPDATE mytable SET `{db_col}` = :val, sync_source = 'SHEET', last_updated = NOW() WHERE id = :id"),
                    {"val": val, "id": row_id}
                )
                metrics["processed"] += 1
                log(f"✅ Sheet→DB: Row {row_id} | {db_col} = {val}")

        except Exception as e:
            log(f"❌ Sheet→DB Worker Error: {e}")
            await asyncio.sleep(2)


async def worker_db_to_sheet():
    log("🔵 Worker started: DB → Sheet")
    await asyncio.sleep(3)
    
    while True:
        try:
            with engine.begin() as conn:
                rows = conn.execute(text(
                    "SELECT * FROM mytable WHERE sync_source = 'DB' ORDER BY last_updated ASC LIMIT 10"
                )).mappings().all()

            if not rows:
                await asyncio.sleep(2)
                continue

            sheet = await get_sheet_safe()
            headers = sheet.row_values(1)
            sheet_ids = sheet.col_values(1)
            id_map = {str(val).strip(): i + 1 for i, val in enumerate(sheet_ids)}

            updates = []
            synced_ids = []

            for row in rows:
                row_id = str(row["id"])
                if row_id in id_map:
                    row_num = id_map[row_id]
                    for i, h in enumerate(headers, start=1):
                        db_col = COLUMN_MAP.get(h)
                        if db_col and db_col in row:
                            val = row[db_col] or ""
                            updates.append({
                                "range": f"{chr(64+i)}{row_num}",
                                "values": [[str(val)]]
                            })
                    synced_ids.append(row_id)
                    log(f"✅ DB→Sheet: Staged update for Row {row_id}")

            if updates:
                sheet.batch_update(updates)
                log(f"🚀 Batch updated {len(updates)} cells")

            if synced_ids:
                with engine.begin() as conn:
                    placeholders = ', '.join([':id' + str(i) for i in range(len(synced_ids))])
                    params = {f'id{i}': bid for i, bid in enumerate(synced_ids)}
                    conn.execute(
                        text(f"UPDATE mytable SET sync_source = 'SYNCED' WHERE id IN ({placeholders})"),
                        params
                    )

            await asyncio.sleep(2)

        except Exception as e:
            if "429" in str(e):
                log("⏳ Google Quota hit! Sleeping 60s...")
                await asyncio.sleep(60)
            else:
                log(f"❌ DB→Sheet Worker Error: {e}")
                await asyncio.sleep(10)

# ---------------- APP LIFECYCLE ---------------- #

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(worker_sheet_to_db())
    asyncio.create_task(worker_db_to_sheet())
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- ROUTES ---------------- #

@app.post("/webhook")
async def webhook(request: Request):
    try:
        data = await request.json()
        metrics["webhook_hits"] += 1
        await redis_client.rpush("queue:sheet_to_db", json.dumps(data))
        log(f"📥 Webhook received: ID {data.get('id')}")
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

@app.post("/execute")
async def execute_query(request: Request):
    try:
        data = await request.json()
        query = data.get("query", "").strip()
        
        # Auto-inject sync_source='DB'
        if "UPDATE" in query.upper() and "SET" in query.upper() and "SYNC_SOURCE" not in query.upper():
            parts = query.split("SET", 1) # Case insensitive split is harder in pure python, assuming standard casing or fixing simple ones
            # Simple replacement for demonstration
            query = query.replace("SET", "SET sync_source = 'DB',", 1)
            log("🔍 Auto-injected sync_source='DB'")

        with engine.begin() as conn:
            result = conn.execute(text(query))
            return {"message": f"Query executed. Rows affected: {result.rowcount}"}
            
    except Exception as e:
        log(f"❌ Query Error: {e}")
        return {"error": str(e)}

# ---------------- ROBUST TESTING ENDPOINTS (IN-MEMORY) ---------------- #

@app.post("/test/chaos")
async def test_chaos():
    """Simulates 20 users hitting save at the exact same time (In-Memory)"""
    log("🧪 STARTING CHAOS: Simulating 20 concurrent users (In-Memory)...")
    
    # 1. Use ASGITransport to bypass network/localhost issues
    transport = ASGITransport(app=app)
    
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        tasks = []
        for i in range(20):
            data = {
                "id": str(i + 1000), 
                "header": "Age",
                "value": str(20 + i)
            }
            # 2. Call the app directly, no TCP connection needed
            tasks.append(client.post("/webhook", json=data))
        
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
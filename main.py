from fastapi import FastAPI, Request
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

# IMPORTANT: Define how Sheet Headers map to your DB Columns
# "Sheet Header Name": "Database Column Name"
COLUMN_MAP = {
    "Name": "Name", # Ensure this matches your DB (setup.py uses "Name")
    "Email": "Email",
    "Age": "Age",    # <--- ADD THIS LINE
    "City": "City",
    "Status": "status"
}

# ---------------- DATABASE & REDIS ---------------- #

engine = create_engine(DB_URL)
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

# ---------------- LOGGING ---------------- #

logs = []

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    msg = f"[{ts}] {msg}"
    print(msg)
    logs.insert(0, msg)
    if len(logs) > 50: logs.pop()

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

# ---------------- WORKER: SHEET → DB (Queue Consumer) ---------------- #

async def worker_sheet_to_db():
    log("🔵 Worker started: Sheet → DB")
    while True:
        try:
            # blpop removes the item from Redis to prevent a "stuck" queue
            item = await redis_client.blpop("queue:sheet_to_db", timeout=1)
            
            if not item:
                continue

            data = json.loads(item[1])
            row_id = data.get("id")
            sheet_header = data.get("header")
            val = data.get("value")

            # Translate Sheet header to DB column using our MAP
            db_col = COLUMN_MAP.get(sheet_header)

            if not db_col or not row_id:
                log(f"⏭️ Ignored: No mapping for '{sheet_header}'")
                continue

            with engine.begin() as conn:
                # Update DB and mark source to prevent infinite sync loops
                conn.execute(
                    text(f"UPDATE mytable SET `{db_col}` = :val, sync_source = 'SHEET', last_updated = NOW() WHERE id = :id"),
                    {"val": val, "id": row_id}
                )
                log(f"✅ Sheet→DB: Row {row_id} | {db_col} = {val}")

        except Exception as e:
            log(f"❌ Sheet→DB Worker Error: {e}")
            await asyncio.sleep(2) # Backoff on error

# ---------------- WORKER: DB → SHEET ---------------- #

async def worker_db_to_sheet():
    log("🔵 Worker started: DB → Sheet (Smart Sync)")
    while True:
        try:
            sheet = await get_sheet_safe()
            headers = sheet.row_values(1) 

            # Fetch rows marked as needing sync
            with engine.begin() as conn:
                rows = conn.execute(text("SELECT * FROM mytable WHERE sync_source IN ('DB','SHEET') LIMIT 5")).mappings().all()

            for row in rows:
                row_id = row["id"]
                cell = sheet.find(str(row_id), in_column=1)

                if cell:
                    updates = []
                    for i, h in enumerate(headers, start=1):
                        db_col = COLUMN_MAP.get(h)
                        if db_col in row:
                            val = row[db_col] or ""
                            updates.append({"range": f"{chr(64+i)}{cell.row}", "values": [[str(val)]]})
                    
                    if updates:
                        sheet.batch_update(updates)
                        log(f"✅ DB→Sheet Sync: Row {row_id}")

                # Mark as fully synced
                with engine.begin() as conn:
                    conn.execute(text("UPDATE mytable SET sync_source = 'SYNCED' WHERE id = :id"), {"id": row_id})

            await asyncio.sleep(5) # Poll every 5 seconds
        except Exception as e:
            if "429" in str(e):
                log("⏳ Google Quota hit! Sleeping 60s...")
                await asyncio.sleep(60)
            else:
                log(f"❌ DB→Sheet Error: {e}")
                await asyncio.sleep(10)

# ---------------- APP & ROUTES ---------------- #

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background workers
    asyncio.create_task(worker_sheet_to_db())
    asyncio.create_task(worker_db_to_sheet())
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.post("/webhook")
async def webhook(request: Request):
    data = await request.json()
    await redis_client.rpush("queue:sheet_to_db", json.dumps(data))
    return {"status": "queued"}

@app.get("/logs")
def get_logs(): return {"logs": logs}

@app.get("/stats")
async def stats():
    return {
        "queue": await redis_client.llen("queue:sheet_to_db"),
        "logs": len(logs)
    }

@app.post("/execute")
async def execute_query(request: Request):
    data = await request.json()
    query = data.get("query", "")
    with engine.begin() as conn:
        result = conn.execute(text(query))
        return {"rows_affected": result.rowcount}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
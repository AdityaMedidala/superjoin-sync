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


# ---------------- CONFIG ---------------- #

DB_URL = os.getenv("MYSQL_URL")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
SHEET_ID = os.getenv(
    "SHEET_ID",
    "1bM61VLxcWdg3HaNgc2RkPLL-hm2S-BJ6Jo9lX4Qv1ks"
)

if not DB_URL:
    raise RuntimeError("❌ MYSQL_URL not set")


# ---------------- DATABASE ---------------- #

engine = create_engine(DB_URL)


# ---------------- REDIS ---------------- #

redis_client = redis.from_url(REDIS_URL, decode_responses=True)


# ---------------- LOGGING ---------------- #

logs = []


def log(msg):

    ts = datetime.now().strftime("%H:%M:%S")
    msg = f"[{ts}] {msg}"

    print(msg)

    logs.insert(0, msg)

    if len(logs) > 50:
        logs.pop()


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

    if _sheet:
        return _sheet

    async with _sheet_lock:

        if _sheet:
            return _sheet

        delay = 5

        for i in range(5):

            try:

                sh = _create_sheet()

                _sheet = sh

                log("✅ Connected to Google Sheets")

                return sh

            except Exception as e:

                if "429" in str(e):

                    log(f"⏳ Sheet quota hit, retry in {delay}s...")

                    await asyncio.sleep(delay)

                    delay *= 2

                else:
                    raise

        raise RuntimeError("❌ Could not connect to Google Sheets")


# ---------------- HELPERS ---------------- #

async def get_headers():

    sheet = await get_sheet_safe()

    return sheet.row_values(1)


# ---------------- WORKER: SHEET → DB ---------------- #

async def worker_sheet_to_db():

    log("🔵 Worker started: Sheet → DB")

    while True:

        try:

            item = await redis_client.blpop(
                "queue:sheet_to_db",
                timeout=1
            )

            if not item:
                await asyncio.sleep(0.5)
                continue

            data = json.loads(item[1])

            row_id = data.get("id")
            col = data.get("header")
            val = data.get("value")

            if not row_id or col == "id":
                continue


            with engine.begin() as conn:

                current = conn.execute(
                    text(f"""
                        SELECT `{col}`
                        FROM mytable
                        WHERE id = :id
                    """),
                    {"id": row_id}
                ).scalar()


                if str(current) == str(val):
                    log(f"⏭️ Skip duplicate {row_id}")
                    continue


                conn.execute(
                    text(f"""
                        UPDATE mytable
                        SET `{col}` = :val,
                            sync_source = 'SHEET',
                            last_updated = NOW()
                        WHERE id = :id
                    """),
                    {"val": val, "id": row_id}
                )


                log(f"✅ Sheet→DB: {row_id} {col}={val}")


        except Exception as e:

            log(f"❌ Sheet→DB error: {e}")

            await asyncio.sleep(2)


# ---------------- WORKER: DB → SHEET (SAFE MODE) ---------------- #

async def worker_db_to_sheet():
    log("🔵 Worker started: DB → Sheet (SAFE MODE)")
    
    # Initial pause to let startup settle
    await asyncio.sleep(5)

    while True:
        try:
            # 1. Fetch headers (Cached if possible to save reads)
            try:
                sheet = await get_sheet_safe()
                headers = await get_headers()
            except Exception as e:
                log(f"⚠️ Header fetch failed: {e}")
                await asyncio.sleep(60) # Long sleep on API failure
                continue

            cols = ", ".join(f"`{h}`" for h in headers)

            # 2. Get rows that need syncing
            with engine.begin() as conn:
                rows = conn.execute(text(f"""
                    SELECT {cols}
                    FROM mytable
                    WHERE sync_source IN ('DB','SHEET')
                    ORDER BY last_updated
                    LIMIT 5 
                """)).mappings().all()

            if not rows:
                await asyncio.sleep(10) # No work? Sleep 10s
                continue

            # 3. Process rows ONE BY ONE with delays
            for row in rows:
                row_id = row["id"]
                try:
                    # Find cell
                    cell = sheet.find(str(row_id), in_column=1)
                    
                    # *** CRITICAL: SLEEP AFTER READ ***
                    await asyncio.sleep(2) 

                    if not cell:
                        continue

                    updates = []
                    for i, h in enumerate(headers, start=1):
                        if h in row:
                            updates.append({
                                "range": f"{chr(64+i)}{cell.row}",
                                "values": [[row[h]]]
                            })

                    if updates:
                        sheet.batch_update(updates)
                        
                        # *** CRITICAL: SLEEP AFTER WRITE ***
                        await asyncio.sleep(2)

                        # Mark as synced in DB
                        with engine.begin() as conn:
                            conn.execute(text("""
                                UPDATE mytable
                                SET sync_source = 'SYNCED'
                                WHERE id = :id
                            """), {"id": row_id})

                        log(f"✅ DB→Sheet: {row_id}")

                except Exception as e:
                    if "429" in str(e):
                        log(f"⏳ Quota Hit! Sleeping 60s...")
                        await asyncio.sleep(60)
                    else:
                        log(f"⚠️ Error {row_id}: {e}")

        except Exception as e:
            log(f"❌ Worker Error: {e}")
            await asyncio.sleep(30)
            
# ---------------- FASTAPI LIFESPAN ---------------- #

@asynccontextmanager
async def lifespan(app: FastAPI):

    log("🚀 Superjoin Sync Started")

    asyncio.create_task(worker_sheet_to_db())
    asyncio.create_task(worker_db_to_sheet())

    yield

    log("🛑 Shutting down")


# ---------------- APP ---------------- #

app = FastAPI(lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------- ROUTES ---------------- #

@app.post("/webhook")
async def webhook(request: Request):

    data = await request.json()

    await redis_client.rpush(
        "queue:sheet_to_db",
        json.dumps(data)
    )

    size = await redis_client.llen("queue:sheet_to_db")

    log(f"📥 Queued {data.get('id')} ({size})")

    return {"status": "ok", "queue": size}


@app.get("/")
def home():

    return {
        "status": "running",
        "service": "Superjoin Sync (2-Way)"
    }


@app.get("/logs")
def get_logs():

    return {"logs": logs}


@app.get("/stats")
async def stats():

    return {
        "queue": await redis_client.llen("queue:sheet_to_db"),
        "logs": len(logs)
    }


# ---------------- MAIN ---------------- #

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000))
    )

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


# ---------------- GOOGLE SHEETS ---------------- #

def get_sheet():

    if os.getenv("RAILWAY_ENVIRONMENT"):
        creds = json.loads(os.getenv("GOOGLE_CREDENTIALS_JSON"))
        gc = gspread.service_account_from_dict(creds)

    else:
        gc = gspread.service_account("superjoin-test.json")

    return gc.open_by_key(SHEET_ID).sheet1


sh = get_sheet()


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


# ---------------- HELPERS ---------------- #

def get_headers():
    return sh.row_values(1)


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
                await asyncio.sleep(0.2)
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
            await asyncio.sleep(1)


# ---------------- WORKER: DB → SHEET ---------------- #

async def worker_db_to_sheet():

    log("🔵 Worker started: DB → Sheet")

    while True:

        try:

            headers = get_headers()

            cols = ", ".join(f"`{h}`" for h in headers)


            with engine.begin() as conn:

                rows = conn.execute(text(f"""
                    SELECT {cols}
                    FROM mytable
                    WHERE sync_source IN ('DB','SHEET')
                    ORDER BY last_updated
                    LIMIT 20
                """)).mappings().all()


                if not rows:
                    await asyncio.sleep(1)
                    continue


                for row in rows:

                    row_id = row["id"]

                    try:
                        cell = sh.find(str(row_id), in_column=1)

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

                            sh.batch_update(updates)


                            conn.execute(text("""
                                UPDATE mytable
                                SET sync_source = 'SYNCED'
                                WHERE id = :id
                            """), {"id": row_id})


                            log(f"✅ DB→Sheet: {row_id}")


                    except Exception as e:
                        if "CellNotFound" in str(e):
                            log(f"⚠️ Row {row_id} missing in Sheet")
                        else:
                            raise


        except Exception as e:

            log(f"❌ DB→Sheet error: {e}")


        await asyncio.sleep(1)


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

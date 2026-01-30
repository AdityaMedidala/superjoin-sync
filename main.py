from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import gspread
from sqlalchemy import create_engine, text
import uvicorn
import asyncio
import os
import json
from datetime import datetime

app = FastAPI()

# Enable CORS (So your React Dashboard can talk to this later)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIG (SECURE) ---
# 1. Get DB URL from Environment Variable (Safe!)
DB_URL = os.getenv("DB_URL") 
if not DB_URL:
    print("⚠️ WARNING: DB_URL not found. App will crash.")

# 2. Google Auth (Cloud vs Local)
if os.getenv("RAILWAY_ENVIRONMENT"): 
    creds_json = os.getenv("GOOGLE_CREDENTIALS_JSON")
    creds_dict = json.loads(creds_json)
    gc = gspread.service_account_from_dict(creds_dict)
else:
    # Local Fallback
    gc = gspread.service_account(filename='superjoin-test.json')

# 3. Hardcoded Sheet ID (Okay for demo, but better as Env Var)
SHEET_ID = "1bM61VLxcWdg3HaNgc2RkPLL-hm2S-BJ6Jo9lX4Qv1ks" 
sh = gc.open_by_key(SHEET_ID).sheet1
engine = create_engine(DB_URL)

# Store logs for the Dashboard
recent_logs = []

def log_msg(msg):
    timestamp = datetime.now().strftime("%H:%M:%S")
    full_msg = f"[{timestamp}] {msg}"
    print(full_msg)
    recent_logs.insert(0, full_msg) # Add to top of list
    if len(recent_logs) > 50: recent_logs.pop() # Keep last 50

# --- WEBHOOK (Sheet -> DB) ---
@app.post("/webhook")
async def handle_sheet_update(request: Request):
    try:
        data = await request.json()
        row_id = data.get("id")
        col = data.get("header")
        val = data.get("value")
        
        # Validations
        if not row_id or row_id == "id": return {"status": "ignored"}

        # Update DB with 'sync_source' to prevent loops
        # Ensure your DB table has a column 'sync_source' (VARCHAR)
        query = text(f"UPDATE mytable SET {col} = :val, sync_source = 'SHEET' WHERE id = :id")
        
        with engine.connect() as conn:
            conn.execute(query, {"val": val, "id": row_id})
            conn.commit()
            
        log_msg(f"✅ Sheet -> DB: Updated ID {row_id} ({col} = {val})")
        return {"status": "success"}
    except Exception as e:
        log_msg(f"❌ Error in Webhook: {str(e)}")
        return {"error": str(e)}

# --- POLLER (DB -> Sheet) ---
# "Technical Depth": We run this in a separate thread so it doesn't block the API
def sync_db_to_sheet():
    try:
        with engine.connect() as conn:
            # Find rows changed by 'DB' (or anyone NOT the sheet) recently
            # NOTE: You must update your SQL table to have 'sync_source' and 'last_updated'
            query = text("SELECT * FROM mytable WHERE sync_source != 'SHEET' AND last_updated > NOW() - INTERVAL 5 SECOND")
            result = conn.execute(query)
            rows = result.mappings().all()

            for row in rows:
                # Find the row in Google Sheet by ID (Column 1)
                try:
                    cell = sh.find(str(row['id']), in_column=1)
                    if cell:
                        # Update Name (Col 2) - Expand this logic for other columns if needed
                        sh.update_cell(cell.row, 2, row['Name'])
                        
                        # Mark as synced so we don't loop
                        conn.execute(text("UPDATE mytable SET sync_source = 'SYNCED' WHERE id = :id"), {"id": row['id']})
                        conn.commit()
                        
                        log_msg(f"🔄 DB -> Sheet: Updated ID {row['id']}")
                except gspread.exceptions.CellNotFound:
                    log_msg(f"⚠️ Row {row['id']} not found in Sheet")
                    
    except Exception as e:
        print(f"Poller Error: {e}")

async def db_poller_loop():
    loop = asyncio.get_running_loop()
    while True:
        # Run the slow Google API call in a thread pool (Non-blocking!)
        await loop.run_in_executor(None, sync_db_to_sheet)
        await asyncio.sleep(3)

@app.on_event("startup")
async def start_poller():
    asyncio.create_task(db_poller_loop())

# --- DASHBOARD ENDPOINTS ---
@app.get("/")
def health_check():
    return {"status": "active", "service": "Superjoin Sync Engine"}

@app.get("/logs")
def get_logs():
    return {"logs": recent_logs}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
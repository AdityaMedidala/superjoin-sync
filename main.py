from fastapi import FastAPI, Request
import gspread
from sqlalchemy import create_engine, text
import uvicorn
import asyncio
import os

app = FastAPI()

# --- CONFIG ---
# USE THE SAME URL AS BEFORE
DB_URL = "mysql+pymysql://root:anySCUfFMwIbojPKJrVCQlBfyVPVRcSD@gondola.proxy.rlwy.net:43787/railway"
SHEET_ID = "1bM61VLxcWdg3HaNgc2RkPLL-hm2S-BJ6Jo9lX4Qv1ks"
JSON_KEYFILE = "superjoin-test.json"

engine = create_engine(DB_URL)
gc = gspread.service_account(filename=JSON_KEYFILE)
sh = gc.open_by_key(SHEET_ID).sheet1

last_processed = {}

# --- WEBHOOK (Sheet -> DB) ---
@app.post("/webhook")
async def handle_sheet_update(request: Request):
    data = await request.json()
    row_id = data.get("id")
    col = data.get("header")
    val = data.get("value")
    
    if last_processed.get(str(row_id)) == str(val):
        return {"status": "skipped"}

    # Update DB
    query = text(f"UPDATE mytable SET {col} = :val, sync_source = 'SHEET' WHERE id = :id")
    with engine.connect() as conn:
        conn.execute(query, {"val": val, "id": row_id})
        conn.commit()
        
    print(f"✅ Sheet -> DB: Updated Row {row_id}")
    return {"status": "success"}

# --- POLLER (DB -> Sheet) ---
async def db_poller():
    while True:
        try:
            with engine.connect() as conn:
                # Find rows changed by DB in last 3 seconds
                query = text("SELECT * FROM mytable WHERE sync_source = 'DB' AND last_updated > NOW() - INTERVAL 3 SECOND")
                result = conn.execute(query)
                rows = result.mappings().all()

                for row in rows:
                    cell = sh.find(str(row['id']), in_column=1)
                    if cell:
                        # Update the specific cell to avoid overwriting user edits
                        # We need to know which column changed. 
                        # For this simple demo, we will just update the 'Name' column (Col B)
                        # TO MAKE THIS DYNAMIC: You would map column names to letters.
                        # For now, let's assume we are just syncing the 2nd column (Name)
                        # Modify this line based on what data you are testing!
                        
                        sh.update_cell(cell.row, 2, row['Name']) # Update Col 2
                        
                        last_processed[str(row['id'])] = str(row['Name'])
                        print(f"🔄 DB -> Sheet: Updated ID {row['id']}")

        except Exception as e:
            pass # Silent fail for polling to keep loop alive
        
        await asyncio.sleep(3)

@app.on_event("startup")
async def start_poller():
    asyncio.create_task(db_poller())

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
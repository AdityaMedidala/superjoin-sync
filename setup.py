import gspread
import pandas as pd
from sqlalchemy import create_engine, text
import os
import json

# --- CONFIGURATION ---
# SECURE: Read from Environment Variable or use a placeholder for the reviewer
DB_URL = os.getenv("DB_URL", "mysql+pymysql://user:pass@host:port/db")

# --- SETUP LOGIC ---
def setup_db_from_sheet():
    print("🔵 Connecting to Google Sheets...")
    
    # Handle Auth safely
    if os.getenv("RAILWAY_ENVIRONMENT"):
        creds_dict = json.loads(os.getenv("GOOGLE_CREDENTIALS_JSON"))
        gc = gspread.service_account_from_dict(creds_dict)
    else:
        # Fallback for local testing
        if os.path.exists("superjoin-test.json"):
            gc = gspread.service_account(filename="superjoin-test.json")
        else:
            print("❌ No credentials found. Skipped.")
            return

    # Open Sheet
    # Note: For the assignment, you can leave the ID or move it to Env vars too
    SHEET_ID = "1bM61VLxcWdg3HaNgc2RkPLL-hm2S-BJ6Jo9lX4Qv1ks"
    try:
        sh = gc.open_by_key(SHEET_ID).sheet1
    except Exception as e:
        print(f"❌ Could not open sheet: {e}")
        return
    
    # Get all data
    data = sh.get_all_records()
    df = pd.DataFrame(data)
    
    if df.empty:
        print("❌ Error: Sheet is empty.")
        return

    print(f"✅ Found columns: {df.columns.tolist()}")

    print("🔵 Connecting to Railway MySQL...")
    try:
        engine = create_engine(DB_URL)
        
        # Create/Reset the table
        print("⚠️  WARNING: Overwriting table 'mytable'...")
        df.to_sql('mytable', con=engine, if_exists='replace', index=False)
        
        # Add magic columns for sync
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE mytable ADD COLUMN last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"))
            conn.execute(text("ALTER TABLE mytable ADD COLUMN sync_source VARCHAR(50) DEFAULT 'DB'"))
            conn.commit()
            print("✅ Database Reset & Seeded Successfully!")
            
    except Exception as e:
        print(f"❌ Database Error: {e}")

if __name__ == "__main__":
    # Safety check to prevent accidental runs
    confirm = input("⚠️  This will WIPE the database. Type 'yes' to continue: ")
    if confirm == "yes":
        setup_db_from_sheet()
    else:
        print("Cancelled.")
import gspread
import pandas as pd
from sqlalchemy import create_engine, text

# --- 1. CONFIGURATION ---
# PASTE YOUR RAILWAY URL BELOW
# IMPORTANT: Change 'mysql://' to 'mysql+pymysql://' at the start!
DB_URL = "mysql+pymysql://root:anySCUfFMwIbojPKJrVCQlBfyVPVRcSD@gondola.proxy.rlwy.net:43787/railway" 

# PASTE YOUR GOOGLE SHEET ID (Get it from the browser URL of your sheet)
SHEET_ID = "1bM61VLxcWdg3HaNgc2RkPLL-hm2S-BJ6Jo9lX4Qv1ks"

# --- 2. THE SETUP LOGIC ---
def setup_db_from_sheet():
    print("🔵 Connecting to Google Sheets...")
    # Make sure service_account.json is in the same folder
    gc = gspread.service_account(filename="superjoin-test.json")
    sh = gc.open_by_key(SHEET_ID).sheet1
    
    # Get all data
    data = sh.get_all_records()
    df = pd.DataFrame(data)
    
    if df.empty:
        print("❌ Error: Your Sheet is empty! Add headers (Row 1) and one row of data.")
        return

    print(f"✅ Found columns: {df.columns.tolist()}")

    print("🔵 Connecting to Railway MySQL...")
    engine = create_engine(DB_URL)
    
    # Create the table "mytable" automatically
    print("🔵 Creating table in Database...")
    df.to_sql('mytable', con=engine, if_exists='replace', index=False)
    
    # Add the magic columns for syncing
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE mytable ADD COLUMN last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"))
            conn.execute(text("ALTER TABLE mytable ADD COLUMN sync_source VARCHAR(50) DEFAULT 'DB'"))
            conn.commit()
            print("✅ Database Setup Complete! Table 'mytable' is ready.")
        except Exception as e:
            print(f"⚠️ Note: {e}")

if __name__ == "__main__":
    setup_db_from_sheet()
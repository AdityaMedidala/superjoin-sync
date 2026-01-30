import os
import json
import argparse

import pandas as pd
import gspread
from faker import Faker
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()


# ---------------- CONFIG ---------------- #

DB_URL = os.getenv("MYSQL_URL")

if not DB_URL:
    raise RuntimeError("❌ MYSQL_URL is not set in environment variables")


SHEET_ID = os.getenv(
    "SHEET_ID",
    "1bM61VLxcWdg3HaNgc2RkPLL-hm2S-BJ6Jo9lX4Qv1ks"
)


fake = Faker()


# ---------------- HELPERS ---------------- #

def get_sheet_client():

    if os.getenv("RAILWAY_ENVIRONMENT"):
        creds = json.loads(os.getenv("GOOGLE_CREDENTIALS_JSON"))
        return gspread.service_account_from_dict(creds)

    if os.path.exists("superjoin-test.json"):
        return gspread.service_account("superjoin-test.json")

    raise RuntimeError("❌ Google credentials not found")


def generate_fake_data(n=50):

    rows = []

    for i in range(n):
        rows.append({
            "id": i + 1,
            "Name": fake.name(),
            "Email": fake.email(),
            "Age": fake.random_int(22, 65),
            "City": fake.city()
        })

    return pd.DataFrame(rows)


def load_from_sheet():

    print("🔵 Connecting to Google Sheets...")

    gc = get_sheet_client()
    sh = gc.open_by_key(SHEET_ID).sheet1

    data = sh.get_all_records()

    if not data:
        raise RuntimeError("❌ Sheet is empty")

    df = pd.DataFrame(data)

    print(f"✅ Found columns: {df.columns.tolist()}")

    return df


def reset_and_seed(df):

    print("🔵 Connecting to MySQL...")

    engine = create_engine(DB_URL)

    print("⚠️  Resetting table: mytable")

    df.to_sql(
        "mytable",
        con=engine,
        if_exists="replace",
        index=False
    )

    with engine.begin() as conn:

        conn.execute(text("""
            ALTER TABLE mytable
            ADD COLUMN last_updated TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP
            ON UPDATE CURRENT_TIMESTAMP
        """))

        conn.execute(text("""
            ALTER TABLE mytable
            ADD COLUMN sync_source VARCHAR(50)
            DEFAULT 'DB'
        """))

    print("✅ Database seeded successfully")


# ---------------- MAIN ---------------- #

def main():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--generate",
        action="store_true",
        help="Generate fake data using Faker"
    )

    parser.add_argument(
        "--sheet",
        action="store_true",
        help="Load data from Google Sheet"
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow destructive reset"
    )

    parser.add_argument(
        "--rows",
        type=int,
        default=50,
        help="Number of fake rows (default 50)"
    )

    args = parser.parse_args()


    if not args.force:
        print("❌ Use --force to confirm destructive reset")
        return


    if not args.generate and not args.sheet:
        print("❌ Use either --generate or --sheet")
        return


    if args.generate:

        print(f"🚀 Generating {args.rows} fake users...")

        df = generate_fake_data(args.rows)


    elif args.sheet:

        df = load_from_sheet()


    confirm = input("⚠️  This will WIPE the database. Type 'yes' to continue: ")

    if confirm != "yes":
        print("Cancelled.")
        return


    reset_and_seed(df)


if __name__ == "__main__":
    main()

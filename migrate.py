import os
from sqlalchemy import create_engine, text, inspect
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("MYSQL_URL")

if not DB_URL:
    raise RuntimeError("❌ MYSQL_URL is not set in environment variables")

print("🔧 Starting database migration...")
engine = create_engine(DB_URL)

def column_exists(engine, table_name, column_name):
    """Check if a column exists in a table"""
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns

def migrate():
    with engine.begin() as conn:
        # Check if columns already exist
        has_sync_source = column_exists(engine, 'mytable', 'sync_source')
        has_last_updated = column_exists(engine, 'mytable', 'last_updated')
        
        if has_sync_source and has_last_updated:
            print("✅ Database already has required columns!")
            return
        
        # Add last_updated column if it doesn't exist
        if not has_last_updated:
            print("📝 Adding 'last_updated' column...")
            try:
                conn.execute(text("""
                    ALTER TABLE mytable
                    ADD COLUMN last_updated TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP
                """))
                print("✅ Added 'last_updated' column")
            except Exception as e:
                if "Duplicate column name" in str(e):
                    print("⏭️  'last_updated' column already exists")
                else:
                    raise
        
        # Add sync_source column if it doesn't exist
        if not has_sync_source:
            print("📝 Adding 'sync_source' column...")
            try:
                conn.execute(text("""
                    ALTER TABLE mytable
                    ADD COLUMN sync_source VARCHAR(50)
                    DEFAULT 'DB'
                """))
                print("✅ Added 'sync_source' column")
            except Exception as e:
                if "Duplicate column name" in str(e):
                    print("⏭️  'sync_source' column already exists")
                else:
                    raise
        
        # Set all existing rows to 'SYNCED' to avoid triggering immediate sync
        print("📝 Initializing existing rows...")
        result = conn.execute(text("""
            UPDATE mytable 
            SET sync_source = 'SYNCED' 
            WHERE sync_source IS NULL OR sync_source = ''
        """))
        print(f"✅ Initialized {result.rowcount} existing rows")
        
    print("\n🎉 Migration complete!")
    print("\n📋 Next steps:")
    print("1. Restart your FastAPI backend (python main.py)")
    print("2. Try your query: UPDATE mytable SET Age = Age + 1 WHERE id = 1;")
    print("3. Watch the dashboard - you should see DB→Sheet sync!")

if __name__ == "__main__":
    try:
        migrate()
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        print("\nIf you see 'table doesn't exist', run setup.py first:")
        print("  python setup.py --generate --rows 50 --force")
import os
from pathlib import Path

# Base Directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file if python-dotenv is available or parse simply
env_path = BASE_DIR / ".env"
if env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except ImportError:
        # Fallback simple env parser
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())

# IBKR Configuration
IBKR_TOKEN = os.getenv("IBKR_TOKEN", "").strip()
IBKR_QUERY_ID = os.getenv("IBKR_QUERY_ID", "").strip()


# Server Configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Display Settings
CURRENCY_SYMBOL = os.getenv("CURRENCY_SYMBOL", "€")

# Database Path
DB_PATH = BASE_DIR / os.getenv("DB_PATH", "data/journal.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


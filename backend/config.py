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

# Market & Schedule Settings
MARKET_TIMEZONE = os.getenv("MARKET_TIMEZONE", "Europe/Madrid")
MARKET_OPEN_HOUR = int(os.getenv("MARKET_OPEN_HOUR", "9"))
MARKET_OPEN_MINUTE = int(os.getenv("MARKET_OPEN_MINUTE", "0"))
MARKET_CLOSE_HOUR = int(os.getenv("MARKET_CLOSE_HOUR", "22"))
MARKET_CLOSE_MINUTE = int(os.getenv("MARKET_CLOSE_MINUTE", "0"))

SYNC_INTERVAL_MINUTES = int(os.getenv("SYNC_INTERVAL_MINUTES", "60"))
SYNC_COOLDOWN_SECONDS = int(os.getenv("SYNC_COOLDOWN_SECONDS", "600"))

# Display Settings
CURRENCY_SYMBOL = os.getenv("CURRENCY_SYMBOL", "€")

# Database Path
DB_PATH = BASE_DIR / os.getenv("DB_PATH", "data/journal.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

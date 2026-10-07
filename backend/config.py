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
# Query for real-time intraday trade executions (Trade Confirmation Flex Query)
IBKR_TRADE_QUERY_ID = os.getenv("IBKR_TRADE_QUERY_ID", "").strip()
# Query for daily activity consolidation & cash movements (Activity Flex Query)
IBKR_ACTIVITY_QUERY_ID = os.getenv("IBKR_ACTIVITY_QUERY_ID", "").strip()
# Legacy fallback if only IBKR_QUERY_ID is defined
_legacy_id = os.getenv("IBKR_QUERY_ID", "").strip()
if _legacy_id and not IBKR_TRADE_QUERY_ID and not IBKR_ACTIVITY_QUERY_ID:
    IBKR_TRADE_QUERY_ID = _legacy_id
IBKR_QUERY_ID = IBKR_TRADE_QUERY_ID or IBKR_ACTIVITY_QUERY_ID or _legacy_id


def is_ibkr_configured() -> bool:
    """Returns True only if IBKR_TOKEN and at least one query ID are non-empty and not default placeholders."""
    if not IBKR_TOKEN:
        return False
    placeholders = {
        "your_ibkr_flex_token_here",
        "your_flex_query_id_here",
        "your_trade_query_id_here",
        "your_activity_query_id_here",
        "your_token",
        "your_query_id",
        "xxx",
        "changeme",
    }
    if IBKR_TOKEN.lower() in placeholders:
        return False
    if IBKR_TRADE_QUERY_ID and IBKR_TRADE_QUERY_ID.lower() not in placeholders:
        return True
    if IBKR_ACTIVITY_QUERY_ID and IBKR_ACTIVITY_QUERY_ID.lower() not in placeholders:
        return True
    return False


# Environment & Debug Mode
ENVIRONMENT = os.getenv("ENVIRONMENT", os.getenv("ENV", "prod")).strip().lower()
DEBUG = os.getenv("DEBUG", "false").strip().lower() in ("true", "1", "yes")


def is_production() -> bool:
    """
    Returns True if running in production mode.
    In 'dev', 'development', or 'debug' mode, automatic background sync is disabled.
    """
    if DEBUG or ENVIRONMENT in ("dev", "development", "debug"):
        return False
    return True


# Server Configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Sync Settings
SYNC_MODE = os.getenv("SYNC_MODE", "global").strip().lower()
SYNC_INTERVAL_MINUTES = int(os.getenv("SYNC_INTERVAL_MINUTES", "15"))
SYNC_COOLDOWN_SECONDS = int(os.getenv("SYNC_COOLDOWN_SECONDS", "300"))
DAILY_ACTIVITY_SYNC_HOUR = int(os.getenv("DAILY_ACTIVITY_SYNC_HOUR", "6"))  # 06:00 UTC

# Database Path
DB_PATH = BASE_DIR / os.getenv("DB_PATH", "data/journal.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

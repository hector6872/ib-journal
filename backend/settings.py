import json
import logging
from typing import Any, Dict

from backend.config import BASE_DIR


SETTINGS_PATH = BASE_DIR / "data" / "settings.json"
logger = logging.getLogger("ib-journal.settings")

ALLOWED_SERVER_SETTINGS = {"starting_capital", "unrealized_pnl"}


def get_all_settings() -> Dict[str, Any]:
    """Reads server-level settings from data/settings.json."""
    if not SETTINGS_PATH.exists():
        return {}
    try:
        content = SETTINGS_PATH.read_text(encoding="utf-8").strip()
        if not content:
            return {}
        data = json.loads(content)
        # Filter to only server settings
        return {k: v for k, v in data.items() if k in ALLOWED_SERVER_SETTINGS}
    except Exception as e:
        logger.warning(f"Could not read settings.json: {e}")
        return {}


def update_settings(new_settings: Dict[str, Any]) -> Dict[str, Any]:
    """Updates server-level settings in data/settings.json using safe atomic writing."""
    filtered_new = {k: v for k, v in new_settings.items() if k in ALLOWED_SERVER_SETTINGS}
    current = get_all_settings()
    current.update(filtered_new)

    try:
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        temp_path = SETTINGS_PATH.with_suffix(".tmp")
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2, ensure_ascii=False)
        temp_path.replace(SETTINGS_PATH)
    except Exception as e:
        logger.error(f"Could not write settings.json: {e}")
    return current

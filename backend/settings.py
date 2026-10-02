import json
import logging
from typing import Dict, Any
from backend.config import BASE_DIR

SETTINGS_PATH = BASE_DIR / "data" / "settings.json"
logger = logging.getLogger("ib-journal.settings")

def get_all_settings() -> Dict[str, Any]:
    """Reads settings from data/settings.json."""
    if not SETTINGS_PATH.exists():
        return {}
    try:
        with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Could not read settings.json: {e}")
        return {}

def update_settings(new_settings: Dict[str, Any]) -> Dict[str, Any]:
    """Updates settings in data/settings.json using safe atomic writing."""
    if not new_settings:
        return get_all_settings()
    
    current = get_all_settings()
    current.update(new_settings)
    try:
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        temp_path = SETTINGS_PATH.with_suffix(".tmp")
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2, ensure_ascii=False)
        temp_path.replace(SETTINGS_PATH)
    except Exception as e:
        logger.error(f"Could not write settings.json: {e}")
    return current

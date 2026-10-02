import logging
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Any, Dict, Optional



from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.analytics import (
    get_day_trades,
    get_detailed_stats,
    get_month_calendar,
    get_overview_stats,
    get_week_calendar,
    get_year_calendar,
)
from backend.config import BASE_DIR, HOST, PORT, is_ibkr_configured
from backend.database import init_db
from backend.scheduler import scheduler
from backend.settings import get_all_settings, update_settings


# Logging configuration (Stdout / RAM-friendly)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("ib-journal.app")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize SQLite tables with WAL pragmas (No sample data, clean DB)
    init_db()

    # Start background scheduler if credentials exist
    if is_ibkr_configured():
        scheduler.start()
    else:
        logger.info("IBKR credentials not configured or placeholder in .env. Background sync scheduler is idle.")

    yield
    # Shutdown
    scheduler.stop()

app = FastAPI(
    title="IBKR Trading Journal API",
    description="Ultra-lightweight self-hosted Trading Journal for Raspberry Pi",
    version="1.0.0",
    lifespan=lifespan
)


# Allow CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------
# REST API Endpoints
# -------------------------------------------------------------

@app.get("/api/config")
async def get_app_config():
    """Returns frontend runtime settings."""
    return {
        "currency_symbol": CURRENCY_SYMBOL,
        "is_configured": is_ibkr_configured()
    }


@app.get("/api/settings")
async def api_get_settings():
    """Returns user settings persisted in DB for cross-device sync."""
    return get_all_settings()


@app.post("/api/settings")
async def api_save_settings(settings: dict):
    """Persists user settings in DB for cross-device sync."""
    update_settings(settings)
    return {"status": "ok", "settings": get_all_settings()}


@app.get("/api/stats/overview")
async def api_stats_overview(start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Returns top KPI bar metrics."""
    return get_overview_stats(start_date=start_date, end_date=end_date)


@app.get("/api/stats/detailed")
async def api_stats_detailed(start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Returns comprehensive trading performance analytics."""
    return get_detailed_stats(start_date=start_date, end_date=end_date)


@app.get("/api/calendar/year")
async def api_calendar_year(year: Optional[int] = Query(default=None)):
    """Returns 12-month calendar matrix and monthly summaries."""
    if year is None:
        year = date.today().year
    return get_year_calendar(year)


@app.get("/api/calendar/month")
async def api_calendar_month(
    year: Optional[int] = Query(default=None),
    month: Optional[int] = Query(default=None)
):
    """Returns monthly calendar grid data."""
    today = date.today()
    if year is None:
        year = today.year
    if month is None:
        month = today.month
    return get_month_calendar(year, month)


@app.get("/api/calendar/week")
async def api_calendar_week(date_str: Optional[str] = Query(default=None, alias="date")):
    """Returns 7-day card breakdown."""
    if not date_str:
        date_str = date.today().isoformat()
    return get_week_calendar(date_str)


@app.get("/api/trades/day")
async def api_day_trades(date_str: str = Query(..., alias="date")):
    """Returns list of executed trades for a specific day."""
    trades = get_day_trades(date_str)
    return {
        "date": date_str,
        "trades": trades,
        "count": len(trades)
    }

@app.get("/api/sync/status")
async def api_sync_status():
    """Returns current sync status, countdown, and cooldown info."""
    return scheduler.get_status()

@app.post("/api/trades/import")
async def api_trades_import(request: Request):
    """Imports trades from uploaded CSV, XML, or JSON payload."""
    content_bytes = await request.body()
    if not content_bytes:
        raise HTTPException(status_code=400, detail="No content provided for import.")

    text = content_bytes.decode("utf-8-sig", errors="replace")
    trades = []

    # 1. Check XML
    if text.strip().startswith("<?xml") or "<FlexStatement" in text or "<Trade" in text:
        import tempfile
        from scripts.import_trades import parse_xml_file
        with tempfile.NamedTemporaryFile(suffix=".xml", mode="w", encoding="utf-8", delete=False) as tmp:
            tmp.write(text)
            tmp_path = Path(tmp.name)
        try:
            trades = parse_xml_file(tmp_path)
        finally:
            if tmp_path.exists():
                tmp_path.unlink()
    # 2. Check JSON
    elif text.strip().startswith("[") or text.strip().startswith("{"):
        try:
            import json
            data = json.loads(text)
            trades = data if isinstance(data, list) else data.get("trades", [])
        except Exception:
            pass
    # 3. Check CSV
    if not trades:
        from scripts.import_trades import parse_ibkr_activity_statement_csv, parse_generic_ibkr_csv
        lines = text.splitlines()
        is_activity = any(l.startswith("Trades,Header") or l.startswith("Trades,Data") for l in lines[:50])
        if is_activity:
            trades = parse_ibkr_activity_statement_csv(lines)
        else:
            trades = parse_generic_ibkr_csv(lines)

    if not trades:
        raise HTTPException(
            status_code=400,
            detail="Could not extract valid trades from provided content. Please ensure it is an IBKR Activity Statement CSV or Flex XML/CSV export."
        )

    from backend.database import upsert_trades
    count = upsert_trades(trades)
    return {
        "status": "success",
        "trades_count": count,
        "message": f"Successfully imported {count} trades."
    }

@app.post("/api/sync/trigger")
async def api_sync_trigger():
    """Triggers an on-demand manual sync if cooldown permits."""
    cooldown = scheduler.get_cooldown_remaining_seconds()
    if cooldown > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit cooldown active. Please wait {cooldown} seconds before syncing again."
        )

    result = await scheduler.execute_sync(sync_type="manual")
    if result["status"] == "failed":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

# -------------------------------------------------------------
# Static Frontend Serving
# -------------------------------------------------------------

frontend_dir = BASE_DIR / "frontend"
if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

    @app.get("/")
    async def serve_index():
        return FileResponse(frontend_dir / "index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=False)

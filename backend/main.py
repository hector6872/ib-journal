import logging
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.config import BASE_DIR, HOST, PORT, CURRENCY_SYMBOL
from backend.database import init_db, upsert_trades
from backend.flex_client import generate_sample_trades
from backend.scheduler import scheduler
from backend.analytics import (
    get_overview_stats,
    get_detailed_stats,
    get_year_calendar,
    get_month_calendar,
    get_week_calendar,
    get_day_trades,
)

# Logging configuration (Stdout / RAM-friendly)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("ib-journal.app")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize SQLite tables with WAL pragmas
    init_db()
    # Check if empty, run initial seed or initial sync if needed
    overview = get_overview_stats()
    if overview["total_trades"] == 0:
        logger.info("Database is empty. Populating with initial sample data...")
        sample_trades = generate_sample_trades(num_trades=220)
        upsert_trades(sample_trades)
    
    # Start background scheduler
    scheduler.start()
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
    }

@app.get("/api/stats/overview")
async def api_stats_overview(start_date: str = None, end_date: str = None):
    """Returns top KPI bar metrics."""
    return get_overview_stats(start_date=start_date, end_date=end_date)

@app.get("/api/stats/detailed")
async def api_stats_detailed():
    """Returns comprehensive trading performance analytics."""
    return get_detailed_stats()


@app.get("/api/calendar/year")
async def api_calendar_year(year: int = Query(default=None)):
    """Returns 12-month calendar matrix and monthly summaries."""
    if year is None:
        year = date.today().year
    return get_year_calendar(year)

@app.get("/api/calendar/month")
async def api_calendar_month(
    year: int = Query(default=None),
    month: int = Query(default=None)
):
    """Returns monthly calendar grid data."""
    today = date.today()
    if year is None:
        year = today.year
    if month is None:
        month = today.month
    return get_month_calendar(year, month)

@app.get("/api/calendar/week")
async def api_calendar_week(date_str: str = Query(default=None, alias="date")):
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
        raise HTTPException(status_code=500, detail=result["message"])
    return result

@app.post("/api/seed")
async def api_seed_sample_data(count: int = 150):
    """Populates database with sample trading data."""
    trades = generate_sample_trades(num_trades=count)
    inserted = upsert_trades(trades)
    return {"status": "success", "trades_inserted": inserted}

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

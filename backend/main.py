import logging
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Optional

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
    group_executions_to_trades,
)
from backend.config import BASE_DIR, HOST, PORT, is_ibkr_configured

from backend.database import (
    add_manual_cash_transaction,
    db_session,
    delete_cash_transaction,
    get_active_base_currency,
    get_cash_summary,
    get_currency_symbol,
    init_db,
    upsert_cash_transactions,
    upsert_trades,
)
from backend.scheduler import scheduler
from backend.settings import get_all_settings, update_settings


# Logging configuration (Stdout / RAM-friendly)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
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
    lifespan=lifespan,
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
    base_curr = get_active_base_currency()
    curr_sym = get_currency_symbol(base_curr)
    return {"base_currency": base_curr, "currency_symbol": curr_sym, "is_configured": is_ibkr_configured()}


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
async def api_calendar_month(year: Optional[int] = Query(default=None), month: Optional[int] = Query(default=None)):
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
    """Returns list of executed trades and grouped round-trip trades for a specific day."""
    trades = get_day_trades(date_str)
    grouped_trades = group_executions_to_trades(trades)
    return {
        "date": date_str,
        "trades": trades,
        "count": len(trades),
        "grouped_trades": grouped_trades,
        "grouped_count": len(grouped_trades),
    }


is_importing = False


@app.get("/api/sync/status")
async def api_sync_status():
    """Returns current sync status, countdown, and cooldown info."""
    status = scheduler.get_status()
    status["is_importing"] = is_importing
    return status


@app.post("/api/trades/import")
@app.post("/api/import/statement")
async def api_trades_import(request: Request):
    """Imports trades and cash transactions from uploaded CSV, XML, or JSON payload."""
    global is_importing
    if scheduler.is_syncing:
        raise HTTPException(
            status_code=409,
            detail="A synchronization is currently in progress. Please wait until it finishes before importing files.",
        )
    if is_importing:
        raise HTTPException(
            status_code=409,
            detail="Another statement file import is currently in progress. Please wait until it completes.",
        )

    is_importing = True
    try:
        content_bytes = await request.body()
        if not content_bytes:
            raise HTTPException(status_code=400, detail="No content provided for import.")

        text = content_bytes.decode("utf-8-sig", errors="replace")
        trades = []
        cash_txs = []

        # 1. Check XML
        trimmed = text.strip()
        if (
            trimmed.startswith("<?xml")
            or "<FlexStatement" in text
            or "<FlexQueryResponse" in text
            or "<Trade" in text
            or "<CashTransaction" in text
            or "<Order" in text
        ):
            import tempfile
            from scripts.import_trades import parse_xml_cash_transactions, parse_xml_file

            with tempfile.NamedTemporaryFile(suffix=".xml", mode="w", encoding="utf-8", delete=False) as tmp:
                tmp.write(text)
                tmp_path = Path(tmp.name)
            try:
                trades = parse_xml_file(tmp_path)
                cash_txs = parse_xml_cash_transactions(tmp_path)
            finally:
                if tmp_path.exists():
                    tmp_path.unlink()
        # 2. Check JSON
        elif trimmed.startswith("[") or trimmed.startswith("{"):
            try:
                import json

                data = json.loads(text)
                trades = data if isinstance(data, list) else data.get("trades", [])
                cash_txs = data.get("cash_transactions", []) if isinstance(data, dict) else []
            except Exception:
                pass
        # 3. Check CSV
        if not trades and not cash_txs:
            from scripts.import_trades import (
                ACCOUNT_SECTIONS,
                CASH_SECTIONS,
                TRADES_SECTIONS,
                detect_csv_delimiter,
                parse_csv_cash_transactions,
                parse_csv_line_tokens,
                parse_csv_unrealized_pnl,
                parse_generic_ibkr_csv,
                parse_ibkr_activity_statement_csv,
            )

            lines = text.splitlines()
            delimiter = detect_csv_delimiter(lines)

            # Check if this is an activity statement
            is_activity = False
            for line_item in lines[:30]:
                tokens = parse_csv_line_tokens(line_item, delimiter)
                if len(tokens) >= 2:
                    sec = tokens[0].strip().lower().strip('"')
                    if (
                        sec in TRADES_SECTIONS
                        or sec in ACCOUNT_SECTIONS
                        or sec in CASH_SECTIONS
                        or sec in ("statement", "extracto", "informe", "estado")
                    ):
                        is_activity = True
                        break

            if is_activity:
                trades = parse_ibkr_activity_statement_csv(lines)
                cash_txs = parse_csv_cash_transactions(lines)
                # Fallback to generic parser if activity statement parser found 0 trades
                if not trades:
                    trades = parse_generic_ibkr_csv(lines)
            else:
                trades = parse_generic_ibkr_csv(lines)
                if not trades:
                    trades = parse_ibkr_activity_statement_csv(lines)
                cash_txs = parse_csv_cash_transactions(lines)

            unrealized_val = parse_csv_unrealized_pnl(lines)
            if unrealized_val is not None:
                from backend.settings import update_settings
                update_settings({"unrealized_pnl": unrealized_val})

        if not trades and not cash_txs:
            raise HTTPException(
                status_code=400,
                detail="No trade executions or cash transactions found in statement. Please ensure it is an IBKR Activity Statement CSV/XML, Flex Query export, or Trade Confirmation report.",
            )

        from datetime import datetime, timezone

        prev_currency = get_active_base_currency()
        count = upsert_trades(trades) if trades else 0
        cash_count = upsert_cash_transactions(cash_txs) if cash_txs else 0
        new_currency = get_active_base_currency()
        new_symbol = get_currency_symbol(new_currency)
        currency_changed = prev_currency != new_currency

        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE sync_gaps
                SET resolved_at = CURRENT_TIMESTAMP
                WHERE resolved_at IS NULL;
            """)
            cursor.execute(
                """
                INSERT INTO sync_history (sync_type, status, trades_count, completed_at)
                VALUES ('manual_import', 'success', ?, CURRENT_TIMESTAMP);
            """,
                (count,),
            )

        scheduler.last_sync_time = datetime.now(timezone.utc)
        scheduler.last_trades_count = count

        msg_parts = []
        if count > 0:
            msg_parts.append(f"{count} trades")
        if cash_count > 0:
            msg_parts.append(f"{cash_count} cash transactions")
        msg_str = " and ".join(msg_parts) if msg_parts else "0 records"

        return {
            "status": "success",
            "trades_count": count,
            "cash_count": cash_count,
            "base_currency": new_currency,
            "currency_symbol": new_symbol,
            "currency_changed": currency_changed,
            "prev_currency": prev_currency,
            "message": f"Successfully processed statement. {msg_str} recorded.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error importing statement: {e}")
        raise HTTPException(status_code=400, detail=f"Error importing statement: {str(e)}")
    finally:
        is_importing = False


import_historical_statement = api_trades_import


@app.get("/api/cash/transactions")
async def api_get_cash_transactions():
    """Returns all cash transactions (deposits, withdrawals, transfers) and summary totals."""
    return get_cash_summary()


@app.post("/api/cash/transactions")
async def api_add_cash_transaction(payload: dict):
    """Adds a manual deposit or withdrawal."""
    if not payload.get("amount"):
        raise HTTPException(status_code=400, detail="Amount is required.")
    record = add_manual_cash_transaction(payload)
    return {"status": "success", "transaction": record, "summary": get_cash_summary()}


@app.delete("/api/cash/transactions/{tx_id}")
async def api_delete_cash_transaction(tx_id: str):
    """Deletes a cash transaction by ID."""
    success = delete_cash_transaction(tx_id)
    if not success:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return {"status": "success", "summary": get_cash_summary()}


@app.post("/api/sync/gap/resolve")
async def api_sync_gap_resolve():
    """Resolves all pending sync gaps and records a checkpoint (e.g. user confirmed no trades during outage/vacation)."""
    from datetime import datetime, timezone
    from backend.database import db_session

    now = datetime.now(timezone.utc)
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE sync_gaps
            SET resolved_at = CURRENT_TIMESTAMP
            WHERE resolved_at IS NULL;
        """)
        cursor.execute("""
            INSERT INTO sync_history (sync_type, status, trades_count, completed_at)
            VALUES ('gap_dismiss', 'success', 0, CURRENT_TIMESTAMP);
        """)

    scheduler.last_sync_time = now
    return {"status": "success", "message": "Sync gap marked as resolved."}


@app.post("/api/sync/trigger")
async def api_sync_trigger():
    """Triggers an on-demand manual sync if cooldown permits and no import is active."""
    if is_importing:
        raise HTTPException(
            status_code=409,
            detail="A statement file import is currently in progress. Please wait until it completes before syncing.",
        )

    cooldown = scheduler.get_cooldown_remaining_seconds()
    if cooldown > 0:
        raise HTTPException(
            status_code=429,
            detail={
                "error_code": "ERR_COOLDOWN_ACTIVE",
                "error_params": {"seconds": cooldown},
                "message": f"Rate limit cooldown active. Please wait {cooldown} seconds before syncing again.",
            },
        )

    result = await scheduler.execute_sync(sync_type="manual")
    if result.get("status") == "failed":
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": result.get("error_code", "ERR_GENERIC_SYNC"),
                "error_params": result.get("error_params", {}),
                "message": result.get("message", "Sync failed"),
            },
        )
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

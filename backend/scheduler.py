import asyncio
import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

from backend.config import (
    DAILY_ACTIVITY_SYNC_HOUR,
    ENVIRONMENT,
    IBKR_ACTIVITY_QUERY_ID,
    IBKR_QUERY_ID,
    IBKR_TOKEN,
    IBKR_TRADE_QUERY_ID,
    SYNC_COOLDOWN_SECONDS,
    SYNC_INTERVAL_MINUTES,
    SYNC_MODE,
    is_ibkr_configured,
    is_production,
)
from backend.database import db_session, upsert_cash_transactions, upsert_trades
from backend.flex_client import IBKRFlexClient

logger = logging.getLogger("ib-journal.scheduler")

TZ_NY = ZoneInfo("America/New_York")
TZ_EU = ZoneInfo("Europe/Madrid")


def classify_ibkr_error(err: Any) -> Dict[str, Any]:
    """Categorizes technical IBKR or network exceptions into structured error codes, parameters, and concise messages."""
    s = str(err)
    if any(k in s for k in ["nodename nor servname", "gaierror", "Failed to resolve", "getaddrinfo"]):
        return {
            "error_code": "ERR_CONNECTION_FAILED",
            "error_params": {},
            "message": "Connection failed (Check internet/DNS)",
        }
    if "1018" in s or "IP address not allowed" in s:
        return {
            "error_code": "ERR_IBKR_IP_UNAUTHORIZED",
            "error_params": {"code": 1018},
            "message": "IBKR Error 1018: IP not authorized",
        }
    if "1014" in s or "Token is invalid" in s:
        return {
            "error_code": "ERR_IBKR_INVALID_TOKEN",
            "error_params": {"code": 1014},
            "message": "IBKR Error 1014: Invalid/expired token",
        }
    if "1019" in s or "Statement is being generated" in s:
        return {
            "error_code": "ERR_IBKR_STATEMENT_GENERATING",
            "error_params": {"code": 1019},
            "message": "Statement is generating (Try again shortly)",
        }
    if "timed out" in s.lower() or "timeout" in s.lower():
        return {
            "error_code": "ERR_IBKR_TIMEOUT",
            "error_params": {},
            "message": "IBKR request timed out",
        }
    if "HTTP error:" in s:
        clean_msg = s.split("HTTP error:")[-1].strip()
        return {
            "error_code": "ERR_HTTP_ERROR",
            "error_params": {"detail": clean_msg},
            "message": clean_msg,
        }
    truncated = s[:60] + "..." if len(s) > 60 else s
    return {
        "error_code": "ERR_GENERIC_SYNC",
        "error_params": {"detail": truncated},
        "message": truncated,
    }


def clean_ibkr_error(err: Any) -> str:
    """Simplifies technical IBKR or network exceptions into short, concise phrases."""
    return classify_ibkr_error(err)["message"]


class SyncScheduler:
    def __init__(self):
        self.last_sync_time: Optional[datetime] = None
        self.last_api_sync_time: Optional[datetime] = None
        self.last_activity_sync_time: Optional[datetime] = None
        self.last_daily_sync_date: Optional[str] = None
        self.last_sync_status: str = "idle"
        self.last_sync_message: str = "No sync performed yet."
        self.last_error_code: Optional[str] = None
        self.last_error_params: Dict[str, Any] = {}
        self.last_status_code: Optional[str] = None
        self.last_status_params: Dict[str, Any] = {}
        self.last_trades_count: int = 0
        self.last_cash_count: int = 0
        self.is_syncing: bool = False
        self.next_sync_time: Optional[datetime] = None
        self._task: Optional[asyncio.Task] = None

    def is_market_hours(self, now: Optional[datetime] = None) -> bool:
        """
        Market session detection based on configured SYNC_MODE:
        - 'always' / '24_7': Always active (24/7).
        - 'global' / '24_5': Active Sunday 22:00 UTC through Friday 22:00 UTC (covers APAC, Europe, US, Forex, Futures).
        - 'western' / 'eu_us': Active Monday to Friday 07:00 UTC to 21:15 UTC (Europe & US standard sessions).
        """
        if now is None:
            now = datetime.now(timezone.utc)
        else:
            now = now.astimezone(timezone.utc)

        mode = (SYNC_MODE or "global").strip().lower()

        if mode in ("always", "24_7", "all"):
            return True

        if mode in ("western", "eu_us", "standard"):
            # Timezone-aware detection (immune to Daylight Saving Time / Summer-Winter clock shifts):
            # 1. US Markets: Monday-Friday 04:00 to 20:05 in America/New_York (Pre-market + Regular + Full After-Hours)
            # 2. European Markets: Monday-Friday 08:30 to 18:00 in Europe/Madrid
            ny_dt = now.astimezone(TZ_NY)
            eu_dt = now.astimezone(TZ_EU)
            us_active = (ny_dt.weekday() < 5) and (time(4, 0) <= ny_dt.time() <= time(20, 5))
            eu_active = (eu_dt.weekday() < 5) and (time(8, 30) <= eu_dt.time() <= time(18, 0))
            return us_active or eu_active

        # Default: 'global' (24/5 from Sunday 22:00 UTC to Friday 22:00 UTC)
        weekday = now.weekday()
        if weekday == 5:  # Saturday
            return False
        if weekday == 6:  # Sunday
            return now.hour >= 22
        if weekday == 4:  # Friday
            return now.hour < 22 or (now.hour == 22 and now.minute == 0)
        # Monday to Thursday
        return True

    def get_cooldown_remaining_seconds(self) -> int:
        """Returns remaining seconds for remote Flex API sync cooldown (default 300s)."""
        last_api = self.last_api_sync_time
        if not last_api:
            try:
                with db_session() as conn:
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT MAX(completed_at) as last_api FROM sync_history WHERE sync_type IN ('scheduled', 'manual', 'scheduled_daily') AND status = 'success';"
                    )
                    row = cursor.fetchone()
                    if row and row["last_api"]:
                        last_api = datetime.fromisoformat(row["last_api"])
            except Exception:
                pass

        if not last_api:
            return 0

        now = datetime.now(timezone.utc)
        last = last_api if last_api.tzinfo else last_api.replace(tzinfo=timezone.utc)
        elapsed = (now - last).total_seconds()
        remaining = int(SYNC_COOLDOWN_SECONDS - elapsed)
        return max(0, remaining)

    def calculate_next_sync_time(self, now: Optional[datetime] = None) -> datetime:
        """Calculates next intraday trade sync timestamp based on sync mode, market hours, and interval."""
        if now is None:
            now = datetime.now(timezone.utc)
        else:
            now = now.astimezone(timezone.utc)

        mode = (SYNC_MODE or "global").strip().lower()

        if mode in ("always", "24_7", "all"):
            return now + timedelta(minutes=SYNC_INTERVAL_MINUTES)

        if mode in ("western", "eu_us", "standard"):
            if self.is_market_hours(now):
                candidate = now + timedelta(minutes=SYNC_INTERVAL_MINUTES)
                if self.is_market_hours(candidate):
                    return candidate

            # When closed overnight or weekend, next open is 08:30 Europe/Madrid
            eu_dt = now.astimezone(TZ_EU)
            candidate_open = datetime.combine(eu_dt.date(), time(8, 30), tzinfo=TZ_EU)
            if candidate_open <= eu_dt:
                candidate_open += timedelta(days=1)

            while candidate_open.weekday() >= 5:  # Skip Saturday & Sunday
                candidate_open += timedelta(days=1)

            return candidate_open.astimezone(timezone.utc)

        # 'global' (Sunday 22:00 UTC to Friday 22:00 UTC)
        if self.is_market_hours(now):
            candidate = now + timedelta(minutes=SYNC_INTERVAL_MINUTES)
            if now.weekday() == 4:  # Friday
                close_dt = datetime.combine(now.date(), time(22, 0), tzinfo=timezone.utc)
                if candidate <= close_dt:
                    return candidate
                # Candidate past Friday 22:00 -> Sunday 22:00 UTC
                return datetime.combine(now.date() + timedelta(days=2), time(22, 0), tzinfo=timezone.utc)
            return candidate

        # Weekend / closed hours for 'global': next open is Sunday 22:00 UTC
        weekday = now.weekday()
        if weekday == 4:  # Friday after 22:00
            days_to_sunday = 2
        elif weekday == 5:  # Saturday
            days_to_sunday = 1
        elif weekday == 6:  # Sunday before 22:00
            days_to_sunday = 0
        else:
            days_to_sunday = 0

        target_date = now.date() + timedelta(days=days_to_sunday)
        return datetime.combine(target_date, time(22, 0), tzinfo=timezone.utc)

    def calculate_next_daily_sync_time(self, now: Optional[datetime] = None) -> datetime:
        """Calculates the next daily activity consolidation time (06:00 UTC)."""
        if now is None:
            now = datetime.now(timezone.utc)
        else:
            now = now.astimezone(timezone.utc)

        target_today = datetime.combine(now.date(), time(DAILY_ACTIVITY_SYNC_HOUR, 0), tzinfo=timezone.utc)
        if now < target_today:
            return target_today
        return target_today + timedelta(days=1)

    async def execute_sync(self, sync_type: str = "manual") -> Dict[str, Any]:
        """
        Executes synchronization against IBKR Flex Web Service.
        - If sync_type == 'manual': queries both Trade Confirmation and Activity queries (if configured)
        - If sync_type == 'scheduled': executes intraday Trade Confirmation query
        - If sync_type == 'scheduled_daily': executes daily Activity consolidation query
        """
        if not is_ibkr_configured():
            self.last_sync_status = "unconfigured"
            self.last_sync_message = "IBKR credentials are not configured in .env."
            self.last_error_code = "ERR_UNCONFIGURED"
            self.last_error_params = {}
            return {
                "status": "unconfigured",
                "error_code": self.last_error_code,
                "error_params": self.last_error_params,
                "message": self.last_sync_message,
            }

        if self.is_syncing:
            return {
                "status": "in_progress",
                "error_code": "ERR_SYNC_IN_PROGRESS",
                "error_params": {},
                "message": "A synchronization is already currently in progress.",
            }

        self.is_syncing = True
        self.last_sync_status = "in_progress"

        errors = []
        raw_exceptions = []
        queries_run = []
        total_trades_count = 0
        total_cash_count = 0

        try:
            trade_query = IBKR_TRADE_QUERY_ID or IBKR_QUERY_ID
            activity_query = IBKR_ACTIVITY_QUERY_ID

            client = IBKRFlexClient(IBKR_TOKEN, trade_query or activity_query)

            # 1. Trade executions sync (Intraday / Trade Confirmation)
            if sync_type in ("scheduled", "manual") and trade_query:
                try:
                    logger.info(f"Connecting to IBKR Flex Web Service (Trade query: {trade_query})...")
                    xml_data = await client.fetch_statement_xml(query_id=trade_query)
                    trades = client.parse_trades_xml(xml_data)
                    cash_txs = client.parse_cash_transactions_xml(xml_data)

                    t_count = upsert_trades(trades) if trades else 0
                    c_count = upsert_cash_transactions(cash_txs) if cash_txs else 0
                    total_trades_count += t_count
                    total_cash_count += c_count
                    queries_run.append("Intraday")
                except Exception as e_trade:
                    logger.error(f"Trade query ({trade_query}) failed: {e_trade}")
                    errors.append(f"Trade: {clean_ibkr_error(e_trade)}")
                    raw_exceptions.append(e_trade)

            # 2. Activity / EOD consolidation sync (Activity Query)
            if (
                sync_type == "scheduled_daily"
                or (sync_type == "manual" and activity_query and activity_query != trade_query)
            ) and activity_query:
                try:
                    logger.info(f"Connecting to IBKR Flex Web Service (Activity query: {activity_query})...")
                    xml_data_act = await client.fetch_statement_xml(query_id=activity_query)
                    trades_act = client.parse_trades_xml(xml_data_act)
                    cash_act = client.parse_cash_transactions_xml(xml_data_act)

                    t_count_act = upsert_trades(trades_act) if trades_act else 0
                    c_count_act = upsert_cash_transactions(cash_act) if cash_act else 0
                    total_trades_count += t_count_act
                    total_cash_count += c_count_act
                    queries_run.append("Activity")
                    self.last_activity_sync_time = datetime.now(timezone.utc)
                except Exception as e_act:
                    logger.error(f"Activity query ({activity_query}) failed: {e_act}")
                    errors.append(f"Activity: {clean_ibkr_error(e_act)}")
                    raw_exceptions.append(e_act)

            now = datetime.now(timezone.utc)

            # If all attempted queries failed
            if errors and not queries_run:
                clean_msg = "; ".join(errors)
                self.last_sync_status = "failed"
                self.last_sync_message = clean_msg
                first_code = "ERR_GENERIC_SYNC"
                first_params = {"detail": clean_msg}
                if raw_exceptions:
                    first_classified = classify_ibkr_error(raw_exceptions[0])
                    first_code = first_classified["error_code"]
                    first_params = first_classified["error_params"]
                self.last_error_code = first_code
                self.last_error_params = first_params
                return {
                    "status": "failed",
                    "error_code": first_code,
                    "error_params": first_params,
                    "message": clean_msg,
                }

            # At least one query succeeded -> record sync history and resolve sync gaps
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
                    VALUES (?, 'success', ?, CURRENT_TIMESTAMP);
                """,
                    (sync_type, total_trades_count),
                )

            self.last_sync_time = now
            self.last_api_sync_time = now
            self.last_sync_status = "success"
            self.last_error_code = None
            self.last_error_params = {}
            self.last_status_code = "STATUS_SYNC_SUCCESS" if not errors else "STATUS_SYNC_PARTIAL"
            self.last_status_params = {
                "trades": total_trades_count,
                "cash": total_cash_count,
                "scope": queries_run,
                "warning": "; ".join(errors) if errors else "",
            }
            self.last_trades_count = total_trades_count
            self.last_cash_count = total_cash_count

            summary_parts = []
            if total_trades_count > 0:
                summary_parts.append(f"{total_trades_count} trades")
            if total_cash_count > 0:
                summary_parts.append(f"{total_cash_count} cash transfers")
            recs_str = " and ".join(summary_parts) if summary_parts else "0 new records"

            scope_str = " + ".join(queries_run) if queries_run else "None"
            if errors:
                self.last_sync_message = f"Synchronized {recs_str} ({scope_str}). Warning: {'; '.join(errors)}"
            else:
                self.last_sync_message = f"Synchronized {recs_str} successfully ({scope_str})."

            self.next_sync_time = self.calculate_next_sync_time()

            logger.info(self.last_sync_message)
            return {
                "status": "success" if not errors else "partial_success",
                "status_code": self.last_status_code,
                "status_params": self.last_status_params,
                "message": self.last_sync_message,
                "trades_count": total_trades_count,
                "cash_count": total_cash_count,
                "last_sync_time": self.last_sync_time.isoformat(),
                "next_sync_time": self.next_sync_time.isoformat(),
                "next_daily_sync_time": self.calculate_next_daily_sync_time().isoformat(),
            }

        except Exception as e:
            classified = classify_ibkr_error(e)
            self.last_sync_status = "failed"
            self.last_sync_message = classified["message"]
            self.last_error_code = classified["error_code"]
            self.last_error_params = classified["error_params"]
            logger.error(f"Sync failed: {e}")
            return {
                "status": "failed",
                "error_code": self.last_error_code,
                "error_params": self.last_error_params,
                "message": classified["message"],
            }
        finally:
            self.is_syncing = False

    async def _loop(self):
        """Background loop running on the server."""
        if not is_ibkr_configured():
            logger.info("IBKR credentials missing or placeholder. Scheduler loop will not run.")
            return

        # Calculate initial next syncs
        self.next_sync_time = self.calculate_next_sync_time()

        while True:
            try:
                await asyncio.sleep(30)
                now = datetime.now(timezone.utc)
                today_str = now.date().isoformat()

                # 1. Daily Activity Consolidation at 06:00 UTC
                if (
                    IBKR_ACTIVITY_QUERY_ID
                    and now.hour >= DAILY_ACTIVITY_SYNC_HOUR
                    and self.last_daily_sync_date != today_str
                    and not self.is_syncing
                ):
                    logger.info("Triggering scheduled daily activity consolidation (06:00 UTC)...")
                    await self.execute_sync(sync_type="scheduled_daily")
                    self.last_daily_sync_date = today_str

                # 2. Intraday trade sync during market hours (every SYNC_INTERVAL_MINUTES)
                trade_query = IBKR_TRADE_QUERY_ID or IBKR_QUERY_ID
                if trade_query and self.is_market_hours(now) and self.next_sync_time:
                    if now >= self.next_sync_time and not self.is_syncing:
                        logger.info("Triggering scheduled market-hours intraday sync...")
                        await self.execute_sync(sync_type="scheduled")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Scheduler loop error: {e}")

    def start(self):
        if not is_ibkr_configured():
            return
        if not is_production():
            logger.info(f"Environment is '{ENVIRONMENT}' (dev/debug mode). Automatic background sync loop is disabled.")
            return
        if self._task is None:
            self._task = asyncio.create_task(self._loop())

    def stop(self):
        if self._task:
            self._task.cancel()
            self._task = None

    def get_status(self) -> Dict[str, Any]:
        configured = is_ibkr_configured()
        in_prod = is_production()
        status_val = self.last_sync_status if configured else "unconfigured"
        msg_val = self.last_sync_message if configured else "IBKR credentials not configured in .env"

        has_sync_gap = False
        gap_days = 0
        gap_from = None
        gap_to = None
        last_trade_date = None
        last_sync_dt = self.last_sync_time

        try:
            with db_session() as conn:
                cursor = conn.cursor()

                cursor.execute("""
                    SELECT gap_days, from_date, to_date
                    FROM sync_gaps
                    WHERE resolved_at IS NULL
                    ORDER BY id DESC
                    LIMIT 1;
                """)
                unresolved_gap = cursor.fetchone()
                if unresolved_gap:
                    has_sync_gap = True
                    gap_days = unresolved_gap["gap_days"]
                    gap_from = unresolved_gap["from_date"]
                    gap_to = unresolved_gap["to_date"]

                cursor.execute("SELECT MAX(trade_date) as max_date FROM trades;")
                r = cursor.fetchone()
                if r and r["max_date"]:
                    last_trade_date = r["max_date"]

                if not last_sync_dt:
                    cursor.execute(
                        "SELECT completed_at, trades_count, status FROM sync_history WHERE status = 'success' ORDER BY id DESC LIMIT 1;"
                    )
                    sr = cursor.fetchone()
                    if sr and sr["completed_at"]:
                        try:
                            last_sync_dt = datetime.fromisoformat(sr["completed_at"])
                            if self.last_sync_status == "idle":
                                status_val = "success"
                                msg_val = f"Last sync succeeded with {sr['trades_count']} trades."
                        except Exception:
                            pass
        except Exception as e:
            logger.debug(f"Could not compute sync gap: {e}")

        now = datetime.now(timezone.utc)
        days_candidates = []
        if last_sync_dt:
            sync_tz = last_sync_dt if last_sync_dt.tzinfo else last_sync_dt.replace(tzinfo=timezone.utc)
            days_since_sync = (now - sync_tz).days
            days_candidates.append(days_since_sync)
        if last_trade_date:
            try:
                lt_date = date.fromisoformat(last_trade_date)
                days_since_trade = (now.date() - lt_date).days
                days_candidates.append(days_since_trade)
            except Exception:
                pass

        if days_candidates:
            current_gap = min(days_candidates)
            if current_gap >= 7:
                has_sync_gap = True
                gap_days = max(gap_days, current_gap)
        elif not has_sync_gap:
            has_sync_gap = True
            gap_days = 7

        trades_count_val = self.last_trades_count
        if not self.last_sync_time:
            try:
                with db_session() as conn:
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT trades_count FROM sync_history WHERE status = 'success' ORDER BY id DESC LIMIT 1;"
                    )
                    last_hist = cursor.fetchone()
                    if last_hist:
                        trades_count_val = last_hist["trades_count"]
            except Exception:
                pass

        effective_last_sync = self.last_sync_time or last_sync_dt

        return {
            "is_configured": configured,
            "environment": ENVIRONMENT,
            "sync_mode": SYNC_MODE,
            "is_auto_sync_enabled": in_prod,
            "has_trade_query": bool(IBKR_TRADE_QUERY_ID),
            "has_activity_query": bool(IBKR_ACTIVITY_QUERY_ID),
            "sync_interval_minutes": SYNC_INTERVAL_MINUTES,
            "cooldown_seconds": SYNC_COOLDOWN_SECONDS,
            "daily_activity_sync_hour_utc": DAILY_ACTIVITY_SYNC_HOUR,
            "last_sync_time": effective_last_sync.isoformat() if (configured and effective_last_sync) else None,
            "next_sync_time": (
                self.next_sync_time.isoformat()
                if (self.next_sync_time and in_prod)
                else (self.calculate_next_sync_time().isoformat() if in_prod else None)
            )
            if configured
            else None,
            "next_daily_sync_time": self.calculate_next_daily_sync_time().isoformat() if configured else None,
            "status": status_val,
            "error_code": self.last_error_code if configured else "ERR_UNCONFIGURED",
            "error_params": self.last_error_params if configured else {},
            "status_code": self.last_status_code,
            "status_params": self.last_status_params,
            "message": msg_val,
            "trades_count": trades_count_val if configured else 0,
            "cash_count": self.last_cash_count if configured else 0,
            "is_syncing": self.is_syncing if configured else False,
            "cooldown_remaining_seconds": self.get_cooldown_remaining_seconds() if configured else 0,
            "is_market_hours": self.is_market_hours(),
            "has_sync_gap": has_sync_gap,
            "gap_days": gap_days,
            "gap_from": gap_from,
            "gap_to": gap_to,
            "last_trade_date": last_trade_date,
        }


scheduler = SyncScheduler()

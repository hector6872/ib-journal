import asyncio
import logging
from datetime import date, datetime, time, timedelta, timezone

from typing import Any, Dict, Optional

from backend.config import (
    ENVIRONMENT,
    IBKR_QUERY_ID,
    IBKR_TOKEN,
    SYNC_COOLDOWN_SECONDS,
    SYNC_INTERVAL_MINUTES,
    SYNC_MODE,
    is_ibkr_configured,
    is_production,
)
from backend.database import db_session, upsert_trades
from backend.flex_client import IBKRFlexClient

logger = logging.getLogger("ib-journal.scheduler")


class SyncScheduler:
    def __init__(self):
        self.last_sync_time: Optional[datetime] = None
        self.last_api_sync_time: Optional[datetime] = None
        self.last_sync_status: str = "idle"
        self.last_sync_message: str = "No sync performed yet."
        self.last_trades_count: int = 0
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
            # 0 = Monday, 6 = Sunday
            if now.weekday() >= 5:
                return False
            # 07:00 UTC to 21:15 UTC
            return (now.hour > 7 or (now.hour == 7 and now.minute >= 0)) and (
                now.hour < 21 or (now.hour == 21 and now.minute <= 15)
            )

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
        """Returns remaining seconds for remote Flex API sync cooldown."""
        last_api = self.last_api_sync_time
        if not last_api:
            try:
                with db_session() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT MAX(completed_at) as last_api FROM sync_history WHERE sync_type IN ('scheduled', 'manual') AND status = 'success';")
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
        """Calculates next sync timestamp based on sync mode, market hours, and interval."""
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
                close_dt = datetime.combine(now.date(), time(21, 15), tzinfo=timezone.utc)
                if candidate <= close_dt:
                    return candidate

            # Calculate next market open (07:00 UTC next business day)
            next_day = now.date()
            candidate_open = datetime.combine(next_day, time(7, 0), tzinfo=timezone.utc)
            if candidate_open <= now:
                next_day += timedelta(days=1)
                candidate_open = datetime.combine(next_day, time(7, 0), tzinfo=timezone.utc)

            while candidate_open.weekday() >= 5:  # Skip weekends
                next_day += timedelta(days=1)
                candidate_open = datetime.combine(next_day, time(7, 0), tzinfo=timezone.utc)

            return candidate_open

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



    async def execute_sync(self, sync_type: str = "scheduled") -> Dict[str, Any]:
        """
        Executes the sync operation against IBKR Flex Query.
        """
        if not is_ibkr_configured():
            self.last_sync_status = "unconfigured"
            self.last_sync_message = "IBKR credentials are not configured in .env."
            return {
                "status": "unconfigured",
                "message": self.last_sync_message
            }

        if self.is_syncing:
            return {
                "status": "in_progress",
                "message": "A synchronization is already currently in progress."
            }

        self.is_syncing = True
        self.last_sync_status = "in_progress"

        try:
            logger.info("Connecting to IBKR Flex Web Service...")
            client = IBKRFlexClient(IBKR_TOKEN, IBKR_QUERY_ID)
            xml_data = await client.fetch_statement_xml()
            trades = client.parse_trades_xml(xml_data)

            count = upsert_trades(trades)
            now = datetime.now(timezone.utc)

            # Check if there is an outage gap between previous sync/import and now
            with db_session() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT MAX(completed_at) as last_completed FROM sync_history WHERE status = 'success';")
                sr = cursor.fetchone()
                if sr and sr["last_completed"]:
                    try:
                        prev_dt = datetime.fromisoformat(sr["last_completed"])
                        prev_tz = prev_dt if prev_dt.tzinfo else prev_dt.replace(tzinfo=timezone.utc)
                        days_diff = (now - prev_tz).days
                        if days_diff > 7:
                            # A gap was created because Flex Query only covers 7 days
                            cursor.execute("""
                                INSERT INTO sync_gaps (gap_days, from_date, to_date)
                                VALUES (?, ?, ?);
                            """, (days_diff, prev_tz.isoformat(), now.isoformat()))
                            logger.warning(f"Sync gap of {days_diff} days detected after server downtime/vacation. Created pending sync_gap record.")
                    except Exception as ex:
                        logger.debug(f"Error checking previous sync gap: {ex}")

                # Record successful sync
                cursor.execute("""
                    INSERT INTO sync_history (sync_type, status, trades_count, completed_at)
                    VALUES (?, 'success', ?, CURRENT_TIMESTAMP);
                """, (sync_type, count))

            self.last_sync_time = now
            self.last_api_sync_time = now
            self.last_sync_status = "success"
            self.last_trades_count = count
            self.last_sync_message = f"Synchronized {count} trades successfully."
            self.next_sync_time = self.calculate_next_sync_time()

            logger.info(self.last_sync_message)
            return {
                "status": "success",
                "message": self.last_sync_message,
                "trades_count": count,
                "last_sync_time": self.last_sync_time.isoformat(),
                "next_sync_time": self.next_sync_time.isoformat()
            }

        except Exception as e:
            err_str = str(e)
            if any(term in err_str for term in ["nodename nor servname", "gaierror", "Failed to resolve", "getaddrinfo"]):
                clean_msg = "Unable to connect to Interactive Brokers servers. Please check your internet connection."
            elif "1018" in err_str or "IP address not allowed" in err_str:
                clean_msg = "IBKR Error (1018): IP address not authorized in IBKR Flex Web Service settings."
            elif "1014" in err_str or "Token is invalid" in err_str:
                clean_msg = "IBKR Error (1014): Invalid or expired Flex Token."
            else:
                clean_msg = err_str

            self.last_sync_status = "failed"
            self.last_sync_message = clean_msg
            logger.error(f"Sync failed: {e}")
            return {
                "status": "failed",
                "message": clean_msg
            }
        finally:
            self.is_syncing = False

    async def _loop(self):
        """Background loop running on the server."""
        if not is_ibkr_configured():
            logger.info("IBKR credentials missing or placeholder. Scheduler loop will not run.")
            return

        # Calculate initial next sync
        self.next_sync_time = self.calculate_next_sync_time()

        while True:
            try:
                await asyncio.sleep(60)
                now = datetime.now(timezone.utc)

                # If market hours and time is past next_sync_time
                if self.is_market_hours(now) and self.next_sync_time:
                    if now >= self.next_sync_time and not self.is_syncing:
                        logger.info("Triggering scheduled market-hours sync...")
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

                # 1. Check for unresolved historical downtime gaps (e.g. from vacation/server downtime)
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
                    cursor.execute("SELECT MAX(completed_at) as last_completed FROM sync_history WHERE status = 'success';")
                    sr = cursor.fetchone()
                    if sr and sr["last_completed"]:
                        try:
                            last_sync_dt = datetime.fromisoformat(sr["last_completed"])
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
            # Database is empty (no syncs and no trades recorded yet)
            has_sync_gap = True
            gap_days = 7

        return {
            "is_configured": configured,
            "environment": ENVIRONMENT,
            "sync_mode": SYNC_MODE,
            "is_auto_sync_enabled": in_prod,
            "last_sync_time": self.last_sync_time.isoformat() if (configured and self.last_sync_time) else None,
            "next_sync_time": (self.next_sync_time.isoformat() if (self.next_sync_time and in_prod) else (self.calculate_next_sync_time().isoformat() if in_prod else None)) if configured else None,
            "status": status_val,
            "message": msg_val,
            "trades_count": self.last_trades_count if configured else 0,
            "is_syncing": self.is_syncing if configured else False,
            "cooldown_remaining_seconds": self.get_cooldown_remaining_seconds() if configured else 0,
            "is_market_hours": self.is_market_hours(),
            "has_sync_gap": has_sync_gap,
            "gap_days": gap_days,
            "gap_from": gap_from,
            "gap_to": gap_to,
            "last_trade_date": last_trade_date
        }


scheduler = SyncScheduler()

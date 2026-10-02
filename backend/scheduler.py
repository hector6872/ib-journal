import asyncio
import logging
from datetime import datetime, time, timedelta, timezone
try:
    from zoneinfo import ZoneInfo
except ImportError:
    try:
        from pytz import timezone as ZoneInfo
    except ImportError:
        ZoneInfo = None

from typing import Dict, Any, Optional


from backend.config import (
    IBKR_TOKEN,
    IBKR_QUERY_ID,
    is_ibkr_configured
)
from backend.database import upsert_trades, db_session
from backend.flex_client import IBKRFlexClient

logger = logging.getLogger("ib-journal.scheduler")


# Internal defaults (Hourly sync during active global market sessions)
SYNC_INTERVAL_MINUTES = 60
SYNC_COOLDOWN_SECONDS = 600

class SyncScheduler:
    def __init__(self):
        self.last_sync_time: Optional[datetime] = None
        self.last_sync_status: str = "idle"
        self.last_sync_message: str = "No sync performed yet."
        self.last_trades_count: int = 0
        self.is_syncing: bool = False
        self.next_sync_time: Optional[datetime] = None
        self._task: Optional[asyncio.Task] = None

    def is_market_hours(self, now: Optional[datetime] = None) -> bool:
        """
        Automatic market session detection.
        Covers European & US sessions (07:00 UTC to 21:00 UTC), Monday through Friday.
        Skips Saturday and Sunday.
        """
        if now is None:
            now = datetime.now(timezone.utc)
        else:
            now = now.astimezone(timezone.utc)

        # 0 = Monday, 6 = Sunday
        if now.weekday() >= 5:
            return False

        # 07:00 UTC (European open prep) to 21:15 UTC (US close buffer)
        return (now.hour > 7 or (now.hour == 7 and now.minute >= 0)) and (now.hour < 21 or (now.hour == 21 and now.minute <= 15))

    def get_cooldown_remaining_seconds(self) -> int:
        """Returns remaining seconds for manual sync cooldown."""
        if not self.last_sync_time:
            return 0
        now = datetime.now(timezone.utc)
        last = self.last_sync_time if self.last_sync_time.tzinfo else self.last_sync_time.replace(tzinfo=timezone.utc)
        elapsed = (now - last).total_seconds()
        remaining = int(SYNC_COOLDOWN_SECONDS - elapsed)
        return max(0, remaining)

    def calculate_next_sync_time(self) -> datetime:
        """Calculates next sync timestamp based on market hours and interval."""
        now = datetime.now(timezone.utc)
        
        # If currently in market hours, add SYNC_INTERVAL_MINUTES
        if self.is_market_hours(now):
            candidate = now + timedelta(minutes=SYNC_INTERVAL_MINUTES)
            close_dt = datetime.combine(now.date(), time(21, 15), tzinfo=timezone.utc)
            if candidate <= close_dt:
                return candidate

        # Otherwise calculate next market open (07:00 UTC)
        next_day = now.date()
        candidate_open = datetime.combine(next_day, time(7, 0), tzinfo=timezone.utc)

        if candidate_open <= now:
            next_day += timedelta(days=1)
            candidate_open = datetime.combine(next_day, time(7, 0), tzinfo=timezone.utc)

        while candidate_open.weekday() >= 5: # Skip weekends
            next_day += timedelta(days=1)
            candidate_open = datetime.combine(next_day, time(7, 0), tzinfo=timezone.utc)

        return candidate_open


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
            self.last_sync_time = datetime.now(timezone.utc)
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
            self.last_sync_status = "failed"
            self.last_sync_message = str(e)
            logger.error(f"Sync failed: {e}")
            return {
                "status": "failed",
                "message": str(e)
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
        if self._task is None:
            self._task = asyncio.create_task(self._loop())

    def stop(self):
        if self._task:
            self._task.cancel()
            self._task = None

    def get_status(self) -> Dict[str, Any]:
        configured = is_ibkr_configured()
        status_val = self.last_sync_status if configured else "unconfigured"
        msg_val = self.last_sync_message if configured else "IBKR credentials not configured in .env"

        return {
            "is_configured": configured,
            "last_sync_time": self.last_sync_time.isoformat() if (configured and self.last_sync_time) else None,
            "next_sync_time": (self.next_sync_time.isoformat() if self.next_sync_time else self.calculate_next_sync_time().isoformat()) if configured else None,
            "status": status_val,
            "message": msg_val,
            "trades_count": self.last_trades_count if configured else 0,
            "is_syncing": self.is_syncing if configured else False,
            "cooldown_remaining_seconds": self.get_cooldown_remaining_seconds() if configured else 0,
            "is_market_hours": self.is_market_hours()
        }


scheduler = SyncScheduler()

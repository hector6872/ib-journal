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
    MARKET_TIMEZONE,
    MARKET_OPEN_HOUR,
    MARKET_OPEN_MINUTE,
    MARKET_CLOSE_HOUR,
    MARKET_CLOSE_MINUTE,
    SYNC_INTERVAL_MINUTES,
    SYNC_COOLDOWN_SECONDS,
    IBKR_TOKEN,
    IBKR_QUERY_ID
)
from backend.database import upsert_trades, db_session
from backend.flex_client import IBKRFlexClient, generate_sample_trades

logger = logging.getLogger("ib-journal.scheduler")

class SyncScheduler:
    def __init__(self):
        self.last_sync_time: Optional[datetime] = None
        self.last_sync_status: str = "idle"
        self.last_sync_message: str = "No sync performed yet."
        self.last_trades_count: int = 0
        self.is_syncing: bool = False
        self.next_sync_time: Optional[datetime] = None
        self._task: Optional[asyncio.Task] = None
        
        try:
            self._tz = ZoneInfo(MARKET_TIMEZONE) if ZoneInfo else timezone.utc
        except Exception:
            self._tz = timezone.utc

    def _now(self) -> datetime:
        return datetime.now(self._tz)

    def is_market_hours(self, now: Optional[datetime] = None) -> bool:
        """
        Determines if current local time is within market hours plus 15-minute padding.
        Skips Saturday and Sunday.
        """
        if now is None:
            now = self._now()
        else:
            now = now.astimezone(self._tz)

        # 0 = Monday, 6 = Sunday
        if now.weekday() >= 5:
            return False

        # 15 minutes pre-market & post-market buffer
        open_time = time(MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE)
        close_time = time(MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE)

        open_dt = datetime.combine(now.date(), open_time, tzinfo=self._tz) - timedelta(minutes=15)
        close_dt = datetime.combine(now.date(), close_time, tzinfo=self._tz) + timedelta(minutes=15)

        return open_dt <= now <= close_dt

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
        now = self._now()
        
        # If currently in market hours, add SYNC_INTERVAL_MINUTES
        if self.is_market_hours(now):
            candidate = now + timedelta(minutes=SYNC_INTERVAL_MINUTES)
            close_time = time(MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE)
            close_dt = datetime.combine(now.date(), close_time, tzinfo=self._tz) + timedelta(minutes=15)
            if candidate <= close_dt:
                return candidate

        # Otherwise calculate next market open
        next_day = now.date()
        open_time = time(MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE)
        candidate_open = datetime.combine(next_day, open_time, tzinfo=self._tz) - timedelta(minutes=15)

        if candidate_open <= now:
            next_day += timedelta(days=1)
            candidate_open = datetime.combine(next_day, open_time, tzinfo=self._tz) - timedelta(minutes=15)

        while candidate_open.weekday() >= 5: # Skip weekends
            next_day += timedelta(days=1)
            candidate_open = datetime.combine(next_day, open_time, tzinfo=self._tz) - timedelta(minutes=15)

        return candidate_open

    async def execute_sync(self, sync_type: str = "scheduled") -> Dict[str, Any]:
        """
        Executes the sync operation against IBKR Flex Query (or generates mock data if unconfigured).
        """
        if self.is_syncing:
            return {
                "status": "in_progress",
                "message": "A synchronization is already currently in progress."
            }

        self.is_syncing = True
        self.last_sync_status = "in_progress"
        start_time = datetime.now(pytz.utc)

        try:
            # Check if real IBKR credentials are configured
            if IBKR_TOKEN and IBKR_QUERY_ID:
                logger.info("Syncing with live IBKR Flex Web Service...")
                client = IBKRFlexClient(IBKR_TOKEN, IBKR_QUERY_ID)
                xml_data = await client.fetch_statement_xml()
                trades = client.parse_trades_xml(xml_data)
            else:
                logger.info("No IBKR_TOKEN configured in .env. Checking database count or seeding initial sample data...")
                with db_session() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT COUNT(*) as cnt FROM trades")
                    cnt = cursor.fetchone()["cnt"]
                
                if cnt == 0:
                    trades = generate_sample_trades(num_trades=180)
                else:
                    # Generate 1-2 new incremental trades for demo
                    trades = generate_sample_trades(num_trades=2)

            count = upsert_trades(trades)
            self.last_sync_time = datetime.now(pytz.utc)
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
        # Calculate initial next sync
        self.next_sync_time = self.calculate_next_sync_time()

        while True:
            try:
                await asyncio.sleep(30)
                now = datetime.now(self._tz)
                
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
        if self._task is None:
            self._task = asyncio.create_task(self._loop())

    def stop(self):
        if self._task:
            self._task.cancel()
            self._task = None

    def get_status(self) -> Dict[str, Any]:
        return {
            "last_sync_time": self.last_sync_time.isoformat() if self.last_sync_time else None,
            "next_sync_time": self.next_sync_time.isoformat() if self.next_sync_time else self.calculate_next_sync_time().isoformat(),
            "status": self.last_sync_status,
            "message": self.last_sync_message,
            "trades_count": self.last_trades_count,
            "is_syncing": self.is_syncing,
            "cooldown_remaining_seconds": self.get_cooldown_remaining_seconds(),
            "is_market_hours": self.is_market_hours()
        }

scheduler = SyncScheduler()

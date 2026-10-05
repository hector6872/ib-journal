import logging
import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, Generator, List

from backend.config import DB_PATH


logger = logging.getLogger("ib-journal.db")


def get_connection() -> sqlite3.Connection:
    """
    Creates an SQLite connection configured with SD-card friendly PRAGMAs.
    - WAL Mode reduces disk writes and avoids locking.
    - Synchronous NORMAL guarantees integrity while avoiding excessive flush cycles.
    - In-memory temp store and generous memory cache minimize disk I/O.
    """
    conn = sqlite3.connect(
        str(DB_PATH),
        timeout=20.0,
        check_same_thread=False
    )
    conn.row_factory = sqlite3.Row

    # SD-Card preservation PRAGMAs
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA synchronous = NORMAL;")
    cursor.execute("PRAGMA temp_store = MEMORY;")
    cursor.execute("PRAGMA cache_size = -32000;")  # 32 MB in RAM
    cursor.execute("PRAGMA mmap_size = 67108864;") # 64 MB MMAP
    cursor.close()

    return conn

@contextmanager
def db_session() -> Generator[sqlite3.Connection, None, None]:
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Database error, rolling back: {e}")
        raise
    finally:
        conn.close()

def init_db():
    """Initializes the database schema with necessary tables and indexes."""
    with db_session() as conn:
        cursor = conn.cursor()

        # Trades Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ib_exec_id TEXT UNIQUE NOT NULL,
            trade_id TEXT,
            account_id TEXT,
            symbol TEXT NOT NULL,
            description TEXT,
            asset_category TEXT,       -- STK, OPT, FUT, CASH, etc.
            currency TEXT DEFAULT 'EUR',
            buy_sell TEXT NOT NULL,     -- BUY, SELL
            quantity REAL NOT NULL,
            trade_price REAL NOT NULL,
            trade_money REAL,           -- Total value (quantity * price)
            proceeds REAL,
            ib_commission REAL DEFAULT 0.0,
            realized_pnl REAL DEFAULT 0.0,
            trade_date TEXT NOT NULL,   -- YYYY-MM-DD
            trade_time TEXT,           -- HH:MM:SS
            trade_date_time TEXT,      -- YYYY-MM-DDTHH:MM:SS
            open_close_indicator TEXT, -- O, C, O/C
            order_type TEXT DEFAULT 'MKT', -- LMT, MKT, STP, STP LMT
            exchange TEXT DEFAULT 'SMART', -- NASDAQ, NYSE, SMART, etc.
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # Performance Indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(trade_date);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_category ON trades(asset_category);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_pnl ON trades(realized_pnl);")

        # Column migrations
        cursor.execute("PRAGMA table_info(trades);")
        cols = [c[1] for c in cursor.fetchall()]
        if "order_type" not in cols:
            cursor.execute("ALTER TABLE trades ADD COLUMN order_type TEXT DEFAULT 'MKT';")
        if "exchange" not in cols:
            cursor.execute("ALTER TABLE trades ADD COLUMN exchange TEXT DEFAULT 'SMART';")

        # Sync History Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sync_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_type TEXT NOT NULL,      -- 'scheduled', 'manual', 'initial', 'manual_import', 'cli_import'
            status TEXT NOT NULL,         -- 'success', 'failed', 'in_progress'
            trades_count INTEGER DEFAULT 0,
            error_message TEXT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME
        );
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sync_started ON sync_history(started_at);")

        # Sync Gaps Table (Tracks periods of outage/vacation until resolved by full statement import)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sync_gaps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gap_days INTEGER NOT NULL,
            from_date TEXT,
            to_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME
        );
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sync_gaps_resolved ON sync_gaps(resolved_at);")

        logger.info("Database initialized successfully with WAL mode.")

def upsert_trades(trades: List[Dict[str, Any]]) -> int:
    """
    Inserts or updates trades in batches for maximum efficiency and minimum disk writes.
    Returns the count of upserted trades.
    """
    if not trades:
        return 0

    sql = """
    INSERT INTO trades (
        ib_exec_id, trade_id, account_id, symbol, description, asset_category,
        currency, buy_sell, quantity, trade_price, trade_money, proceeds,
        ib_commission, realized_pnl, trade_date, trade_time, trade_date_time,
        open_close_indicator, order_type, exchange
    ) VALUES (
        :ib_exec_id, :trade_id, :account_id, :symbol, :description, :asset_category,
        :currency, :buy_sell, :quantity, :trade_price, :trade_money, :proceeds,
        :ib_commission, :realized_pnl, :trade_date, :trade_time, :trade_date_time,
        :open_close_indicator, :order_type, :exchange
    )
    ON CONFLICT(ib_exec_id) DO UPDATE SET
        realized_pnl = excluded.realized_pnl,
        ib_commission = excluded.ib_commission,
        proceeds = excluded.proceeds,
        open_close_indicator = excluded.open_close_indicator,
        order_type = excluded.order_type,
        exchange = excluded.exchange,
        notes = trades.notes;
    """

    with db_session() as conn:
        cursor = conn.cursor()
        cursor.executemany(sql, trades)
        affected = cursor.rowcount
        return affected

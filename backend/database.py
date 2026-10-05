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
            raw_currency TEXT DEFAULT 'EUR',
            base_currency TEXT DEFAULT 'EUR',
            fx_rate_to_base REAL DEFAULT 1.0,
            raw_commission REAL DEFAULT 0.0,
            raw_realized_pnl REAL DEFAULT 0.0,
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
        if "raw_currency" not in cols:
            cursor.execute("ALTER TABLE trades ADD COLUMN raw_currency TEXT DEFAULT 'EUR';")
        if "base_currency" not in cols:
            cursor.execute("ALTER TABLE trades ADD COLUMN base_currency TEXT DEFAULT 'EUR';")
        if "fx_rate_to_base" not in cols:
            cursor.execute("ALTER TABLE trades ADD COLUMN fx_rate_to_base REAL DEFAULT 1.0;")
        if "raw_commission" not in cols:
            cursor.execute("ALTER TABLE trades ADD COLUMN raw_commission REAL DEFAULT 0.0;")
        if "raw_realized_pnl" not in cols:
            cursor.execute("ALTER TABLE trades ADD COLUMN raw_realized_pnl REAL DEFAULT 0.0;")

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
        open_close_indicator, order_type, exchange,
        raw_currency, base_currency, fx_rate_to_base, raw_commission, raw_realized_pnl
    ) VALUES (
        :ib_exec_id, :trade_id, :account_id, :symbol, :description, :asset_category,
        :currency, :buy_sell, :quantity, :trade_price, :trade_money, :proceeds,
        :ib_commission, :realized_pnl, :trade_date, :trade_time, :trade_date_time,
        :open_close_indicator, :order_type, :exchange,
        :raw_currency, :base_currency, :fx_rate_to_base, :raw_commission, :raw_realized_pnl
    )
    ON CONFLICT(ib_exec_id) DO UPDATE SET
        realized_pnl = excluded.realized_pnl,
        ib_commission = excluded.ib_commission,
        proceeds = excluded.proceeds,
        open_close_indicator = excluded.open_close_indicator,
        order_type = excluded.order_type,
        exchange = excluded.exchange,
        raw_currency = excluded.raw_currency,
        base_currency = excluded.base_currency,
        fx_rate_to_base = excluded.fx_rate_to_base,
        raw_commission = excluded.raw_commission,
        raw_realized_pnl = excluded.raw_realized_pnl,
        notes = trades.notes;
    """

    sanitized_trades = []
    for t in trades:
        curr = t.get("currency") or "EUR"
        raw_curr = t.get("raw_currency") or curr
        base_curr = t.get("base_currency") or "EUR"
        fx_rate = float(t.get("fx_rate_to_base") or 1.0)
        comm = float(t.get("ib_commission") or 0.0)
        raw_comm = float(t.get("raw_commission") if t.get("raw_commission") is not None else comm)
        pnl = float(t.get("realized_pnl") or 0.0)
        raw_pnl = float(t.get("raw_realized_pnl") if t.get("raw_realized_pnl") is not None else pnl)

        sanitized_trades.append({
            "ib_exec_id": t.get("ib_exec_id", ""),
            "trade_id": t.get("trade_id") or t.get("ib_exec_id", ""),
            "account_id": t.get("account_id", ""),
            "symbol": t.get("symbol", ""),
            "description": t.get("description", ""),
            "asset_category": t.get("asset_category", "STK"),
            "currency": curr,
            "raw_currency": raw_curr,
            "base_currency": base_curr,
            "buy_sell": t.get("buy_sell", "BUY"),
            "quantity": float(t.get("quantity") or 0.0),
            "trade_price": float(t.get("trade_price") or 0.0),
            "trade_money": float(t.get("trade_money") or 0.0),
            "proceeds": float(t.get("proceeds") or 0.0),
            "fx_rate_to_base": fx_rate,
            "raw_commission": raw_comm,
            "raw_realized_pnl": raw_pnl,
            "ib_commission": comm,
            "realized_pnl": pnl,
            "trade_date": t.get("trade_date", ""),
            "trade_time": t.get("trade_time", ""),
            "trade_date_time": t.get("trade_date_time", ""),
            "open_close_indicator": t.get("open_close_indicator", "C"),
            "order_type": t.get("order_type", "MKT"),
            "exchange": t.get("exchange", "SMART"),
        })

    with db_session() as conn:
        cursor = conn.cursor()
        cursor.executemany(sql, sanitized_trades)
        affected = cursor.rowcount
        return affected

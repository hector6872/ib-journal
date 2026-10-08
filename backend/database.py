import logging
import re
import sqlite3
from contextlib import contextmanager
from datetime import date
from typing import Any, Dict, Generator, List, Optional

from backend.config import DB_PATH


logger = logging.getLogger("ib-journal.db")

MONTHS = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def normalize_symbol(symbol: str, description: str = "", asset_category: str = "STK") -> str:
    """
    Normalizes option and asset symbols into clean, consistent, human-readable format:
    - OCC option format 'QQQ   261001C00743000' -> 'QQQ 01OCT26 743 C'
    - Description fallback if valid option format
    - Removes internal duplicate whitespace
    """
    sym = (symbol or "").strip().upper()
    desc = (description or "").strip().upper()
    cat = (asset_category or "").strip().upper()

    # 1. If description contains a clean human-readable option name like 'QQQ 01OCT26 743 C', prefer it for OPT
    if cat == "OPT" or "OPT" in sym or re.search(r"\b\d{2}[A-Z]{3}\d{2}\b", desc):
        if re.match(r"^[A-Z0-9\.\s/]+ \d{2}[A-Z]{3}\d{2} [\d\.]+ [CP]$", desc):
            return " ".join(desc.split())

    # 2. Check OCC format in symbol: e.g. 'QQQ   261001C00743000' or 'QQQ261001C00743000'
    m = re.match(r"^([A-Z0-9\.\s/]+?)\s*(\d{2})(\d{2})(\d{2})([CP])(\d{8})$", sym)
    if m:
        root = m.group(1).strip()
        yy = m.group(2)
        mm = int(m.group(3))
        dd = m.group(4)
        opt_type = m.group(5)
        strike_raw = int(m.group(6)) / 1000.0
        strike_str = f"{strike_raw:.2f}".rstrip("0").rstrip(".") if strike_raw % 1 != 0 else str(int(strike_raw))
        month_str = MONTHS[mm] if 1 <= mm <= 12 else f"{mm:02d}"
        return f"{root} {dd}{month_str}{yy} {strike_str} {opt_type}"

    return " ".join(sym.split())


def cleanup_duplicate_trades(conn: sqlite3.Connection) -> int:
    """
    Cleans up duplicate trades:
    1. Normalizes symbol names in trades table.
    2. Deletes placeholder GEN_% trades if an official execution (real ib_exec_id) exists for the same trade.
    """
    cursor = conn.cursor()
    # 1. Normalize all symbols
    cursor.execute("SELECT id, symbol, description, asset_category FROM trades;")
    rows = cursor.fetchall()
    for r in rows:
        norm = normalize_symbol(r["symbol"], r["description"] or "", r["asset_category"] or "STK")
        if norm != r["symbol"]:
            cursor.execute("UPDATE trades SET symbol = ? WHERE id = ?;", (norm, r["id"]))

    # 2. Delete GEN_% trades when matching real ib_exec_id trades exist
    cursor.execute("""
        DELETE FROM trades
        WHERE ib_exec_id LIKE 'GEN_%'
        AND EXISTS (
            SELECT 1 FROM trades t_real
            WHERE t_real.ib_exec_id NOT LIKE 'GEN_%'
              AND t_real.trade_date = trades.trade_date
              AND t_real.trade_time = trades.trade_time
              AND (t_real.symbol = trades.symbol OR t_real.description = trades.symbol)
              AND t_real.buy_sell = trades.buy_sell
              AND ABS(t_real.trade_price - trades.trade_price) < 0.0001
        );
    """)
    # 3. Delete ghost trades with zero quantity
    cursor.execute("""
        DELETE FROM trades
        WHERE ABS(quantity) < 1e-5;
    """)
    deleted_count = cursor.rowcount
    if deleted_count > 0:
        logger.info(f"Cleaned up {deleted_count} duplicate placeholder trades superseded by official executions.")
    return deleted_count


def get_connection() -> sqlite3.Connection:
    """
    Creates an SQLite connection configured with SD-card friendly PRAGMAs.
    - WAL Mode reduces disk writes and avoids locking.
    - Synchronous NORMAL guarantees integrity while avoiding excessive flush cycles.
    - In-memory temp store and generous memory cache minimize disk I/O.
    """
    conn = sqlite3.connect(str(DB_PATH), timeout=20.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row

    # SD-Card preservation PRAGMAs
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA synchronous = NORMAL;")
    cursor.execute("PRAGMA temp_store = MEMORY;")
    cursor.execute("PRAGMA cache_size = -32000;")  # 32 MB in RAM
    cursor.execute("PRAGMA mmap_size = 67108864;")  # 64 MB MMAP
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

        # Cash Transactions Table (Deposits, Withdrawals, Transfers, Dividends)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS cash_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT UNIQUE NOT NULL,
            account_id TEXT,
            type TEXT NOT NULL,          -- 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'DIVIDEND', 'INTEREST'
            amount REAL NOT NULL,        -- Positive for deposit/inflow, negative for withdrawal/outflow (in base currency)
            raw_amount REAL,
            currency TEXT DEFAULT 'EUR',
            raw_currency TEXT DEFAULT 'EUR',
            base_currency TEXT DEFAULT 'EUR',
            fx_rate_to_base REAL DEFAULT 1.0,
            transaction_date TEXT NOT NULL, -- YYYY-MM-DD
            transaction_time TEXT,
            description TEXT,
            is_manual BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cash_date ON cash_transactions(transaction_date);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cash_type ON cash_transactions(type);")

        # Deduplicate and normalize symbols on initialization
        cleanup_duplicate_trades(conn)

        # Reconcile FIFO PnL on any unassigned executions
        reconcile_fifo_pnl(cursor)

        # Reconcile any existing cash transactions with incorrect positive signs or types for fees/taxes/subscriptions
        cursor.execute("""
            UPDATE cash_transactions
            SET amount = -ABS(amount),
                raw_amount = -ABS(COALESCE(raw_amount, amount)),
                type = CASE 
                    WHEN UPPER(description) LIKE '%OPRA%' 
                         OR UPPER(description) LIKE '%SUBSCRIPTION%' 
                         OR UPPER(description) LIKE '%SUSCRIPCI%' 
                         OR UPPER(description) LIKE '%MARKET DATA%' 
                         OR UPPER(description) LIKE '%NP L1%' 
                         OR UPPER(description) LIKE '%L1 FOR%' 
                         OR UPPER(description) LIKE '%L2 FOR%' 
                         THEN 'SUBSCRIPTION'
                    WHEN UPPER(description) LIKE '%TAX%' 
                         OR UPPER(description) LIKE '%RETENCI%' 
                         OR UPPER(description) LIKE '%WITHHOLDING%' 
                         OR UPPER(description) LIKE '%IMPUESTO%' 
                         THEN 'WITHHOLDING TAX'
                    WHEN UPPER(description) LIKE '%FEE%' 
                         OR UPPER(description) LIKE '%COMISI%' 
                         THEN 'FEE'
                    ELSE 'WITHDRAWAL'
                END
            WHERE (
                UPPER(description) LIKE '%OPRA%' 
                OR UPPER(description) LIKE '%SUBSCRIPTION%' 
                OR UPPER(description) LIKE '%SUSCRIPCI%' 
                OR UPPER(description) LIKE '%MARKET DATA%' 
                OR UPPER(description) LIKE '%NP L1%' 
                OR UPPER(description) LIKE '%L1 FOR%' 
                OR UPPER(description) LIKE '%L2 FOR%' 
                OR UPPER(description) LIKE '%FEE%' 
                OR UPPER(description) LIKE '%- US TAX%' 
                OR UPPER(description) LIKE '%WITHHOLDING%'
                OR UPPER(description) LIKE '%RETENCI%'
                OR UPPER(description) LIKE '%IMPUESTO%'
            );
        """)

        cursor.execute("""
            UPDATE cash_transactions
            SET type = 'DIVIDEND'
            WHERE (UPPER(description) LIKE '%DIVIDEND%' OR UPPER(description) LIKE '%DIVIDENDO%')
              AND UPPER(description) NOT LIKE '%TAX%' 
              AND UPPER(description) NOT LIKE '%RETENCI%' 
              AND UPPER(description) NOT LIKE '%WITHHOLDING%'
              AND UPPER(description) NOT LIKE '%IMPUESTO%'
              AND amount > 0;
        """)

        logger.info("Database initialized successfully with WAL mode.")


def upsert_trades(trades: List[Dict[str, Any]]) -> int:
    """
    Inserts or updates trades in batches for maximum efficiency and minimum disk writes.
    Deduplicates between CSV (GEN_*) placeholders and official Flex executions.
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
        symbol = excluded.symbol,
        description = excluded.description,
        asset_category = excluded.asset_category,
        currency = excluded.currency,
        buy_sell = excluded.buy_sell,
        quantity = excluded.quantity,
        trade_price = excluded.trade_price,
        trade_money = excluded.trade_money,
        proceeds = excluded.proceeds,
        ib_commission = excluded.ib_commission,
        realized_pnl = excluded.realized_pnl,
        trade_date = excluded.trade_date,
        trade_time = excluded.trade_time,
        trade_date_time = excluded.trade_date_time,
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
        qty = float(t.get("quantity") or 0.0)
        if abs(qty) < 1e-5:
            continue
        curr = t.get("currency") or "EUR"
        raw_curr = t.get("raw_currency") or curr
        base_curr = t.get("base_currency") or "EUR"
        fx_rate = float(t.get("fx_rate_to_base") or 1.0)
        comm = float(t.get("ib_commission") or 0.0)
        raw_comm_val = t.get("raw_commission")
        raw_comm = float(raw_comm_val) if raw_comm_val is not None else comm
        pnl = float(t.get("realized_pnl") or 0.0)
        raw_pnl_val = t.get("raw_realized_pnl")
        raw_pnl = float(raw_pnl_val) if raw_pnl_val is not None else pnl
        asset_cat = t.get("asset_category", "STK")
        desc = t.get("description", "")
        raw_sym = t.get("symbol", "")
        sym = normalize_symbol(raw_sym, desc, asset_cat)

        sanitized_trades.append(
            {
                "ib_exec_id": t.get("ib_exec_id", ""),
                "trade_id": t.get("trade_id") or t.get("ib_exec_id", ""),
                "account_id": t.get("account_id", ""),
                "symbol": sym,
                "description": desc or sym,
                "asset_category": asset_cat,
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
            }
        )

    # In-memory deduplication by ib_exec_id (keep last occurrence in batch)
    unique_trades_map = {}
    for st in sanitized_trades:
        if st["ib_exec_id"]:
            unique_trades_map[st["ib_exec_id"]] = st
        else:
            unique_trades_map[f"TEMP_{len(unique_trades_map)}"] = st
    sanitized_trades = list(unique_trades_map.values())

    with db_session() as conn:
        cursor = conn.cursor()

        # Step 1: For any official (non-GEN_) trade coming in, remove placeholder GEN_ trades matching same execution
        official_trades = [t for t in sanitized_trades if not t["ib_exec_id"].startswith("GEN_")]
        for ot in official_trades:
            cursor.execute(
                """
                DELETE FROM trades
                WHERE ib_exec_id LIKE 'GEN_%'
                  AND trade_date = ?
                  AND trade_time = ?
                  AND (symbol = ? OR description = ?)
                  AND buy_sell = ?
                  AND ABS(trade_price - ?) < 0.0001;
            """,
                (ot["trade_date"], ot["trade_time"], ot["symbol"], ot["symbol"], ot["buy_sell"], ot["trade_price"]),
            )

        # Step 2: For any GEN_ trade coming in, skip if an official trade or identical trade already exists
        trades_to_insert = []
        for t in sanitized_trades:
            if t["ib_exec_id"].startswith("GEN_"):
                cursor.execute(
                    """
                    SELECT id FROM trades
                    WHERE trade_date = ?
                      AND trade_time = ?
                      AND (symbol = ? OR description = ?)
                      AND buy_sell = ?
                      AND ABS(trade_price - ?) < 0.0001
                      AND (ib_exec_id NOT LIKE 'GEN_%' OR ib_exec_id = ?);
                """,
                    (
                        t["trade_date"],
                        t["trade_time"],
                        t["symbol"],
                        t["symbol"],
                        t["buy_sell"],
                        t["trade_price"],
                        t["ib_exec_id"],
                    ),
                )
                existing = cursor.fetchone()
                if existing:
                    # An official or existing trade already exists for this exact fill, skip inserting duplicate
                    continue
            trades_to_insert.append(t)

        if trades_to_insert:
            cursor.executemany(sql, trades_to_insert)

        # Step 3: Automatically reconcile FIFO P&L for intraday Trade Confirmation fills
        reconcile_fifo_pnl(cursor)

        return len(sanitized_trades)


def reconcile_fifo_pnl(conn_or_cursor=None):
    """
    Runs FIFO lot-matching on trades across all symbols to compute realized P&L
    for intraday Trade Confirmation fills that lack official EOD settled P&L.
    """
    from collections import defaultdict

    def _run_reconciliation(cursor):
        rows = cursor.execute(
            """
            SELECT id, symbol, asset_category, buy_sell, quantity, trade_price, 
                   proceeds, fx_rate_to_base, realized_pnl, raw_realized_pnl, open_close_indicator
            FROM trades
            ORDER BY trade_date ASC, COALESCE(trade_time, '00:00:00') ASC, id ASC
            """
        ).fetchall()

        by_sym = defaultdict(list)
        for r in rows:
            by_sym[r["symbol"]].append(dict(r))

        for sym, fills in by_sym.items():
            open_lots: list[dict[str, Any]] = []
            for fill in fills:
                qty = float(fill["quantity"])
                price = float(fill["trade_price"])
                cat = fill.get("asset_category", "STK")
                mult = 100.0 if (cat == "OPT" or "OPT" in sym or " " in sym) and cat != "CASH" else 1.0
                fx_rate = float(fill.get("fx_rate_to_base") or 1.0)
                existing_pnl = float(fill.get("realized_pnl") or 0.0)

                current_open_qty = sum(lot["qty"] for lot in open_lots)

                if len(open_lots) == 0 or (current_open_qty > 0 and qty > 0) or (current_open_qty < 0 and qty < 0):
                    # Opening lot
                    open_lots.append({"qty": qty, "price": price, "fx_rate": fx_rate, "id": fill["id"]})
                    if (fill.get("open_close_indicator") or "") not in ("O", "C;P"):
                        cursor.execute("UPDATE trades SET open_close_indicator = 'O' WHERE id = ?", (fill["id"],))
                else:
                    # Closing lot
                    rem_close_qty = abs(qty)
                    is_closing_long = current_open_qty > 0
                    calc_raw_pnl = 0.0

                    while rem_close_qty > 1e-6 and len(open_lots) > 0:
                        lot = open_lots[0]
                        match_qty = min(rem_close_qty, abs(lot["qty"]))

                        if is_closing_long:
                            lot_pnl = (price - lot["price"]) * match_qty * mult
                        else:
                            lot_pnl = (lot["price"] - price) * match_qty * mult

                        calc_raw_pnl += lot_pnl
                        rem_close_qty -= match_qty

                        if abs(lot["qty"]) <= match_qty + 1e-6:
                            open_lots.pop(0)
                        else:
                            if lot["qty"] > 0:
                                lot["qty"] -= match_qty
                            else:
                                lot["qty"] += match_qty

                    if rem_close_qty > 1e-6:
                        new_open_qty = rem_close_qty if qty > 0 else -rem_close_qty
                        open_lots.append({"qty": new_open_qty, "price": price, "fx_rate": fx_rate, "id": fill["id"]})

                    # If existing_pnl is 0 (or not set) and we calculated a non-zero PnL, update database record
                    if abs(existing_pnl) < 1e-6 and abs(calc_raw_pnl) > 1e-6:
                        calc_base_pnl = round(calc_raw_pnl * fx_rate, 4)
                        cursor.execute(
                            """
                            UPDATE trades 
                            SET realized_pnl = ?, raw_realized_pnl = ?, open_close_indicator = 'C' 
                            WHERE id = ?
                            """,
                            (calc_base_pnl, round(calc_raw_pnl, 4), fill["id"]),
                        )

    if conn_or_cursor is not None:
        _run_reconciliation(conn_or_cursor)
    else:
        with db_session() as conn:
            _run_reconciliation(conn.cursor())


def upsert_cash_transactions(transactions: List[Dict[str, Any]]) -> int:
    """
    Inserts or updates cash transactions (deposits, withdrawals, transfers, fees, taxes).
    Returns count of upserted records.
    """
    if not transactions:
        return 0

    sql = """
    INSERT INTO cash_transactions (
        transaction_id, account_id, type, amount, raw_amount,
        currency, raw_currency, base_currency, fx_rate_to_base,
        transaction_date, transaction_time, description, is_manual
    ) VALUES (
        :transaction_id, :account_id, :type, :amount, :raw_amount,
        :currency, :raw_currency, :base_currency, :fx_rate_to_base,
        :transaction_date, :transaction_time, :description, :is_manual
    )
    ON CONFLICT(transaction_id) DO UPDATE SET
        type = excluded.type,
        amount = excluded.amount,
        raw_amount = excluded.raw_amount,
        currency = excluded.currency,
        raw_currency = excluded.raw_currency,
        base_currency = excluded.base_currency,
        fx_rate_to_base = excluded.fx_rate_to_base,
        transaction_date = excluded.transaction_date,
        transaction_time = excluded.transaction_time,
        description = excluded.description;
    """

    sanitized = []
    for tx in transactions:
        raw_type = (tx.get("type") or tx.get("transaction_type") or "DEPOSIT").upper()
        amt_val = tx.get("amount") if tx.get("amount") is not None else tx.get("amount_in_base")
        raw_amt_val = tx.get("raw_amount")
        raw_val = float(amt_val) if amt_val is not None else float(raw_amt_val or 0.0)
        desc = str(tx.get("description") or "")
        desc_upper = desc.upper()

        is_negative = (
            raw_val < 0
            or (raw_amt_val is not None and float(raw_amt_val) < 0)
            or "WITHDRAW" in raw_type
            or "FEE" in raw_type
            or "TAX" in raw_type
            or "WITHHOLDING" in raw_type
            or "SUBSCRIPTION" in raw_type
            or "TAX" in desc_upper
            or "RETENCI" in desc_upper
            or "IMPUESTO" in desc_upper
            or "OPRA" in desc_upper
            or "SUBSCRIPTION" in desc_upper
            or "SUSCRIPCI" in desc_upper
            or "MARKET DATA" in desc_upper
        )

        if is_negative:
            amount = -abs(raw_val)
            raw_amount = -abs(float(raw_amt_val)) if raw_amt_val is not None else amount
            if (
                "SUBSCRIPTION" in raw_type
                or "SUBSCRIPTION" in desc_upper
                or "SUSCRIPCI" in desc_upper
                or "OPRA" in desc_upper
                or "MARKET DATA" in desc_upper
                or "NP L1" in desc_upper
                or "L1 FOR" in desc_upper
                or "L2 FOR" in desc_upper
                or "LEVEL 1" in desc_upper
                or "LEVEL 2" in desc_upper
                or "QUOTE" in desc_upper
            ):
                tx_type = "SUBSCRIPTION"
            elif (
                "TAX" in raw_type
                or "WITHHOLDING" in raw_type
                or "TAX" in desc_upper
                or "RETENCI" in desc_upper
                or "IMPUESTO" in desc_upper
            ):
                tx_type = "WITHHOLDING TAX"
            elif "FEE" in raw_type or "FEE" in desc_upper or "COMISI" in desc_upper:
                tx_type = "FEE"
            elif raw_type in ("WITHDRAWAL", "TRANSFER"):
                tx_type = raw_type
            else:
                tx_type = "WITHDRAWAL"
        else:
            amount = abs(raw_val)
            raw_amount = abs(float(raw_amt_val)) if raw_amt_val is not None else amount
            tx_type = raw_type if raw_type in ("DEPOSIT", "DIVIDEND", "TRANSFER", "INTEREST") else "DEPOSIT"

        fx = float(tx.get("fx_rate_to_base") or 1.0)
        sanitized.append(
            {
                "transaction_id": tx.get("transaction_id", ""),
                "account_id": tx.get("account_id", ""),
                "type": tx_type,
                "amount": amount,
                "raw_amount": raw_amount,
                "currency": tx.get("currency", "EUR"),
                "raw_currency": tx.get("raw_currency", "EUR"),
                "base_currency": tx.get("base_currency", "EUR"),
                "fx_rate_to_base": fx,
                "transaction_date": tx.get("transaction_date", date.today().isoformat()),
                "transaction_time": tx.get("transaction_time", ""),
                "description": desc,
                "is_manual": 1 if tx.get("is_manual") else 0,
            }
        )

    with db_session() as conn:
        cursor = conn.cursor()
        cursor.executemany(sql, sanitized)
        return cursor.rowcount


def get_cash_summary() -> Dict[str, Any]:
    """Returns cash summary metrics and list of transactions with itemized category stats."""
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                id, transaction_id, account_id, type, amount, raw_amount,
                currency, raw_currency, base_currency, fx_rate_to_base,
                transaction_date, transaction_time, description, is_manual, created_at
            FROM cash_transactions
            ORDER BY transaction_date DESC, id DESC
        """)
        rows = [dict(r) for r in cursor.fetchall()]

        total_deposits = sum(r["amount"] for r in rows if r["amount"] > 0 and r["type"] == "DEPOSIT")
        total_withdrawals = sum(
            abs(r["amount"]) for r in rows if r["amount"] < 0 and r["type"] in ("WITHDRAWAL", "TRANSFER")
        )
        total_dividends = sum(r["amount"] for r in rows if r["type"] == "DIVIDEND" and r["amount"] > 0)
        total_withholding_tax = sum(
            abs(r["amount"])
            for r in rows
            if r["type"] == "WITHHOLDING TAX" or ("TAX" in (r["type"] or "") and r["amount"] < 0)
        )
        total_subscriptions = sum(
            abs(r["amount"])
            for r in rows
            if r["type"] == "SUBSCRIPTION" or ("OPRA" in (r["description"] or "").upper() and r["amount"] < 0)
        )
        total_fees = sum(abs(r["amount"]) for r in rows if r["type"] == "FEE")

        all_inflows = sum(r["amount"] for r in rows if r["amount"] > 0)
        all_outflows = sum(abs(r["amount"]) for r in rows if r["amount"] < 0)
        net_cash_flow = sum(r["amount"] for r in rows)

        return {
            "total_deposits": round(total_deposits, 2),
            "total_withdrawals": round(total_withdrawals, 2),
            "total_dividends": round(total_dividends, 2),
            "total_withholding_tax": round(total_withholding_tax, 2),
            "total_subscriptions": round(total_subscriptions, 2),
            "total_fees": round(total_fees, 2),
            "all_inflows": round(all_inflows, 2),
            "all_outflows": round(all_outflows, 2),
            "net_cash_flow": round(net_cash_flow, 2),
            "transactions_count": len(rows),
            "transactions": rows,
        }


def add_manual_cash_transaction(data: Dict[str, Any]) -> Dict[str, Any]:
    """Adds a manual deposit or withdrawal."""
    import uuid

    tx_type = (data.get("type") or "DEPOSIT").upper()
    amount_val = abs(float(data.get("amount") or 0.0))
    amount = amount_val if tx_type == "DEPOSIT" else -amount_val
    tx_date = data.get("transaction_date") or date.today().isoformat()
    desc = data.get("description") or ("Manual Deposit" if tx_type == "DEPOSIT" else "Manual Withdrawal")
    curr = (data.get("currency") or "EUR").upper()

    tx_id = f"MAN_{uuid.uuid4().hex[:12]}"
    base_curr = get_active_base_currency()
    record = {
        "transaction_id": tx_id,
        "account_id": data.get("account_id", "MANUAL"),
        "type": tx_type,
        "amount": amount,
        "raw_amount": amount,
        "currency": curr,
        "raw_currency": curr,
        "base_currency": curr or base_curr,
        "fx_rate_to_base": 1.0,
        "transaction_date": tx_date,
        "transaction_time": data.get("transaction_time", "12:00:00"),
        "description": desc,
        "is_manual": True,
    }
    upsert_cash_transactions([record])
    return record


def delete_cash_transaction(tx_id_or_id: Any) -> bool:
    """Deletes a manual cash transaction by id or transaction_id (only manual records can be deleted)."""
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            DELETE FROM cash_transactions
            WHERE (id = ? OR transaction_id = ?) AND is_manual = 1
        """,
            (str(tx_id_or_id), str(tx_id_or_id)),
        )
        return cursor.rowcount > 0


CURRENCY_SYMBOLS: Dict[str, str] = {
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "JPY": "¥",
    "CAD": "C$",
    "AUD": "A$",
    "CHF": "CHF",
    "CNY": "¥",
    "HKD": "HK$",
    "NZD": "NZ$",
    "SEK": "kr",
    "NOK": "kr",
    "DKK": "kr",
    "PLN": "zł",
    "BRL": "R$",
    "RUB": "₽",
    "INR": "₹",
    "MXN": "Mex$",
}


def get_active_base_currency() -> str:
    """Returns the account's active base currency from the most recent imported trade or cash tx, defaulting to USD."""
    try:
        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT base_currency FROM trades WHERE base_currency IS NOT NULL AND base_currency != '' ORDER BY trade_date DESC, id DESC LIMIT 1;"
            )
            row = cursor.fetchone()
            if row and row["base_currency"]:
                return str(row["base_currency"]).strip().upper()

            cursor.execute(
                "SELECT base_currency FROM cash_transactions WHERE base_currency IS NOT NULL AND base_currency != '' ORDER BY transaction_date DESC, id DESC LIMIT 1;"
            )
            row = cursor.fetchone()
            if row and row["base_currency"]:
                return str(row["base_currency"]).strip().upper()
    except Exception:
        pass
    return "USD"


def get_currency_symbol(currency_code: Optional[str] = None) -> str:
    """Maps ISO 3-letter currency code to UI display symbol, defaulting to '$' for USD."""
    code = (currency_code or get_active_base_currency()).strip().upper()
    return CURRENCY_SYMBOLS.get(code, "$")

import tempfile
import unittest
from pathlib import Path

import backend.config as config
import backend.database as database
import backend.settings as settings_mod
from backend.analytics import get_detailed_stats, get_overview_stats
from backend.config import is_production
from backend.database import db_session, init_db, upsert_trades
from backend.settings import get_all_settings, update_settings
from scripts.import_trades import parse_datetime_str, parse_ibkr_activity_statement_csv


class TestIBKRJournal(unittest.TestCase):

    def setUp(self):
        """Creates an isolated temporary SQLite database for each test run."""
        self.tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.test_db_path = Path(self.tmp_db.name)
        self.tmp_db.close()

        self.orig_db_path = config.DB_PATH
        config.DB_PATH = self.test_db_path
        database.DB_PATH = self.test_db_path
        init_db()

        from backend.scheduler import scheduler
        scheduler.last_sync_time = None
        scheduler.last_api_sync_time = None
        scheduler.last_trades_count = 0

    def tearDown(self):
        from backend.scheduler import scheduler
        scheduler.last_sync_time = None
        scheduler.last_api_sync_time = None
        scheduler.last_trades_count = 0

        config.DB_PATH = self.orig_db_path
        database.DB_PATH = self.orig_db_path
        if self.test_db_path.exists():
            try:
                self.test_db_path.unlink()
            except Exception:
                pass

    def test_database_init(self):
        """Verifies SQLite tables and columns exist."""
        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = [r["name"] for r in cursor.fetchall()]
            self.assertIn("trades", tables)
            self.assertIn("sync_history", tables)

            cursor.execute("PRAGMA table_info(trades);")
            cols = [r["name"] for r in cursor.fetchall()]
            self.assertIn("order_type", cols)
            self.assertIn("exchange", cols)
            self.assertIn("asset_category", cols)

    def test_upsert_trades_idempotence(self):
        """Ensures trades can be upserted repeatedly without creating duplicate rows."""
        trades = [
            {
                "ib_exec_id": "EXEC_1001",
                "trade_id": "T1001",
                "account_id": "U123456",
                "symbol": "NVDA",
                "description": "NVIDIA CORP",
                "asset_category": "STK",
                "currency": "EUR",
                "buy_sell": "BUY",
                "quantity": 10.0,
                "trade_price": 120.0,
                "trade_money": 1200.0,
                "proceeds": -1200.0,
                "ib_commission": 1.5,
                "realized_pnl": 50.0,
                "trade_date": "2024-05-10",
                "trade_time": "14:30:00",
                "trade_date_time": "2024-05-10T14:30:00",
                "open_close_indicator": "C",
                "order_type": "LMT",
                "exchange": "NASDAQ",
            }
        ]

        count1 = upsert_trades(trades)
        self.assertEqual(count1, 1)

        # Second upsert with updated PnL
        trades[0]["realized_pnl"] = 75.0
        count2 = upsert_trades(trades)
        self.assertEqual(count2, 1)

        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as total, realized_pnl FROM trades WHERE ib_exec_id = 'EXEC_1001';")
            row = cursor.fetchone()
            self.assertEqual(row["total"], 1)
            self.assertEqual(row["realized_pnl"], 75.0)

    def test_analytics_calculations(self):
        """Verifies analytics computation for overview, calendars, and detailed stats."""
        sample_trades = [
            {
                "ib_exec_id": "EXEC_W1",
                "trade_id": "TW1",
                "account_id": "U123456",
                "symbol": "AAPL",
                "description": "APPLE INC",
                "asset_category": "STK",
                "currency": "EUR",
                "buy_sell": "SELL",
                "quantity": 5.0,
                "trade_price": 180.0,
                "trade_money": 900.0,
                "proceeds": 900.0,
                "ib_commission": 1.0,
                "realized_pnl": 100.0,
                "trade_date": "2024-05-15",
                "trade_time": "15:00:00",
                "trade_date_time": "2024-05-15T15:00:00",
                "open_close_indicator": "C",
                "order_type": "LMT",
                "exchange": "NASDAQ",
            },
            {
                "ib_exec_id": "EXEC_L1",
                "trade_id": "TL1",
                "account_id": "U123456",
                "symbol": "TSLA",
                "description": "TESLA INC",
                "asset_category": "STK",
                "currency": "EUR",
                "buy_sell": "SELL",
                "quantity": 2.0,
                "trade_price": 200.0,
                "trade_money": 400.0,
                "proceeds": 400.0,
                "ib_commission": 1.0,
                "realized_pnl": -40.0,
                "trade_date": "2024-05-15",
                "trade_time": "16:00:00",
                "trade_date_time": "2024-05-15T16:00:00",
                "open_close_indicator": "C",
                "order_type": "MKT",
                "exchange": "NASDAQ",
            }
        ]

        upsert_trades(sample_trades)

        ov = get_overview_stats()
        self.assertEqual(ov["total_trades"], 2)
        self.assertEqual(ov["winning_trades"], 1)
        self.assertEqual(ov["losing_trades"], 1)
        self.assertEqual(ov["win_rate"], 50.0)
        self.assertEqual(ov["net_pnl"], 58.0)

        detailed = get_detailed_stats()
        self.assertIn("holding_durations", detailed)
        self.assertIn("order_types", detailed)
        self.assertEqual(len(detailed["symbols"]), 2)

    def test_import_script_parsers(self):
        """Tests parsing logic for IBKR Activity Statement and Generic Flex CSVs."""
        sample_activity = """Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Realized P/L,MTM P/L,Code
Trades,Data,Order,Stocks,EUR,NVDA,"2023-01-15, 15:30:00",10,180.50,180.50,-1805.00,-1.50,120.00,0,O
Trades,Data,Order,Equity and Index Options,EUR,SPY 230120C400000,"2023-01-16, 16:00:00",1,3.20,3.20,-320.00,-0.80,-50.00,0,C
"""
        trades = parse_ibkr_activity_statement_csv(sample_activity.splitlines())
        self.assertEqual(len(trades), 2)
        self.assertEqual(trades[0]["symbol"], "NVDA")
        self.assertEqual(trades[0]["asset_category"], "STK")
        self.assertEqual(trades[1]["asset_category"], "OPT")

        # Test full Activity Statement where Trades starts deep after NAV/Account sections
        sample_full_activity = """Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers Ireland Limited
Account Information,Header,Field Name,Field Value
Account Information,Data,Account,U6920617
Net Asset Value,Header,Asset Class,Prior Total,Current Long,Current Short,Current Total,Change
Net Asset Value,Data,Stock,641.46,1342.39,0,1342.39,700.92
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Stocks,CAD,AFM,"2023-01-20, 14:42:59",50,1,1,-50,-0.27,50.27,0,0,O
Trades,Data,Order,Stocks,CAD,NGEX,"2023-03-08, 10:31:47",-16,3.24,3.27,51.84,-0.2656,-50.3368,1.2376,-0.48,C
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,,Proceeds,Comm in EUR,,,MTM in EUR,Code
Trades,Data,Order,Forex,AUD,EUR.AUD,"2023-12-14, 12:18:41",-77,1.63815,,126.13755,-1.83912,,,-0.130516,
"""
        full_trades = parse_ibkr_activity_statement_csv(sample_full_activity.splitlines())
        self.assertEqual(len(full_trades), 3)
        self.assertEqual(full_trades[0]["account_id"], "U6920617")
        self.assertEqual(full_trades[0]["symbol"], "AFM")
        self.assertEqual(full_trades[1]["symbol"], "NGEX")
        self.assertEqual(full_trades[1]["raw_currency"], "CAD")
        self.assertEqual(full_trades[1]["raw_realized_pnl"], 1.2376)
        self.assertEqual(full_trades[1]["realized_pnl"], 0.8465)  # 1.2376 CAD * 0.684 CAD/EUR
        self.assertEqual(full_trades[2]["symbol"], "EUR.AUD")
        self.assertEqual(full_trades[2]["asset_category"], "CASH")
        self.assertEqual(full_trades[2]["ib_commission"], 1.83912)

        t_date, t_time, t_iso = parse_datetime_str("2023-05-12, 14:32:00")
        self.assertEqual(t_date, "2023-05-12")
        self.assertEqual(t_time, "14:32:00")
        self.assertEqual(t_iso, "2023-05-12T14:32:00")

    def test_settings_persistence(self):
        """Tests reading and updating settings."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp_set:
            settings_file = Path(tmp_set.name)
        tmp_set.close()

        orig_path = settings_mod.SETTINGS_PATH
        settings_mod.SETTINGS_PATH = settings_file

        try:
            updated = update_settings({"starting_capital": 50000.0, "ignore_ui_key": "val"})
            self.assertEqual(updated["starting_capital"], 50000.0)
            self.assertNotIn("ignore_ui_key", updated)

            loaded = get_all_settings()
            self.assertEqual(loaded["starting_capital"], 50000.0)
            self.assertNotIn("ignore_ui_key", loaded)
        finally:
            settings_mod.SETTINGS_PATH = orig_path
            if settings_file.exists():
                settings_file.unlink()

    def test_environment_auto_sync_toggle(self):
        """Tests that dev/debug mode disables automatic sync, while prod enables it."""
        orig_env = config.ENVIRONMENT
        orig_debug = config.DEBUG
        try:
            config.ENVIRONMENT = "dev"
            config.DEBUG = False
            self.assertFalse(is_production())

            config.ENVIRONMENT = "debug"
            self.assertFalse(is_production())

            config.ENVIRONMENT = "prod"
            config.DEBUG = False
            self.assertTrue(is_production())

            config.ENVIRONMENT = "prod"
            config.DEBUG = True
            self.assertFalse(is_production())
        finally:
            config.ENVIRONMENT = orig_env
            config.DEBUG = orig_debug

    def test_sync_gap_detection(self):
        """Verifies 7-day sync gap detection for old trades or sync history."""
        from datetime import datetime, timedelta, timezone
        from backend.scheduler import scheduler

        # 1. No data in DB => has_sync_gap True (prompts initial import)
        status = scheduler.get_status()
        self.assertTrue(status["has_sync_gap"])
        self.assertGreaterEqual(status["gap_days"], 7)

        # 2. Add a trade from 10 days ago
        ten_days_ago = (datetime.now(timezone.utc) - timedelta(days=10)).date().isoformat()
        upsert_trades([
            {
                "ib_exec_id": "EXEC_OLD_1",
                "trade_id": "T_OLD",
                "account_id": "U123456",
                "symbol": "AAPL",
                "description": "APPLE INC",
                "asset_category": "STK",
                "currency": "EUR",
                "buy_sell": "BUY",
                "quantity": 1.0,
                "trade_price": 150.0,
                "trade_money": 150.0,
                "proceeds": -150.0,
                "ib_commission": 1.0,
                "realized_pnl": 0.0,
                "trade_date": ten_days_ago,
                "trade_time": "10:00:00",
                "trade_date_time": f"{ten_days_ago}T10:00:00",
                "open_close_indicator": "O",
                "order_type": "MKT",
                "exchange": "NASDAQ",
            }
        ])

        status = scheduler.get_status()
        self.assertTrue(status["has_sync_gap"])
        self.assertGreaterEqual(status["gap_days"], 7)

        # 3. Add recent manual import to sync_history => gap cleared
        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO sync_history (sync_type, status, trades_count, completed_at)
                VALUES ('manual_import', 'success', 1, CURRENT_TIMESTAMP);
            """)

        status = scheduler.get_status()
        self.assertFalse(status["has_sync_gap"])
        self.assertLess(status["gap_days"], 7)

    def test_vacation_and_downtime_sync_gap(self):
        """
        Tests the vacation scenario (>31 days away):
        1. Last sync was 35 days ago.
        2. Flex sync runs today (fetching only last 7 days).
        3. A sync_gaps record is created and persists has_sync_gap = True despite recent sync.
        4. Manual statement import resolves the gap.
        """
        from datetime import datetime, timedelta, timezone
        from backend.scheduler import scheduler

        now = datetime.now(timezone.utc)
        thirty_five_days_ago = (now - timedelta(days=35)).isoformat()

        # Previous sync was 35 days ago
        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO sync_history (sync_type, status, trades_count, completed_at)
                VALUES ('scheduled', 'success', 10, ?);
            """, (thirty_five_days_ago,))

        # Simulate fresh Flex sync running today
        with db_session() as conn:
            cursor = conn.cursor()
            # Gap detection simulates what execute_sync does
            cursor.execute("SELECT MAX(completed_at) as last_completed FROM sync_history WHERE status = 'success';")
            sr = cursor.fetchone()
            prev_dt = datetime.fromisoformat(sr["last_completed"])
            prev_tz = prev_dt if prev_dt.tzinfo else prev_dt.replace(tzinfo=timezone.utc)
            days_diff = (now - prev_tz).days
            if days_diff > 7:
                cursor.execute("""
                    INSERT INTO sync_gaps (gap_days, from_date, to_date)
                    VALUES (?, ?, ?);
                """, (days_diff, prev_tz.isoformat(), now.isoformat()))

            cursor.execute("""
                INSERT INTO sync_history (sync_type, status, trades_count, completed_at)
                VALUES ('scheduled', 'success', 2, CURRENT_TIMESTAMP);
            """)

        scheduler.last_sync_time = now

        # Gap is detected despite having just synced!
        status = scheduler.get_status()
        self.assertTrue(status["has_sync_gap"])
        self.assertEqual(status["gap_days"], 35)
        self.assertIsNotNone(status["gap_from"])
        self.assertIsNotNone(status["gap_to"])

        # Manual CSV/XML statement import resolves the gap
        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE sync_gaps SET resolved_at = CURRENT_TIMESTAMP WHERE resolved_at IS NULL;")
            cursor.execute("INSERT INTO sync_history (sync_type, status, trades_count, completed_at) VALUES ('manual_import', 'success', 50, CURRENT_TIMESTAMP);")

        status = scheduler.get_status()
        self.assertFalse(status["has_sync_gap"])

    def test_dismiss_sync_gap_when_no_trades(self):
        """Verifies dismissing sync gap when user had 0 trades during vacation/outage."""
        from datetime import datetime, timedelta, timezone
        from backend.scheduler import scheduler

        now = datetime.now(timezone.utc)
        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO sync_gaps (gap_days, from_date, to_date)
                VALUES (40, ?, ?);
            """, ((now - timedelta(days=40)).isoformat(), now.isoformat()))

        # Gap is active
        status = scheduler.get_status()
        self.assertTrue(status["has_sync_gap"])
        self.assertEqual(status["gap_days"], 40)

        # User dismisses gap (0 trades)
        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE sync_gaps SET resolved_at = CURRENT_TIMESTAMP WHERE resolved_at IS NULL;")
            cursor.execute("INSERT INTO sync_history (sync_type, status, trades_count, completed_at) VALUES ('gap_dismiss', 'success', 0, CURRENT_TIMESTAMP);")

        scheduler.last_sync_time = now
        status = scheduler.get_status()
        self.assertFalse(status["has_sync_gap"])
        self.assertEqual(status["cooldown_remaining_seconds"], 0)
        self.assertEqual(scheduler.get_cooldown_remaining_seconds(), 0)

    def test_cash_transactions_and_account_equity(self):
        """Verifies cash transactions tracking, starting capital, and account balance / ROI calculation."""
        from backend.database import add_manual_cash_transaction, delete_cash_transaction, get_cash_summary, upsert_cash_transactions
        from scripts.import_trades import parse_csv_cash_transactions

        # 1. Test CSV parsing of Deposits & Withdrawals
        csv_sample = [
            'Statement,Data,Title,Activity Statement',
            'Account Information,Data,Account,U6920617',
            'Account Information,Data,Base Currency,EUR',
            'Deposits & Withdrawals,Header,Currency,Settle Date,Description,Amount',
            'Deposits & Withdrawals,Data,EUR,2023-01-15,"Electronic Funds Transfer",5000.00',
            'Deposits & Withdrawals,Data,EUR,2023-06-20,"Cash Withdrawal",-1000.00',
            'Deposits & Withdrawals,Total,,EUR,,4000.00',
        ]
        parsed_cash = parse_csv_cash_transactions(csv_sample)
        self.assertEqual(len(parsed_cash), 2)
        self.assertEqual(parsed_cash[0]["amount"], 5000.0)
        self.assertEqual(parsed_cash[0]["type"], "DEPOSIT")
        self.assertEqual(parsed_cash[1]["amount"], -1000.0)
        self.assertEqual(parsed_cash[1]["type"], "WITHDRAWAL")

        # Upsert parsed cash
        upsert_cash_transactions(parsed_cash)
        summary = get_cash_summary()
        self.assertEqual(summary["total_deposits"], 5000.0)
        self.assertEqual(summary["total_withdrawals"], 1000.0)
        self.assertEqual(summary["net_cash_flow"], 4000.0)

        # 2. Add manual cash transaction
        manual_record = add_manual_cash_transaction({
            "type": "DEPOSIT",
            "amount": 2000.0,
            "transaction_date": "2023-07-01",
            "description": "Manual Deposit"
        })
        self.assertTrue(manual_record["is_manual"])
        summary_after_manual = get_cash_summary()
        self.assertEqual(summary_after_manual["total_deposits"], 7000.0)
        self.assertEqual(summary_after_manual["net_cash_flow"], 6000.0)

        # 3. Add closed trades to test account balance and ROI
        upsert_trades([{
            "ib_exec_id": "TRADE_CASH_1",
            "symbol": "AAPL",
            "buy_sell": "SELL",
            "quantity": 10,
            "trade_price": 150.0,
            "ib_commission": 2.0,
            "realized_pnl": 500.0,
            "trade_date": "2023-08-01",
            "open_close_indicator": "C"
        }])

        # Set starting capital
        orig_settings_path = settings_mod.SETTINGS_PATH
        tmp_settings = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
        settings_mod.SETTINGS_PATH = Path(tmp_settings.name)
        tmp_settings.close()
        try:
            update_settings({"starting_capital": 10000.0})

            stats = get_overview_stats()
            self.assertEqual(stats["starting_capital"], 10000.0)
            self.assertEqual(stats["total_deposits"], 7000.0)
            self.assertEqual(stats["total_withdrawals"], 1000.0)
            self.assertEqual(stats["net_cash_flow"], 6000.0)
            self.assertEqual(stats["net_pnl"], 498.0) # 500 - 2
            # Account Balance = 10000 + 6000 + 498 = 16498.0
            self.assertEqual(stats["account_balance"], 16498.0)
            # Capital Base = 10000 + 7000 = 17000.0
            # ROI = 498 / 17000 * 100 = 2.93%
            self.assertEqual(stats["roi_pct"], 2.93)

            # 4. Delete manual transaction
            del_success = delete_cash_transaction(manual_record["transaction_id"])
            self.assertTrue(del_success)
            summary_del = get_cash_summary()
            self.assertEqual(summary_del["total_deposits"], 5000.0)
            self.assertEqual(summary_del["net_cash_flow"], 4000.0)
        finally:
            if settings_mod.SETTINGS_PATH.exists():
                try:
                    settings_mod.SETTINGS_PATH.unlink()
                except Exception:
                    pass
            settings_mod.SETTINGS_PATH = orig_settings_path

    def test_api_import_statement(self):
        """Verifies the /api/import/statement endpoint logic parses and records trades and cash txs."""
        try:
            import asyncio
            from backend.main import import_historical_statement

            class MockRequest:
                def __init__(self, body_bytes: bytes):
                    self._body = body_bytes

                async def body(self):
                    return self._body

            csv_content = """Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers
Deposits & Withdrawals,Header,Currency,Settle Date,Description,Amount
Deposits & Withdrawals,Data,EUR,2021-01-15,Wire In,5000.00
Deposits & Withdrawals,Data,EUR,,Total,5000.00
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Proceeds,Comm/Fee,Realized P/L,Code
Trades,Data,Order,Stocks,EUR,SAN,2021-01-20, 10:00:00,100,3.50,-350.00,-1.00,0.00,O
"""
            mock_req = MockRequest(csv_content.encode("utf-8"))
            result = asyncio.run(import_historical_statement(mock_req))
            self.assertEqual(result["status"], "success")
            self.assertEqual(result["trades_count"], 1)
            self.assertEqual(result["cash_count"], 1)
        except ModuleNotFoundError:
            # When testing under minimal system python without FastAPI installed
            from scripts.import_trades import parse_csv_cash_transactions, parse_ibkr_activity_statement_csv
            from backend.database import upsert_cash_transactions, upsert_trades
            csv_lines = [
                "Statement,Header,Field Name,Field Value",
                "Statement,Data,BrokerName,Interactive Brokers",
                "Deposits & Withdrawals,Header,Currency,Settle Date,Description,Amount",
                "Deposits & Withdrawals,Data,EUR,2021-01-15,Wire In,5000.00",
                "Deposits & Withdrawals,Data,EUR,,Total,5000.00",
                "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Proceeds,Comm/Fee,Realized P/L,Code",
                "Trades,Data,Order,Stocks,EUR,SAN,2021-01-20, 10:00:00,100,3.50,-350.00,-1.00,0.00,O"
            ]
            trades = parse_ibkr_activity_statement_csv(csv_lines)
            cash_txs = parse_csv_cash_transactions(csv_lines)
            count = upsert_trades(trades)
            cash_count = upsert_cash_transactions(cash_txs)
            self.assertEqual(count, 1)
            self.assertEqual(cash_count, 1)



class TestTradeGrouping(unittest.TestCase):
    def test_group_executions_to_trades(self):
        from backend.analytics import group_executions_to_trades, format_trade_duration

        # Test duration formatting
        self.assertEqual(format_trade_duration("10:00:00", "10:05:30"), "5m 30s")
        self.assertEqual(format_trade_duration("10:00:00", "11:05:30"), "1h 05m 30s")
        self.assertEqual(format_trade_duration("10:00:00", "10:00:45"), "45s")

        # Test round-trip trade grouping (Buy 2 QQQ, Sell 1 QQQ, Sell 1 QQQ -> 1 grouped trade)
        executions = [
            {
                "id": 1,
                "symbol": "QQQ 01OCT26 743 C",
                "asset_category": "OPT",
                "currency": "EUR",
                "raw_currency": "USD",
                "buy_sell": "BUY",
                "quantity": 2.0,
                "trade_price": 0.54,
                "ib_commission": 1.20,
                "realized_pnl": 0.0,
                "trade_date": "2026-10-01",
                "trade_time": "11:20:38",
                "open_close_indicator": "O"
            },
            {
                "id": 2,
                "symbol": "QQQ 01OCT26 743 C",
                "asset_category": "OPT",
                "currency": "EUR",
                "raw_currency": "USD",
                "buy_sell": "SELL",
                "quantity": -1.0,
                "trade_price": 0.40,
                "ib_commission": 0.76,
                "realized_pnl": -13.80,
                "trade_date": "2026-10-01",
                "trade_time": "11:23:42",
                "open_close_indicator": "C"
            },
            {
                "id": 3,
                "symbol": "QQQ 01OCT26 743 C",
                "asset_category": "OPT",
                "currency": "EUR",
                "raw_currency": "USD",
                "buy_sell": "SELL",
                "quantity": -1.0,
                "trade_price": 0.51,
                "ib_commission": 0.93,
                "realized_pnl": -4.20,
                "trade_date": "2026-10-01",
                "trade_time": "11:27:52",
                "open_close_indicator": "C"
            }
        ]

        grouped = group_executions_to_trades(executions)
        self.assertEqual(len(grouped), 1)
        trade = grouped[0]
        self.assertEqual(trade["symbol"], "QQQ 01OCT26 743 C")
        self.assertEqual(trade["direction"], "BUY CALL")
        self.assertEqual(trade["status"], "CLOSED")
        self.assertEqual(trade["result"], "LOSS")
        self.assertEqual(trade["quantity"], 2.0)
        self.assertEqual(trade["open_time"], "11:20:38")
        self.assertEqual(trade["close_time"], "11:27:52")
        self.assertEqual(trade["duration"], "7m 14s")
        self.assertAlmostEqual(trade["avg_entry_price"], 0.54, places=2)
        self.assertAlmostEqual(trade["avg_exit_price"], 0.455, places=3)
        self.assertAlmostEqual(trade["gross_pnl"], -18.00, places=2)
        self.assertAlmostEqual(trade["commission"], 2.89, places=2)
        self.assertAlmostEqual(trade["net_pnl"], -20.89, places=2)
        self.assertEqual(len(trade["fills"]), 3)

        # Test Forex / Cash conversion (must be BUY/SELL, never SHORT)
        cash_execs = [
            {
                "id": 10,
                "symbol": "EUR.CAD",
                "asset_category": "CASH",
                "currency": "EUR",
                "raw_currency": "CAD",
                "buy_sell": "SELL",
                "quantity": -150.0,
                "trade_price": 1.48,
                "ib_commission": 1.50,
                "realized_pnl": 0.0,
                "trade_date": "2026-10-01",
                "trade_time": "14:00:00",
                "open_close_indicator": "C"
            }
        ]
        cash_grouped = group_executions_to_trades(cash_execs)
        self.assertEqual(len(cash_grouped), 1)
        self.assertEqual(cash_grouped[0]["direction"], "EXCHANGE")
        self.assertNotEqual(cash_grouped[0]["direction"], "SHORT")
        self.assertNotEqual(cash_grouped[0]["direction"], "SELL")

        # Test Put Option Sell
        put_execs = [
            {
                "id": 20,
                "symbol": "SPY 15DEC26 580 P",
                "asset_category": "OPT",
                "currency": "EUR",
                "raw_currency": "USD",
                "buy_sell": "SELL",
                "quantity": -1.0,
                "trade_price": 2.50,
                "ib_commission": 0.80,
                "realized_pnl": 0.0,
                "trade_date": "2026-10-01",
                "trade_time": "15:30:00",
                "open_close_indicator": "O"
            },
            {
                "id": 21,
                "symbol": "SPY 15DEC26 580 P",
                "asset_category": "OPT",
                "currency": "EUR",
                "raw_currency": "USD",
                "buy_sell": "BUY",
                "quantity": 1.0,
                "trade_price": 1.00,
                "ib_commission": 0.80,
                "realized_pnl": 150.0,
                "trade_date": "2026-10-01",
                "trade_time": "16:00:00",
                "open_close_indicator": "C"
            }
        ]
        put_grouped = group_executions_to_trades(put_execs)
        self.assertEqual(len(put_grouped), 1)
        self.assertEqual(put_grouped[0]["direction"], "SELL PUT")
        self.assertEqual(put_grouped[0]["result"], "WIN")


class TestNormalizationAndDeduplication(unittest.TestCase):
    def setUp(self):
        self.tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.test_db_path = Path(self.tmp_db.name)
        self.tmp_db.close()

        self.orig_db_path = config.DB_PATH
        config.DB_PATH = self.test_db_path
        database.DB_PATH = self.test_db_path
        init_db()

    def tearDown(self):
        config.DB_PATH = self.orig_db_path
        database.DB_PATH = self.orig_db_path
        if self.test_db_path.exists():
            try:
                self.test_db_path.unlink()
            except Exception:
                pass

    def test_normalize_symbol(self):
        from backend.database import normalize_symbol

        # OCC options format
        self.assertEqual(normalize_symbol("QQQ   261001C00743000", "QQQ 01OCT26 743 C", "OPT"), "QQQ 01OCT26 743 C")
        self.assertEqual(normalize_symbol("SPY   230120C00400000", "", "OPT"), "SPY 20JAN23 400 C")
        self.assertEqual(normalize_symbol("AAPL240119P00150500", "", "OPT"), "AAPL 19JAN24 150.5 P")
        self.assertEqual(normalize_symbol("QQQ 01OCT26 743 C", "", "OPT"), "QQQ 01OCT26 743 C")

        # Equities and Forex
        self.assertEqual(normalize_symbol("NVDA", "", "STK"), "NVDA")
        self.assertEqual(normalize_symbol("EUR.USD", "", "CASH"), "EUR.USD")

    def test_cross_source_deduplication(self):
        """Tests that official Flex executions supersede CSV GEN_* placeholders and prevent duplicate counts."""
        from backend.database import db_session, upsert_trades
        from backend.analytics import get_day_trades, group_executions_to_trades

        # 1. Insert CSV trade with GEN_ ID
        csv_trade = [
            {
                "ib_exec_id": "GEN_abc123",
                "trade_id": "GEN_abc123",
                "symbol": "QQQ 01OCT26 743 C",
                "description": "",
                "asset_category": "OPT",
                "buy_sell": "SELL",
                "quantity": -1.0,
                "trade_price": 0.51,
                "ib_commission": 0.93,
                "realized_pnl": -4.20,
                "trade_date": "2026-10-01",
                "trade_time": "11:27:52",
                "open_close_indicator": "C"
            }
        ]
        upsert_trades(csv_trade)

        day_trades = get_day_trades("2026-10-01")
        self.assertEqual(len(day_trades), 1)

        # 2. Later, Flex query syncs official execution for the same trade with OCC symbol and real ID
        flex_trade = [
            {
                "ib_exec_id": "6778374621",
                "trade_id": "1600757591",
                "symbol": "QQQ   261001C00743000",
                "description": "QQQ 01OCT26 743 C",
                "asset_category": "OPT",
                "buy_sell": "SELL",
                "quantity": -1.0,
                "trade_price": 0.51,
                "ib_commission": 0.928,
                "realized_pnl": -4.2014,
                "trade_date": "2026-10-01",
                "trade_time": "11:27:52",
                "open_close_indicator": "C"
            }
        ]
        upsert_trades(flex_trade)

        # Verified: No duplicate created, official execution replaces placeholder
        day_trades_after = get_day_trades("2026-10-01")
        self.assertEqual(len(day_trades_after), 1)
        self.assertEqual(day_trades_after[0]["ib_exec_id"], "6778374621")
        self.assertEqual(day_trades_after[0]["symbol"], "QQQ 01OCT26 743 C")

        # 3. If CSV import is re-run with GEN_ ID, it should NOT re-insert duplicate
        upsert_trades(csv_trade)
        day_trades_rerun = get_day_trades("2026-10-01")
        self.assertEqual(len(day_trades_rerun), 1)
        self.assertEqual(day_trades_rerun[0]["ib_exec_id"], "6778374621")


if __name__ == "__main__":
    unittest.main()



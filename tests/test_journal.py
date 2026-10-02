import tempfile
import unittest
from pathlib import Path

import backend.config as config
import backend.database as database
import backend.settings as settings_mod
from backend.analytics import get_detailed_stats, get_overview_stats
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

    def tearDown(self):
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
            updated = update_settings({"theme": "dark", "stats_date_range": "3M"})
            self.assertEqual(updated["theme"], "dark")
            self.assertEqual(updated["stats_date_range"], "3M")

            loaded = get_all_settings()
            self.assertEqual(loaded["theme"], "dark")
            self.assertEqual(loaded["stats_date_range"], "3M")
        finally:
            settings_mod.SETTINGS_PATH = orig_path
            if settings_file.exists():
                settings_file.unlink()

    def test_environment_auto_sync_toggle(self):
        """Tests that dev/debug mode disables automatic sync, while prod enables it."""
        from backend.config import is_production
        import backend.config as cfg
        
        orig_env = cfg.ENVIRONMENT
        orig_debug = cfg.DEBUG
        try:
            cfg.ENVIRONMENT = "dev"
            cfg.DEBUG = False
            self.assertFalse(is_production())

            cfg.ENVIRONMENT = "debug"
            self.assertFalse(is_production())

            cfg.ENVIRONMENT = "prod"
            cfg.DEBUG = False
            self.assertTrue(is_production())

            cfg.ENVIRONMENT = "prod"
            cfg.DEBUG = True
            self.assertFalse(is_production())
        finally:
            cfg.ENVIRONMENT = orig_env
            cfg.DEBUG = orig_debug


if __name__ == "__main__":
    unittest.main()

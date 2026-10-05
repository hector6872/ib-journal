#!/usr/bin/env python3
"""
IBKR Historical Trades Importer Script
Imports multiple CSV, XML, Flex Queries, or Activity Statements into the IBKR Journal SQLite database.
Idempotent and safe to run multiple times without creating duplicates.
"""

import argparse
import csv
import glob
import hashlib
import logging
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
from datetime import date
from typing import Any, Dict, List, Tuple



# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.config import DB_PATH  # noqa: E402
from backend.database import db_session, init_db, upsert_trades  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("ib-journal.importer")


def clean_num(val: Any, default: float = 0.0) -> float:
    """Safely converts string numbers (with commas, currency symbols, or negative signs) to float."""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace("€", "").replace("$", "").replace("£", "").replace(",", "")
    if not s or s == "--" or s == "-":
        return default
    try:
        return float(s)
    except ValueError:
        return default


def generate_deterministic_exec_id(symbol: str, dt_str: str, side: str, qty: float, price: float, trade_id: str = "") -> str:
    """Generates a unique deterministic ID when ibExecId is missing in raw CSVs to prevent duplicates."""
    if trade_id:
        return f"IB_{trade_id}"
    raw = f"{symbol.upper()}_{dt_str}_{side.upper()}_{abs(qty):.4f}_{price:.6f}"
    h = hashlib.md5(raw.encode("utf-8")).hexdigest()[:16]
    return f"GEN_{h}"


def parse_datetime_str(raw: str) -> Tuple[str, str, str]:
    """
    Parses various date/time formats from IBKR statements:
    - 2023-05-12, 14:32:00
    - 20230512;143200
    - 2023-05-12 14:32:00
    - 12/05/2023 14:32:00
    - 2023-05-12
    Returns: (trade_date: YYYY-MM-DD, trade_time: HH:MM:SS, trade_datetime_iso: ISO string)
    """
    if not raw:
        today_iso = date.today().isoformat()
        return today_iso, "", today_iso

    cleaned = raw.replace(";", " ").replace(",", " ").replace("T", " ").strip()
    parts = cleaned.split()

    trade_date = ""
    trade_time = ""

    if len(parts) >= 1:
        d_part = parts[0].strip()
        # Case 1: YYYYMMDD
        if len(d_part) == 8 and d_part.isdigit():
            trade_date = f"{d_part[:4]}-{d_part[4:6]}-{d_part[6:]}"
        # Case 2: YYYY-MM-DD
        elif len(d_part) == 10 and d_part.count("-") == 2:
            trade_date = d_part
        # Case 3: DD/MM/YYYY or MM/DD/YYYY
        elif d_part.count("/") == 2:
            dp = d_part.split("/")
            if len(dp[2]) == 4: # e.g. 12/05/2023 or 05/12/2023
                # Assume YYYY at end
                y = dp[2]
                m = dp[0].zfill(2)
                d = dp[1].zfill(2)
                # If m > 12, it's DD/MM/YYYY
                if int(dp[0]) > 12:
                    d, m = dp[0].zfill(2), dp[1].zfill(2)
                trade_date = f"{y}-{m}-{d}"
            elif len(dp[0]) == 4: # e.g. 2023/05/12
                trade_date = f"{dp[0]}-{dp[1].zfill(2)}-{dp[2].zfill(2)}"
        else:
            trade_date = d_part

    if len(parts) >= 2:
        t_part = parts[1].strip()
        # Case 1: HHMMSS
        if len(t_part) == 6 and t_part.isdigit():
            trade_time = f"{t_part[:2]}:{t_part[2:4]}:{t_part[4:]}"
        # Case 2: HH:MM:SS
        elif t_part.count(":") >= 1:
            tp = t_part.split(":")
            h = tp[0].zfill(2)
            m = tp[1].zfill(2)
            s = tp[2].zfill(2) if len(tp) > 2 else "00"
            trade_time = f"{h}:{m}:{s}"

    if not trade_date:
        trade_date = date.today().isoformat()

    iso_str = f"{trade_date}T{trade_time}" if trade_time else trade_date
    return trade_date, trade_time, iso_str


def parse_xml_file(filepath: Path) -> List[Dict[str, Any]]:
    """Parses an IBKR Flex Query XML export."""
    trades: List[Dict[str, Any]] = []
    tree = ET.parse(filepath)
    root = tree.getroot()

    for node in root.iter("Trade"):
        attrs = node.attrib
        exec_id = attrs.get("ibExecId") or attrs.get("transactionID") or attrs.get("tradeID")
        symbol = (attrs.get("symbol") or "").upper().strip()
        if not symbol:
            continue

        date_raw = attrs.get("dateTime") or attrs.get("tradeDate") or ""
        t_date, t_time, t_dt_iso = parse_datetime_str(date_raw)

        qty = clean_num(attrs.get("quantity"))
        price = clean_num(attrs.get("tradePrice"))
        side = (attrs.get("buySell") or ("BUY" if qty > 0 else "SELL")).upper()

        if not exec_id:
            exec_id = generate_deterministic_exec_id(symbol, t_dt_iso, side, qty, price, attrs.get("tradeID", ""))

        realized_pnl = clean_num(attrs.get("fifoPnlRealized") or attrs.get("realizedPNL") or attrs.get("fxPnl"))
        comm = abs(clean_num(attrs.get("ibCommission") or attrs.get("taxes")))
        trade_money = clean_num(attrs.get("tradeMoney")) or (abs(qty) * price)
        proceeds = clean_num(attrs.get("proceeds"))

        trades.append({
            "ib_exec_id": exec_id,
            "trade_id": attrs.get("tradeID") or exec_id,
            "account_id": attrs.get("accountId") or "",
            "symbol": symbol,
            "description": attrs.get("description") or "",
            "asset_category": (attrs.get("assetCategory") or "STK").upper(),
            "currency": attrs.get("currency") or "EUR",
            "buy_sell": side,
            "quantity": qty,
            "trade_price": price,
            "trade_money": trade_money,
            "proceeds": proceeds,
            "ib_commission": comm,
            "realized_pnl": realized_pnl,
            "trade_date": t_date,
            "trade_time": t_time,
            "trade_date_time": t_dt_iso,
            "open_close_indicator": (attrs.get("openCloseIndicator") or "C").upper(),
            "order_type": (attrs.get("orderType") or "MKT").upper(),
            "exchange": (attrs.get("exchange") or "SMART").upper()
        })

    return trades


def parse_csv_file(filepath: Path) -> List[Dict[str, Any]]:
    """
    Parses IBKR CSV exports supporting:
    1. Flex Query CSV (standard flat tabular)
    2. Activity Statement CSV (sectioned with 'Trades,Data,...')
    3. Trade Confirmation Reports CSV
    """
    trades: List[Dict[str, Any]] = []

    with open(filepath, "r", encoding="utf-8-sig", errors="replace") as f:
        content = f.read()

    lines = content.splitlines()
    if not lines:
        return []

    # Check if this is an IBKR multi-section Activity Statement
    is_activity_statement = any(line_item.startswith("Trades,") or line_item.startswith("Statement,") or line_item.startswith("Account Information,") for line_item in lines)

    if is_activity_statement:
        trades = parse_ibkr_activity_statement_csv(lines)
    else:
        trades = parse_generic_ibkr_csv(lines)

    return trades


def parse_ibkr_activity_statement_csv(lines: List[str]) -> List[Dict[str, Any]]:
    """Parses standard IBKR Activity Statement CSV with multi-currency conversion to Base Currency."""
    trades: List[Dict[str, Any]] = []
    headers: List[str] = []
    account_id = ""
    base_currency = "EUR"

    # Default fallback conversion rates to EUR
    fx_rates_to_base: Dict[str, float] = {
        "EUR": 1.0,
        "USD": 0.906,
        "CAD": 0.684,
        "GBP": 1.154,
        "AUD": 0.617,
        "CHF": 1.05,
        "JPY": 0.0061,
        "NOK": 0.089,
        "SEK": 0.088,
        "HKD": 0.116,
    }

    # Pass 1: Extract account Base Currency and FX conversion rates from statement headers/summaries
    for line in lines:
        row = list(csv.reader([line]))[0] if line else []
        if not row or len(row) < 3:
            continue
        section = row[0].strip()
        record_type = row[1].strip()

        if section == "Account Information" and record_type == "Data":
            if len(row) >= 4:
                field_name = row[2].strip()
                field_val = row[3].strip()
                if field_name == "Account":
                    account_id = field_val
                elif field_name == "Base Currency":
                    base_currency = field_val.upper()
                    fx_rates_to_base[base_currency] = 1.0

        elif section == "Forex Balances" and record_type == "Data":
            if len(row) >= 9:
                curr = row[4].strip().upper()
                close_price = clean_num(row[8])
                if curr and close_price > 0:
                    fx_rates_to_base[curr] = close_price

        elif section == "Mark-to-Market Performance Summary" and record_type == "Data":
            if len(row) >= 8 and row[2].strip() == "Forex":
                curr = row[3].strip().upper()
                curr_price = clean_num(row[7])
                if curr and curr_price > 0:
                    fx_rates_to_base[curr] = curr_price

    # Pass 2: Process trade executions and convert P&L / commissions to base currency
    for line in lines:
        row = list(csv.reader([line]))[0] if line else []
        if not row or len(row) < 3:
            continue

        section = row[0].strip()
        record_type = row[1].strip()

        if section == "Trades" and record_type == "Header":
            headers = [h.strip().lower() for h in row[2:]]
        elif section == "Trades" and record_type == "Data" and headers:
            data = [d.strip() for d in row[2:]]
            if len(data) < len(headers):
                data += [""] * (len(headers) - len(data))

            row_dict = dict(zip(headers, data))

            # Skip subheaders or total summary lines
            discriminator = row_dict.get("datadiscriminator", "").lower()
            if "total" in discriminator or "subtotal" in discriminator:
                continue

            symbol = row_dict.get("symbol", "").upper().strip()
            if not symbol:
                continue

            dt_raw = row_dict.get("date/time") or row_dict.get("date") or row_dict.get("trade date") or ""
            t_date, t_time, t_dt_iso = parse_datetime_str(dt_raw)

            qty = clean_num(row_dict.get("quantity") or row_dict.get("qty"))
            price = clean_num(row_dict.get("t. price") or row_dict.get("trade price") or row_dict.get("price"))
            proceeds = clean_num(row_dict.get("proceeds"))

            raw_currency = row_dict.get("currency", base_currency).upper()
            fx_rate = 1.0 if raw_currency == base_currency else fx_rates_to_base.get(raw_currency, 1.0)

            raw_comm = abs(clean_num(
                row_dict.get("comm/fee") or
                row_dict.get("commission") or
                row_dict.get("ib commission") or
                row_dict.get("comm in eur") or
                row_dict.get("comm in usd") or
                row_dict.get("comm")
            ))
            raw_pnl = clean_num(row_dict.get("realized p/l") or row_dict.get("realized pnl") or row_dict.get("realized profit"))

            # Convert commission & realized PnL to base currency
            if "comm in eur" in headers and base_currency == "EUR" and row_dict.get("comm in eur"):
                comm_in_base = raw_comm
            else:
                comm_in_base = round(raw_comm * fx_rate, 4)

            pnl_in_base = round(raw_pnl * fx_rate, 4)

            # Asset category: Stocks, Equity and Index Options, Futures, etc.
            raw_cat = row_dict.get("asset category", "").upper()
            asset_category = "STK"
            if "OPTION" in raw_cat:
                asset_category = "OPT"
            elif "FUTURE" in raw_cat:
                asset_category = "FUT"
            elif "FOREX" in raw_cat or "CASH" in raw_cat:
                asset_category = "CASH"
            elif "CRYPTO" in raw_cat:
                asset_category = "CRYPTO"
            elif "BOND" in raw_cat:
                asset_category = "BOND"

            code = (row_dict.get("code") or "C").upper()
            open_close = "O" if "O" in code else ("C" if "C" in code else "C")
            side = "BUY" if qty > 0 else "SELL"

            trade_id = row_dict.get("tradeid") or row_dict.get("transaction id") or ""
            exec_id = row_dict.get("ibexecutionid") or row_dict.get("ibexecid") or generate_deterministic_exec_id(symbol, t_dt_iso, side, qty, price, trade_id)

            trades.append({
                "ib_exec_id": exec_id,
                "trade_id": trade_id or exec_id,
                "account_id": row_dict.get("accountid", "") or account_id,
                "symbol": symbol,
                "description": row_dict.get("description", ""),
                "asset_category": asset_category,
                "currency": raw_currency,
                "raw_currency": raw_currency,
                "base_currency": base_currency,
                "buy_sell": side,
                "quantity": qty,
                "trade_price": price,
                "trade_money": abs(qty) * price if price else 0.0,
                "proceeds": proceeds,
                "fx_rate_to_base": fx_rate,
                "raw_commission": raw_comm,
                "raw_realized_pnl": raw_pnl,
                "ib_commission": comm_in_base,
                "realized_pnl": pnl_in_base,
                "trade_date": t_date,
                "trade_time": t_time,
                "trade_date_time": t_dt_iso,
                "open_close_indicator": open_close,
                "order_type": (row_dict.get("order type") or "MKT").upper(),
                "exchange": (row_dict.get("exchange") or "SMART").upper()
            })

    return trades


def parse_generic_ibkr_csv(lines: List[str]) -> List[Dict[str, Any]]:
    """Parses standard tabular Flex CSV or Trade Confirmation CSV exports."""
    trades: List[Dict[str, Any]] = []
    reader = csv.DictReader(lines)

    # Normalize headers
    for raw_row in reader:
        row = {k.strip().lower().replace(" ", "").replace("_", "").replace("/", ""): v for k, v in raw_row.items() if k}

        symbol = (row.get("symbol") or row.get("underlying") or "").upper().strip()
        if not symbol:
            continue

        dt_raw = row.get("datetime") or row.get("tradedatetime") or row.get("date") or row.get("tradedate") or ""
        t_date, t_time, t_dt_iso = parse_datetime_str(dt_raw)

        qty = clean_num(row.get("quantity") or row.get("qty") or row.get("shares"))
        price = clean_num(row.get("tradeprice") or row.get("price") or row.get("tprice"))
        proceeds = clean_num(row.get("proceeds"))
        comm = abs(clean_num(row.get("ibcommission") or row.get("commission") or row.get("commfee") or row.get("comm")))
        realized_pnl = clean_num(row.get("fifopnlrealized") or row.get("realizedpnl") or row.get("realizedpl") or row.get("pnl"))

        raw_side = (row.get("buysell") or row.get("side") or row.get("action") or "").upper()
        side = "BUY" if "BUY" in raw_side or "BOT" in raw_side or qty > 0 else "SELL"

        raw_cat = (row.get("assetcategory") or row.get("assetclass") or row.get("type") or "STK").upper()
        asset_category = "STK"
        if "OPT" in raw_cat:
            asset_category = "OPT"
        elif "FUT" in raw_cat:
            asset_category = "FUT"
        elif "CASH" in raw_cat or "FOREX" in raw_cat:
            asset_category = "CASH"
        elif "CRYPTO" in raw_cat:
            asset_category = "CRYPTO"

        trade_id = row.get("tradeid") or row.get("transactionid") or ""
        exec_id = row.get("ibexecutionid") or row.get("ibexecid") or row.get("execid") or generate_deterministic_exec_id(symbol, t_dt_iso, side, qty, price, trade_id)

        trades.append({
            "ib_exec_id": exec_id,
            "trade_id": trade_id or exec_id,
            "account_id": row.get("accountid") or row.get("clientaccountid") or "",
            "symbol": symbol,
            "description": row.get("description") or "",
            "asset_category": asset_category,
            "currency": (row.get("currency") or "EUR").upper(),
            "buy_sell": side,
            "quantity": qty,
            "trade_price": price,
            "trade_money": abs(qty) * price,
            "proceeds": proceeds,
            "ib_commission": comm,
            "realized_pnl": realized_pnl,
            "trade_date": t_date,
            "trade_time": t_time,
            "trade_date_time": t_dt_iso,
            "open_close_indicator": (row.get("opencloseindicator") or row.get("code") or "C").upper()[:1],
            "order_type": (row.get("ordertype") or "MKT").upper(),
            "exchange": (row.get("exchange") or "SMART").upper()
        })

    return trades


def process_file_or_dir(target_path: Path, dry_run: bool = False, verbose: bool = False) -> Tuple[int, int]:
    """Processes a single file or recursively traverses a directory."""
    files_to_process: List[Path] = []

    if target_path.is_file():
        files_to_process.append(target_path)
    elif target_path.is_dir():
        for ext in ("*.csv", "*.xml", "*.CSV", "*.XML"):
            files_to_process.extend(target_path.glob(ext))
    else:
        # Check glob pattern string
        matched = glob.glob(str(target_path))
        files_to_process.extend([Path(m) for m in matched if Path(m).is_file()])

    if not files_to_process:
        logger.warning(f"No CSV or XML files found for path: {target_path}")
        return 0, 0

    total_parsed = 0
    all_trades: List[Dict[str, Any]] = []

    for f in sorted(files_to_process):
        logger.info(f"Reading file: {f.name} ({f.stat().st_size / 1024:.1f} KB)")
        try:
            if f.suffix.lower() == ".xml":
                parsed = parse_xml_file(f)
            else:
                parsed = parse_csv_file(f)

            logger.info(f"  -> Extracted {len(parsed)} trade executions.")
            if verbose:
                for t in parsed[:5]:
                    logger.debug(f"     {t['trade_date']} {t['trade_time']} | {t['symbol']} | {t['buy_sell']} {t['quantity']} @ {t['trade_price']} | PnL: {t['realized_pnl']}")
                if len(parsed) > 5:
                    logger.debug(f"     ... and {len(parsed) - 5} more.")

            all_trades.extend(parsed)
            total_parsed += len(parsed)
        except Exception as e:
            logger.error(f"Error parsing {f}: {e}")

    if dry_run:
        logger.info(f"[DRY-RUN] Would upsert {len(all_trades)} trades into {DB_PATH.name} (no changes written).")
        return total_parsed, 0

    init_db()
    upserted_count = upsert_trades(all_trades)
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE sync_gaps
            SET resolved_at = CURRENT_TIMESTAMP
            WHERE resolved_at IS NULL;
        """)
        cursor.execute("""
            INSERT INTO sync_history (sync_type, status, trades_count, completed_at)
            VALUES ('cli_import', 'success', ?, CURRENT_TIMESTAMP);
        """, (upserted_count,))
    logger.info(f"✓ Successfully upserted {upserted_count} trades into SQLite ({DB_PATH.name}).")
    return total_parsed, upserted_count


def main():
    parser = argparse.ArgumentParser(
        description="IBKR Historical Multi-Year Trades Importer (CSV / XML / Activity Statements)"
    )
    parser.add_argument(
        "paths",
        nargs="+",
        help="One or more paths to CSV/XML files or directories containing statements (e.g. ./data/history/ or 2022.csv 2023.xml)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulates parsing and shows count without writing to database"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Displays detailed trade outputs"
    )

    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

    logger.info("=== IBKR Journal Historical Trades Importer ===")
    total_found = 0
    total_saved = 0

    for path_str in args.paths:
        p = Path(path_str).expanduser().resolve()
        found, saved = process_file_or_dir(p, dry_run=args.dry_run, verbose=args.verbose)
        total_found += found
        total_saved += saved

    logger.info("------------------------------------------------")
    logger.info(f"Summary: Total Trades Extracted: {total_found} | Total Upserted: {total_saved}")
    logger.info("=== Done ===")


if __name__ == "__main__":
    main()

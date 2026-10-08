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
import re
from datetime import date
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple


# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.config import DB_PATH  # noqa: E402
from backend.database import (  # noqa: E402
    db_session,
    init_db,
    normalize_symbol,
    upsert_cash_transactions,
    upsert_open_positions,
    upsert_trades,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("ib-journal.importer")


def clean_num(val: Any, default: float = 0.0) -> float:
    """
    Safely converts string numbers (with commas, currency symbols, accounting negatives,
    or European decimal separators) to float.
    """
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if not s or s in ("--", "-", "N/A", "n/a", "null", "None"):
        return default

    # Remove currency symbols and surrounding whitespace (including Russian, Asian, Latin currencies and non-breaking spaces)
    for sym in [
        "€",
        "$",
        "£",
        "¥",
        "₽",
        "руб",
        "CHF",
        "cad",
        "CAD",
        "usd",
        "USD",
        "eur",
        "EUR",
        "aud",
        "AUD",
        "gbp",
        "GBP",
        "jpy",
        "JPY",
        "cny",
        "CNY",
        "hkd",
        "HKD",
        "kr",
        "zł",
        "元",
        "₹",
        "₩",
        "\u00a0",
        "\u202f",
        " ",
        "\t",
    ]:
        s = s.replace(sym, "")

    # Handle Swiss / Liechtenstein apostrophe thousands separators e.g. 1'234.56 or 1’234’567.89
    s = s.replace("'", "").replace("’", "")

    # Handle accounting format negatives e.g. (1,234.56) or (180.50)
    is_neg = False
    if s.startswith("(") and s.endswith(")"):
        is_neg = True
        s = s[1:-1].strip()
    elif s.startswith("-"):
        is_neg = True
        s = s[1:].strip()

    # Handle European vs US decimal & thousands separators
    if "." in s and "," in s:
        if s.rfind(".") > s.rfind(","):
            # US format: 1,234,567.89 -> remove comma
            s = s.replace(",", "")
        else:
            # European format: 1.234.567,89 -> remove dot, replace comma with dot
            s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        parts = s.split(",")
        if len(parts) == 2:
            # If exactly 3 digits after comma and integer-like (e.g. '1,000', '6,250', '10,005'), it's a thousands separator
            if len(parts[1]) == 3 and parts[0].isdigit() and parts[1].isdigit():
                s = s.replace(",", "")
            elif len(parts[1]) != 3 and len(parts[1]) <= 6:
                s = s.replace(",", ".")
            else:
                s = s.replace(",", "")
        else:
            s = s.replace(",", "")
    elif s.count(".") > 1:
        # e.g. 1.000.000 (thousands separator with no decimals)
        s = s.replace(".", "")

    try:
        res = float(s)
        return -res if is_neg else res
    except ValueError:
        return default


def generate_deterministic_exec_id(
    symbol: str, dt_str: str, side: str, qty: float, price: float, trade_id: str = ""
) -> str:
    """Generates a unique deterministic ID when ibExecId is missing in raw CSVs to prevent duplicates."""
    if trade_id:
        return f"IB_{trade_id}"
    raw = f"{symbol.upper()}_{dt_str}_{side.upper()}_{abs(qty):.4f}_{price:.6f}"
    h = hashlib.md5(raw.encode("utf-8")).hexdigest()[:16]
    return f"GEN_{h}"


def generate_deterministic_cash_id(
    account_id: str, dt_str: str, tx_type: str, amount: float, desc: str = "", currency: str = ""
) -> str:
    """Generates a unique deterministic ID for cash transactions without a transaction ID."""
    clean_desc = "".join(c for c in desc.upper() if c.isalnum() or c in (" ", "-", "."))[:30]
    raw = f"{account_id}_{dt_str}_{tx_type}_{amount:.4f}_{currency.upper()}_{clean_desc}"
    h = hashlib.md5(raw.encode("utf-8")).hexdigest()[:16]
    return f"CASH_{h}"


def parse_datetime_str(raw: str, require_time: bool = False) -> Tuple[str, str, str]:
    """
    Parses various date/time formats from IBKR statements:
    - 2023-05-12, 14:32:00 / 2023-05-12 14:32:00
    - 20230512;143200 / 20230512
    - 12/05/2023 14:32:00 / 12/05/2023
    - 12-05-2023 14:32:00 / 12.05.2023
    - 2023-05-12T14:32:00
    Returns: (trade_date: YYYY-MM-DD, trade_time: HH:MM:SS, trade_datetime_iso: ISO string)
    """
    if not raw or not raw.strip():
        return "", "", ""

    try:
        cleaned = raw.replace(";", " ").replace(",", " ").replace("T", " ").strip()
        parts = cleaned.split()

        trade_date = ""
        trade_time = ""

        if len(parts) >= 1:
            d_part = parts[0].strip()
            # Case 1: YYYYMMDD
            if len(d_part) == 8 and d_part.isdigit():
                trade_date = f"{d_part[:4]}-{d_part[4:6]}-{d_part[6:]}"
            # Case 2: YYYY-MM-DD or DD-MM-YYYY
            elif d_part.count("-") == 2:
                dp = d_part.split("-")
                if len(dp) == 3:
                    if len(dp[0]) == 4:
                        trade_date = f"{dp[0]}-{dp[1].zfill(2)}-{dp[2].zfill(2)}"
                    elif len(dp[2]) == 4:
                        trade_date = f"{dp[2]}-{dp[1].zfill(2)}-{dp[0].zfill(2)}"
            # Case 3: DD/MM/YYYY or MM/DD/YYYY or YYYY/MM/DD
            elif d_part.count("/") == 2:
                dp = d_part.split("/")
                if len(dp) == 3:
                    if len(dp[0]) == 4:
                        trade_date = f"{dp[0]}-{dp[1].zfill(2)}-{dp[2].zfill(2)}"
                    elif len(dp[2]) == 4 or len(dp[2]) == 2:
                        y = dp[2] if len(dp[2]) == 4 else f"20{dp[2]}"
                        p0 = int(dp[0])
                        p1 = int(dp[1])
                        if p0 > 12:
                            trade_date = f"{y}-{str(p1).zfill(2)}-{str(p0).zfill(2)}"
                        elif p1 > 12:
                            trade_date = f"{y}-{str(p0).zfill(2)}-{str(p1).zfill(2)}"
                        else:
                            # Default European standard DD/MM/YYYY
                            trade_date = f"{y}-{str(p1).zfill(2)}-{str(p0).zfill(2)}"
            # Case 4: DD.MM.YYYY
            elif d_part.count(".") == 2:
                dp = d_part.split(".")
                if len(dp) == 3:
                    if len(dp[2]) == 4:
                        trade_date = f"{dp[2]}-{dp[1].zfill(2)}-{dp[0].zfill(2)}"
                    elif len(dp[0]) == 4:
                        trade_date = f"{dp[0]}-{dp[1].zfill(2)}-{dp[2].zfill(2)}"
            else:
                trade_date = d_part

        if len(parts) >= 2:
            t_part = parts[1].strip()
            # Case 1: HHMMSS
            if len(t_part) == 6 and t_part.isdigit():
                trade_time = f"{t_part[:2]}:{t_part[2:4]}:{t_part[4:]}"
            # Case 2: HH:MM:SS or HH:MM
            elif ":" in t_part:
                tp = t_part.split(":")
                h = tp[0].zfill(2)
                m = tp[1].zfill(2) if len(tp) > 1 else "00"
                s = tp[2].zfill(2) if len(tp) > 2 else "00"
                trade_time = f"{h}:{m}:{s}"

        if not trade_date:
            return "", "", ""

        if require_time and not trade_time:
            return "", "", ""

        iso_str = f"{trade_date}T{trade_time}" if trade_time else trade_date
        return trade_date, trade_time, iso_str
    except Exception:
        return "", "", ""


def detect_csv_delimiter(lines: List[str]) -> str:
    """Detects whether CSV is delimited by comma, semicolon, or tab."""
    sample = lines[:20] if len(lines) >= 20 else lines
    semicolon_count = sum(line.count(";") for line in sample)
    comma_count = sum(line.count(",") for line in sample)
    tab_count = sum(line.count("\t") for line in sample)

    if semicolon_count > comma_count and semicolon_count > tab_count:
        return ";"
    if tab_count > comma_count and tab_count > semicolon_count:
        return "\t"
    return ","


def parse_csv_line_tokens(line: str, delimiter: str = ",") -> List[str]:
    """Parses a single CSV line into trimmed string tokens using Python csv reader."""
    if not line:
        return []
    try:
        rows = list(csv.reader([line], delimiter=delimiter))
        return [c.strip() for c in rows[0]] if rows else []
    except Exception:
        return [c.strip().strip('"').strip("'") for c in line.split(delimiter)]


# Universal Multilingual Section and Record Type Matchers
TRADES_SECTIONS = {
    # English
    "trades",
    "trade",
    "executions",
    "orders",
    "trade confirmations",
    "transaction history",
    # Spanish
    "operaciones",
    "transacciones",
    "ejecuciones",
    "confirmaciones de operaciones",
    # German
    "transaktionen",
    "trades",
    "ausführungen",
    "geschäfte",
    "handelsbestätigungen",
    "order",
    # French
    "opérations",
    "transactions",
    "exécutions",
    "ordres",
    "confirmations de transaction",
    # Italian
    "operazioni",
    "transazioni",
    "esecuzioni",
    "ordini",
    "conferme di negoziazione",
    # Portuguese
    "operações",
    "transações",
    "execuções",
    "ordens",
    "confirmações de transação",
    # Dutch
    "transacties",
    "uitvoeringen",
    "orders",
    "transactiebevestigingen",
    # Chinese (Simplified & Traditional)
    "交易",
    "成交",
    "订单",
    "定单",
    "交易确认",
    "交易確認",
    # Japanese
    "取引",
    "約定",
    "注文",
    "取引確認",
    # Russian
    "сделки",
    "операции",
    "исполнения",
    "заказы",
    "подтверждения сделок",
}

ACCOUNT_SECTIONS = {
    "account information",
    "información de la cuenta",
    "información de cuenta",
    "informacion de la cuenta",
    "informacion de cuenta",
    "información sobre la cuenta",
    "informations sur le compte",
    "kontoinformationen",
    "compte",
    "cuenta",
    "informazioni sul conto",
    "informações da conta",
    "rekeninginformatie",
    "账户信息",
    "賬戶信息",
    "口座情報",
    "информация об аккаунте",
}

CASH_SECTIONS = {
    # Deposits & Withdrawals
    "deposits & withdrawals",
    "deposits and withdrawals",
    "depósitos y retiradas",
    "depositos y retiradas",
    "depósitos y reintegros",
    "depositos y reintegros",
    "depósitos y extracciones",
    "depositos y extracciones",
    "transfers",
    "transferencias",
    "dépôts et retraits",
    "virements",
    "ein- und auszahlungen",
    "überweisungen",
    "cash transactions",
    "depositi e prelievi",
    "depósitos e levantamentos",
    "stortingen en opnames",
    "出入金",
    "存款和取款",
    "入出金",
    "депозиты и снятия средств",
    # Dividends
    "dividends",
    "dividendos",
    "dividendes",
    "dividenden",
    "dividendi",
    "dividendos (efectivo)",
    "dividends (cash)",
    "股息",
    "配当金",
    "дивиденды",
    # Withholding Tax
    "withholding tax",
    "retención fiscal",
    "retenciones fiscales",
    "retención",
    "retenciones",
    "impôt retenu",
    "quellensteuer",
    "ritenuta alla fonte",
    "imposto retido na fonte",
    "bronbelasting",
    "预扣税",
    "源泉徴収税",
    "налог у источника",
    # Fees & Subscriptions
    "fees",
    "tarifas",
    "comisiones y tarifas",
    "frais",
    "gebühren",
    "commissioni e spese",
    "taxas",
    "kosten",
    "费用",
    "手数料・費用",
    "сборы",
    # Interest
    "interest",
    "intereses",
    "intérêts",
    "zinsen",
    "interessi",
    "juros",
    "rente",
    "利息",
    "проценты",
    "broker interest paid",
    "broker interest received",
    "intereses pagados por el intermediario",
    "intereses recibidos del intermediario",
}

FOREX_SECTIONS = {
    "forex balances",
    "saldos de forex",
    "saldos de divisas",
    "saldos en moneda extranjera",
    "devises",
    "forex-salden",
    "mark-to-market performance summary",
    "saldi forex",
    "saldos forex",
    "forex-saldi",
    "外汇余额",
    "外匯餘額",
    "為替残高",
}

HEADER_RECORD_TYPES = {
    "header",
    "encabezado",
    "cabecera",
    "en-tête",
    "en-tete",
    "kopfzeile",
    "intestazione",
    "cabeçalho",
    "koptekst",
    "表头",
    "表頭",
    "ヘッダー",
    "заголовок",
    "h",
}

DATA_RECORD_TYPES = {
    "data",
    "datos",
    "données",
    "donnees",
    "daten",
    "dati",
    "dados",
    "gegevens",
    "数据",
    "數據",
    "データ",
    "данные",
    "d",
}


def parse_xml_file(filepath: Path) -> List[Dict[str, Any]]:
    """Parses an IBKR Flex Query XML export (supporting Trade, Order, Execution, FlexTrade tags)."""
    trades: List[Dict[str, Any]] = []
    tree = ET.parse(filepath)
    root = tree.getroot()

    target_tags = ["Trade", "Order", "Execution", "FlexTrade", "TradeConfirm"]
    found_nodes: List[ET.Element] = []
    for tag in target_tags:
        found_nodes.extend(root.iter(tag))

    for node in found_nodes:
        attrs = {k: v for k, v in node.attrib.items()}
        exec_id = (
            attrs.get("ibExecId")
            or attrs.get("ibExecutionId")
            or attrs.get("transactionID")
            or attrs.get("tradeID")
            or attrs.get("executionID")
            or attrs.get("id")
        )
        raw_symbol = (attrs.get("symbol") or attrs.get("underlyingSymbol") or "").strip()
        if not raw_symbol:
            continue

        desc = attrs.get("description") or ""
        asset_cat = (attrs.get("assetCategory") or attrs.get("secType") or "STK").upper()
        symbol = normalize_symbol(raw_symbol, desc, asset_cat)

        date_raw = attrs.get("dateTime") or attrs.get("tradeDate") or attrs.get("reportDate") or ""
        t_date, t_time, t_dt_iso = parse_datetime_str(date_raw, require_time=True)
        if not t_date or not t_time:
            continue

        qty = clean_num(attrs.get("quantity") or attrs.get("shares") or attrs.get("size"))
        if abs(qty) < 1e-5:
            continue
        price = clean_num(attrs.get("tradePrice") or attrs.get("price"))
        side_val = (
            attrs.get("buySell") or attrs.get("side") or attrs.get("action") or ("BUY" if qty > 0 else "SELL")
        ).upper()
        side = "BUY" if ("BUY" in side_val or "BOT" in side_val) else "SELL"

        if not exec_id:
            exec_id = generate_deterministic_exec_id(symbol, t_dt_iso, side, qty, price, attrs.get("tradeID", ""))

        realized_pnl = clean_num(
            attrs.get("fifoPnlRealized") or attrs.get("realizedPNL") or attrs.get("realizedPnl") or attrs.get("fxPnl")
        )
        comm = abs(
            clean_num(attrs.get("ibCommission") or attrs.get("commission") or attrs.get("taxes") or attrs.get("fee"))
        )
        trade_money = clean_num(attrs.get("tradeMoney")) or (abs(qty) * price)
        proceeds = clean_num(attrs.get("proceeds"))

        trades.append(
            {
                "ib_exec_id": exec_id,
                "trade_id": attrs.get("tradeID") or exec_id,
                "account_id": attrs.get("accountId") or attrs.get("clientAccountId") or "",
                "symbol": symbol,
                "description": desc or symbol,
                "asset_category": asset_cat,
                "currency": attrs.get("currency") or "USD",
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
                "open_close_indicator": (attrs.get("openCloseIndicator") or attrs.get("code") or "C").upper(),
                "order_type": (attrs.get("orderType") or "MKT").upper(),
                "exchange": (attrs.get("exchange") or "SMART").upper(),
            }
        )

    return trades


def parse_xml_cash_transactions(filepath: Path) -> List[Dict[str, Any]]:
    """Parses cash transactions (deposits, withdrawals, transfers) from IBKR Flex XML."""
    txs: List[Dict[str, Any]] = []
    tree = ET.parse(filepath)
    root = tree.getroot()

    base_currency = "USD"
    for node in root.iter("AccountInformation"):
        base_currency = (node.attrib.get("baseCurrency") or "USD").upper()

    for node in root.iter("CashTransaction"):
        attrs = node.attrib
        tx_type_raw = (attrs.get("type") or "DEPOSIT").upper()
        amount_raw = clean_num(attrs.get("amount"))
        if amount_raw == 0:
            continue

        desc = attrs.get("description") or attrs.get("type") or ""
        desc_upper = desc.upper()

        tx_type = "DEPOSIT"
        if "WITHDRAW" in tx_type_raw or "FEE" in tx_type_raw or "TAX" in tx_type_raw or amount_raw < 0:
            if (
                "SUBSCRIPTION" in tx_type_raw
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
                "TAX" in tx_type_raw
                or "WITHHOLDING" in tx_type_raw
                or "TAX" in desc_upper
                or "RETENCI" in desc_upper
                or "IMPUESTO" in desc_upper
            ):
                tx_type = "WITHHOLDING TAX"
            elif "FEE" in tx_type_raw or "FEE" in desc_upper or "COMISI" in desc_upper:
                tx_type = "FEE"
            else:
                tx_type = "WITHDRAWAL"
        elif "DIVIDEND" in tx_type_raw or "DIVIDEND" in desc_upper:
            tx_type = "DIVIDEND"
        elif "TRANSFER" in tx_type_raw:
            tx_type = "TRANSFER"

        date_raw = attrs.get("dateTime") or attrs.get("reportDate") or attrs.get("settleDate") or ""
        t_date, t_time, t_dt_iso = parse_datetime_str(date_raw)
        curr = (attrs.get("currency") or base_currency).upper()
        fx_rate = clean_num(attrs.get("fxRateToBase"), 1.0)
        amount_base = round(amount_raw * fx_rate, 2)

        account_id = attrs.get("accountId") or ""
        tx_id = (
            attrs.get("transactionID")
            or attrs.get("id")
            or generate_deterministic_cash_id(account_id, t_dt_iso, tx_type, amount_raw, desc)
        )

        txs.append(
            {
                "transaction_id": tx_id,
                "account_id": account_id,
                "type": tx_type,
                "transaction_type": tx_type,
                "amount": amount_base,
                "raw_amount": amount_raw,
                "currency": curr,
                "raw_currency": curr,
                "base_currency": base_currency,
                "fx_rate_to_base": fx_rate,
                "transaction_date": t_date,
                "transaction_time": t_time,
                "description": desc,
                "is_manual": False,
            }
        )

    for node in root.iter("Transfer"):
        attrs = node.attrib
        amount_raw = clean_num(attrs.get("amount") or attrs.get("cashAmount"))
        if amount_raw == 0:
            continue
        tx_type = "DEPOSIT" if amount_raw > 0 else "WITHDRAWAL"
        date_raw = attrs.get("date") or attrs.get("dateTime") or attrs.get("settleDate") or ""
        t_date, t_time, t_dt_iso = parse_datetime_str(date_raw)
        curr = (attrs.get("currency") or base_currency).upper()
        fx_rate = clean_num(attrs.get("fxRateToBase"), 1.0)
        desc = attrs.get("description") or attrs.get("type") or "Transfer"
        account_id = attrs.get("accountId") or ""
        tx_id = attrs.get("transactionID") or generate_deterministic_cash_id(
            account_id, t_dt_iso, tx_type, amount_raw, desc
        )

        txs.append(
            {
                "transaction_id": tx_id,
                "account_id": account_id,
                "type": tx_type,
                "amount": round(amount_raw * fx_rate, 2),
                "raw_amount": amount_raw,
                "currency": curr,
                "raw_currency": curr,
                "base_currency": base_currency,
                "fx_rate_to_base": fx_rate,
                "transaction_date": t_date,
                "transaction_time": t_time,
                "description": desc,
                "is_manual": False,
            }
        )

    return txs


def parse_xml_open_positions(filepath: Path) -> List[Dict[str, Any]]:
    """Parses open positions from IBKR Flex XML."""
    positions: List[Dict[str, Any]] = []
    tree = ET.parse(filepath)
    root = tree.getroot()

    base_currency = "EUR"
    for node in root.iter("AccountInformation"):
        base_currency = (node.attrib.get("baseCurrency") or "EUR").upper()

    report_date = date.today().isoformat()
    for node in root.iter("FlexStatement"):
        rd = node.attrib.get("toDate") or node.attrib.get("reportDate")
        if rd:
            report_date = rd

    for node in root.iter("OpenPosition"):
        attrs = node.attrib
        qty = clean_num(attrs.get("position") or attrs.get("quantity"))
        if abs(qty) < 1e-6:
            continue
        raw_sym = attrs.get("symbol") or attrs.get("underlyingSymbol") or "UNKNOWN"
        desc = attrs.get("description") or attrs.get("contractDescription") or ""
        cat = (attrs.get("assetCategory") or attrs.get("secType") or "STK").upper()
        norm_sym = normalize_symbol(raw_sym, desc, cat)
        curr = (attrs.get("currency") or base_currency).upper()
        fx_rate = clean_num(attrs.get("fxRateToBase") or attrs.get("fxRate"), 1.0)
        raw_unrealized = clean_num(
            attrs.get("fifoPnlUnrealized")
            or attrs.get("unrealizedPnL")
            or attrs.get("unrealizedPnl")
            or attrs.get("markToMarketPnl")
        )
        unrealized = round(raw_unrealized * fx_rate, 4) if fx_rate > 0 else raw_unrealized

        positions.append(
            {
                "account_id": attrs.get("accountId") or "",
                "symbol": norm_sym,
                "description": desc or norm_sym,
                "asset_category": cat,
                "currency": curr,
                "raw_currency": curr,
                "base_currency": base_currency,
                "fx_rate_to_base": fx_rate,
                "quantity": qty,
                "cost_price": clean_num(attrs.get("costBasisPrice") or attrs.get("costPrice")),
                "cost_basis": clean_num(attrs.get("costBasisMoney") or attrs.get("costBasis")),
                "close_price": clean_num(attrs.get("markToMarketPrice") or attrs.get("closePrice")),
                "position_value": clean_num(attrs.get("positionValue")),
                "unrealized_pnl": unrealized,
                "raw_unrealized_pnl": raw_unrealized,
                "report_date": report_date,
            }
        )
    return positions


def parse_csv_file(filepath: Path) -> List[Dict[str, Any]]:
    """
    Parses IBKR CSV exports supporting:
    1. Flex Query CSV (standard flat tabular)
    2. Activity Statement CSV (sectioned with 'Trades,Data,...' or Spanish 'Operaciones,Datos,...')
    3. Trade Confirmation Reports CSV
    """
    with open(filepath, "r", encoding="utf-8-sig", errors="replace") as f:
        content = f.read()

    lines = content.splitlines()
    if not lines:
        return []

    delimiter = detect_csv_delimiter(lines)
    is_activity_statement = False
    for line in lines[:30]:
        tokens = parse_csv_line_tokens(line, delimiter)
        if len(tokens) >= 2:
            sec = tokens[0].strip().lower().strip('"')
            if (
                sec in TRADES_SECTIONS
                or sec in ACCOUNT_SECTIONS
                or sec in CASH_SECTIONS
                or sec == "statement"
                or sec == "extracto"
                or sec == "informe"
            ):
                is_activity_statement = True
                break

    if is_activity_statement:
        return parse_ibkr_activity_statement_csv(lines)
    return parse_generic_ibkr_csv(lines)


def parse_csv_cash_transactions(lines: List[str]) -> List[Dict[str, Any]]:
    """Parses Deposits & Withdrawals and Cash Transactions from IBKR Activity CSV (multilingual)."""
    cash_txs: List[Dict[str, Any]] = []
    account_id = ""
    base_currency = "USD"
    fx_rates_to_base: Dict[str, float] = {}

    delimiter = detect_csv_delimiter(lines)

    for line in lines:
        row = parse_csv_line_tokens(line, delimiter)
        if not row or len(row) < 3:
            continue
        section = row[0].strip().lower().strip('"')
        record_type = row[1].strip().lower().strip('"')

        if section in ACCOUNT_SECTIONS and record_type in DATA_RECORD_TYPES:
            if len(row) >= 4:
                field_name = row[2].strip().lower()
                field_val = row[3].strip()
                if field_name in ("account", "cuenta", "compte", "konto", "account id"):
                    account_id = field_val
                elif field_name in (
                    "base currency",
                    "divisa principal",
                    "divisa de cuenta",
                    "moneda base",
                    "devise de base",
                    "basiswährung",
                ):
                    base_currency = field_val.upper()
                    fx_rates_to_base[base_currency] = 1.0

        elif section in FOREX_SECTIONS and record_type in DATA_RECORD_TYPES:
            if len(row) >= 9:
                curr = row[4].strip().upper()
                close_price = clean_num(row[8])
                if curr and close_price > 0:
                    fx_rates_to_base[curr] = close_price

    section_headers: Dict[str, List[str]] = {}
    for line in lines:
        row = parse_csv_line_tokens(line, delimiter)
        if not row or len(row) < 3:
            continue
        section = row[0].strip().lower().strip('"')
        record_type = row[1].strip().lower().strip('"')

        if section in CASH_SECTIONS and record_type in HEADER_RECORD_TYPES:
            section_headers[section] = [h.strip().lower() for h in row[2:]]
        elif section in CASH_SECTIONS and record_type in DATA_RECORD_TYPES and section in section_headers:
            dw_headers = section_headers[section]
            data = [d.strip() for d in row[2:]]
            if len(data) < len(dw_headers):
                data += [""] * (len(dw_headers) - len(data))
            row_dict = dict(zip(dw_headers, data))

            # Skip summary / total rows
            disc = row_dict.get("datadiscriminator", "").lower()
            curr_str = row_dict.get("currency", row_dict.get("divisa", "")).lower()
            desc_str = (
                row_dict.get("description")
                or row_dict.get("descripción")
                or row_dict.get("type")
                or row_dict.get("tipo")
                or ""
            ).strip()
            if "total" in disc or "subtotal" in disc or "total" in curr_str or "total" in desc_str.lower():
                continue

            amt = clean_num(
                row_dict.get("amount")
                or row_dict.get("importe")
                or row_dict.get("monto")
                or row_dict.get("net amount")
                or row_dict.get("importe neto")
                or row_dict.get("amount in base")
                or 0.0
            )
            if amt == 0:
                continue

            dt_raw = (
                row_dict.get("settle date")
                or row_dict.get("fecha de liquidación")
                or row_dict.get("date/time")
                or row_dict.get("fecha/hora")
                or row_dict.get("date")
                or row_dict.get("fecha")
                or row_dict.get("settledate")
                or ""
            )
            if not dt_raw or len(dt_raw.strip()) < 8:
                continue

            raw_curr = (row_dict.get("currency") or row_dict.get("divisa") or base_currency).upper()
            if "TOTAL" in raw_curr:
                continue

            fx_rate = 1.0 if raw_curr == base_currency else fx_rates_to_base.get(raw_curr, 1.0)
            amt_in_base = round(amt * fx_rate, 4)

            t_date, t_time, t_dt_iso = parse_datetime_str(dt_raw, require_time=False)
            if not t_date:
                continue

            desc = desc_str or ("Electronic Funds Transfer" if amt > 0 else "Cash Withdrawal")
            desc_upper = desc.upper()
            sec_lower = section.lower()

            # Classification
            if (
                "tax" in sec_lower
                or "retenci" in sec_lower
                or "quellensteuer" in sec_lower
                or "withholding tax" in sec_lower
                or "WITHHOLDING" in desc_upper
                or " TAX" in desc_upper
                or desc_upper.endswith(" TAX")
            ):
                tx_type = "WITHHOLDING TAX"
                is_negative = True
            elif "dividend" in sec_lower or "DIVIDEND" in desc_upper:
                tx_type = "DIVIDEND"
                is_negative = amt < 0
            elif "interest" in sec_lower or "interes" in sec_lower:
                tx_type = "INTEREST"
                is_negative = amt < 0
            elif (
                "SUBSCRIPTION" in desc_upper
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
                is_negative = amt < 0
            elif "REFUND" in desc_upper or "REEMBOLSO" in desc_upper or "REBATE" in desc_upper:
                tx_type = "FEE" if amt < 0 else "DEPOSIT"
                is_negative = amt < 0
            elif "FEE" in desc_upper or "COMISIÓN" in desc_upper or "COMISION" in desc_upper or "fees" in sec_lower:
                tx_type = "FEE"
                is_negative = amt < 0
            elif amt > 0:
                tx_type = "DEPOSIT"
                is_negative = False
            else:
                tx_type = "WITHDRAWAL"
                is_negative = True

            signed_amount = -abs(round(amt_in_base, 2)) if is_negative else abs(round(amt_in_base, 2))

            tx_id = (
                row_dict.get("transaction id")
                or row_dict.get("transactionid")
                or row_dict.get("id de transacción")
                or row_dict.get("ref #")
                or generate_deterministic_cash_id(account_id, t_dt_iso, tx_type, amt, desc, raw_curr)
            )

            cash_txs.append(
                {
                    "transaction_id": tx_id,
                    "account_id": row_dict.get("accountid", "") or row_dict.get("cuenta", "") or account_id,
                    "type": tx_type,
                    "transaction_type": tx_type,
                    "amount": signed_amount,
                    "raw_amount": amt,
                    "currency": raw_curr,
                    "raw_currency": raw_curr,
                    "base_currency": base_currency,
                    "fx_rate_to_base": fx_rate,
                    "transaction_date": t_date,
                    "transaction_time": t_time,
                    "description": desc,
                    "is_manual": False,
                }
            )

    return cash_txs


COLUMN_ALIASES = {
    "symbol": [
        "symbol",
        "símbolo",
        "simbolo",
        "symbole",
        "underlying",
        "contrato",
        "subyacente",
        "valeur",
        "ticker",
        "symbool",
        "代碼",
        "代码",
        "銘柄",
        "シンボル",
        "символ",
        "fininstrument",
        "instrument",
        "wertpapier",
        "description",
        "descripción",
        "bezeichnung",
    ],
    "datetime": [
        "date/time",
        "date / time",
        "date",
        "trade date",
        "tradedate",
        "fecha/hora",
        "fecha / hora",
        "fecha",
        "datum/uhrzeit",
        "datum",
        "date/heure",
        "data/ora",
        "data/hora",
        "datum/tijd",
        "日期/时间",
        "日期/時間",
        "日期",
        "时间",
        "時間",
        "日時",
        "日付",
        "дата/время",
        "дата",
        "время",
        "date/time (iso)",
        "fecha/hora (iso)",
        "zeit",
        "heure",
        "ora",
        "transactiedatum",
        "handelszeit",
    ],
    "quantity": [
        "quantity",
        "qty",
        "shares",
        "posiciones",
        "cantidad",
        "qte",
        "quantité",
        "quantite",
        "anzahl",
        "menge",
        "volumen",
        "quantità",
        "quantita",
        "quantidade",
        "aantal",
        "数量",
        "數量",
        "количество",
        "volume",
    ],
    "price": [
        "t. price",
        "trade price",
        "tradeprice",
        "price",
        "kurs",
        "preis",
        "prix",
        "cours",
        "prezzo",
        "preço",
        "preco",
        "prijs",
        "koers",
        "precio de trans.",
        "precio op.",
        "precio de operación",
        "precio",
        "价格",
        "價格",
        "価格",
        "цена",
        "t price",
        "t.price",
    ],
    "proceeds": [
        "proceeds",
        "ingresos",
        "producto",
        "importe",
        "monto",
        "bruttoerlös",
        "bruttoerlos",
        "erlös",
        "erlos",
        "produit",
        "ricavo",
        "receita",
        "opbrengst",
        "收入",
        "收益",
        "代金",
        "доход",
        "выручка",
        "gross amount",
        "montant",
    ],
    "commission": [
        "comm/fee",
        "commission",
        "ib commission",
        "comm",
        "comisión/tarifa",
        "comision/tarifa",
        "com./tarifa",
        "comisión",
        "comision",
        "comisiones",
        "provision",
        "gebühr",
        "gebuehr",
        "frais",
        "courtage",
        "commissione",
        "comissão",
        "comissao",
        "commissie",
        "佣金",
        "手数料",
        "комиссия",
        "comm in eur",
        "comm in usd",
        "fee",
        "frais/comm.",
    ],
    "realized_pnl": [
        "realized p/l",
        "realized pnl",
        "realized profit",
        "fifopnlrealized",
        "fifo p/l realized",
        "p/g realizada",
        "p/l realizado",
        "g/p realizada",
        "g/p realizado",
        "gewinn/verlust",
        "gewinn",
        "p&l réalisé",
        "p&l realise",
        "p&l realizzato",
        "p&l realizado",
        "p&l",
        "p/l",
        "p/g",
        "g/p",
        "gerealiseerd",
        "已实现盈亏",
        "已實現盈虧",
        "盈亏",
        "実現損益",
        "損益",
        "прибыль",
        "реализованная прибыль",
        "realized p&l",
        "realized gain/loss",
    ],
    "currency": [
        "currency",
        "curr",
        "divisa",
        "moneda",
        "devise",
        "währung",
        "waehrung",
        "valuta",
        "moeda",
        "货币",
        "貨幣",
        "通貨",
        "валюта",
    ],
    "asset_category": [
        "asset category",
        "asset class",
        "categoría del activo",
        "categoria del activo",
        "categoría de activo",
        "categoria de activo",
        "clase de activo",
        "anlageklasse",
        "classe d'actif",
        "classe di attività",
        "classe de ativos",
        "activaklasse",
        "资产类别",
        "資產類別",
        "資産クラス",
        "класс активов",
        "sectype",
    ],
    "code": ["code", "código", "codigo", "code/type", "c/o", "open/close", "ouvert/ferme"],
    "side": [
        "buy/sell",
        "side",
        "action",
        "tipo",
        "type",
        "compra/venta",
        "kauf/verkauf",
        "achat/vente",
        "acquisto/vendita",
        "compra/venda",
        "koop/verkoop",
        "买卖",
        "買賣",
        "売買",
        "покупка/продажа",
    ],
    "trade_id": [
        "tradeid",
        "trade id",
        "id de la operación",
        "id de la operacion",
        "transaction id",
        "transactionid",
        "id de transacción",
        "id de transaccion",
        "numéro de transaction",
        "transaktions-id",
        "transaktionsid",
        "成交编号",
        "成交編號",
        "取引id",
        "номер сделки",
    ],
    "exec_id": [
        "ibexecutionid",
        "ibexecid",
        "execid",
        "id de ejecución",
        "id de ejecucion",
        "id de ejecución de ib",
        "numéro d'exécution",
        "numero d'execution",
        "ausführungs-id",
        "ausfuehrungs-id",
        "ausführungsid",
        "执行编号",
        "執行編號",
        "約定id",
        "номер исполнения",
    ],
    "order_type": [
        "order type",
        "ordertype",
        "tipo de orden",
        "auftragstyp",
        "ordre type",
        "tipo di ordine",
        "tipo de ordem",
        "订单类型",
        "訂單類型",
        "注文種別",
        "тип заказа",
    ],
    "exchange": [
        "exchange",
        "bolsa",
        "mercado",
        "börse",
        "boerse",
        "bourse",
        "borsa",
        "beurs",
        "交易所",
        "取引所",
        "биржа",
    ],
}


def _strip_accents(s: str) -> str:
    import unicodedata

    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def get_field_val(row_dict: Dict[str, str], field_key: str) -> str:
    """Retrieves field value from row dict using universal multilingual alias lookup and accent tolerance."""
    aliases = COLUMN_ALIASES.get(field_key, [])
    # 1. Exact match
    for alias in aliases:
        if alias in row_dict and row_dict[alias].strip():
            return row_dict[alias].strip()

    # 2. Normalized alphanumeric + accent-stripped match
    norm_row = {_strip_accents("".join(c for c in k.lower() if c.isalnum())): v for k, v in row_dict.items()}
    for alias in aliases:
        norm_alias = _strip_accents("".join(c for c in alias.lower() if c.isalnum()))
        if norm_alias and norm_alias in norm_row and norm_row[norm_alias].strip():
            return norm_row[norm_alias].strip()

    return ""


def is_cash_section(section_name: str, header_cols: Optional[List[str]] = None) -> bool:
    """
    3-Tier Universal Cash Transfers Section Detection.
    """
    sec = _strip_accents(section_name.strip().lower())
    if sec in CASH_SECTIONS or section_name.strip().lower() in CASH_SECTIONS:
        return True
    if any(
        root in sec
        for root in (
            "deposit",
            "withdraw",
            "transfer",
            "deposito",
            "retirada",
            "reintegro",
            "virement",
            "einzahl",
            "auszahl",
            "stort",
            "preliev",
        )
    ):
        return True
    if header_cols:
        col_text = " ".join(header_cols).lower()
        has_amount = any(w in col_text for w in ("amount", "importe", "monto", "betrag", "montant", "importo"))
        has_date = any(w in col_text for w in ("date", "fecha", "datum", "data"))
        if has_amount and has_date:
            return True
    return False


def is_trades_section(section_name: str, header_cols: Optional[List[str]] = None) -> bool:
    """
    3-Tier Universal Trades Section Detection:
    1. Direct match in TRADES_SECTIONS (O(1)).
    2. Substring root match (e.g. 'trade', 'operac', 'transac', 'exec', 'ord', 'deal', 'fill', etc.).
    3. Structural column inference (if table contains symbol, date/time, quantity, price, or pnl columns).
    """
    if is_cash_section(section_name):
        return False
    sec = _strip_accents(section_name.strip().lower())
    if sec in TRADES_SECTIONS or section_name.strip().lower() in TRADES_SECTIONS:
        return True
    if any(
        root in sec
        for root in (
            "trade",
            "operac",
            "transac",
            "exec",
            "ord",
            "geschaf",
            "negoz",
            "deal",
            "fill",
            "handels",
            "titre",
        )
    ):
        return True
    if header_cols:
        matches = 0
        for col_key in ("symbol", "datetime", "quantity", "price", "realized_pnl"):
            aliases = COLUMN_ALIASES.get(col_key, [])
            for col in header_cols:
                clean_col = _strip_accents("".join(c for c in col.lower() if c.isalnum()))
                for alias in aliases:
                    clean_alias = _strip_accents("".join(c for c in alias.lower() if c.isalnum()))
                    if clean_alias and (clean_col == clean_alias or clean_alias in clean_col):
                        matches += 1
                        break
        if matches >= 3:
            return True
    return False


def parse_ibkr_activity_statement_csv(lines: List[str]) -> List[Dict[str, Any]]:
    """Parses standard IBKR Activity Statement CSV (universal multilingual & structural heuristic) with multi-currency conversion."""
    trades: List[Dict[str, Any]] = []
    headers: List[str] = []
    trades_section_name: str = ""
    account_id = ""
    base_currency = "USD"
    fx_rates_to_base: Dict[str, float] = {}

    delimiter = detect_csv_delimiter(lines)

    # Pass 1: Extract account Base Currency and FX conversion rates from statement tables
    for line in lines:
        row = parse_csv_line_tokens(line, delimiter)
        if not row or len(row) < 3:
            continue
        section = row[0].strip().lower().strip('"')
        record_type = row[1].strip().lower().strip('"')

        if section in ACCOUNT_SECTIONS and record_type in DATA_RECORD_TYPES:
            if len(row) >= 4:
                field_name = row[2].strip().lower()
                field_val = row[3].strip()
                if field_name in (
                    "account",
                    "cuenta",
                    "compte",
                    "konto",
                    "account id",
                    "conto",
                    "conta",
                    "rekening",
                    "账户",
                    "賬戶",
                    "口座",
                    "аккаунт",
                ):
                    account_id = field_val
                elif field_name in (
                    "base currency",
                    "divisa principal",
                    "divisa de cuenta",
                    "moneda base",
                    "devise de base",
                    "basiswährung",
                    "valuta di base",
                    "moeda base",
                    "basisvaluta",
                    "基准货币",
                    "基準通貨",
                    "базовая валюта",
                ):
                    base_currency = field_val.upper()
                    fx_rates_to_base[base_currency] = 1.0

        elif section in FOREX_SECTIONS and record_type in DATA_RECORD_TYPES:
            if len(row) >= 9:
                curr = row[4].strip().upper()
                close_price = clean_num(row[8])
                if curr and close_price > 0:
                    fx_rates_to_base[curr] = close_price
            elif len(row) >= 8 and any(
                term in row[2].strip().lower()
                for term in ("forex", "divisas", "moneda", "devises", "valuta", "währung", "外汇", "為替")
            ):
                curr = row[3].strip().upper()
                curr_price = clean_num(row[7])
                if curr and curr_price > 0:
                    fx_rates_to_base[curr] = curr_price
        elif (
            any(
                term in section
                for term in (
                    "exchange rate",
                    "tipo de cambio",
                    "tipos de cambio",
                    "wechselkurs",
                    "taux de change",
                    "tassi di cambio",
                    "汇率",
                    "為替レート",
                )
            )
            and record_type in DATA_RECORD_TYPES
        ):
            for val in row[2:]:
                num_val = clean_num(val)
                if num_val > 0 and num_val != 1.0:
                    for curr_token in row[2:]:
                        c_str = curr_token.strip().upper()
                        if len(c_str) == 3 and c_str.isalpha() and c_str != base_currency:
                            fx_rates_to_base[c_str] = num_val

    # Pass 2: Process trade executions
    for line in lines:
        row = parse_csv_line_tokens(line, delimiter)
        if not row or len(row) < 3:
            continue

        section = row[0].strip().lower().strip('"')
        record_type = row[1].strip().lower().strip('"')

        if record_type in HEADER_RECORD_TYPES and (
            is_trades_section(section, row[2:]) or section == trades_section_name
        ):
            trades_section_name = section
            raw_headers = [h.strip().lower() for h in row[2:]]
            seen_headers: Dict[str, int] = {}
            unique_headers = []
            for h in raw_headers:
                cnt = seen_headers.get(h, 0)
                seen_headers[h] = cnt + 1
                unique_headers.append(h if cnt == 0 else f"{h}_{cnt + 1}")
            headers = unique_headers
        elif (
            record_type in DATA_RECORD_TYPES
            and headers
            and (section == trades_section_name or is_trades_section(section))
        ):
            data = [d.strip() for d in row[2:]]
            if len(data) < len(headers):
                data += [""] * (len(headers) - len(data))

            row_dict = dict(zip(headers, data))

            # Skip subheaders or total summary lines
            discriminator = (
                row_dict.get("datadiscriminator")
                or row_dict.get("discriminador de datos")
                or row_dict.get("datenunterscheider")
                or ""
            ).lower()
            if "total" in discriminator or "subtotal" in discriminator or "gesamt" in discriminator:
                continue

            symbol = get_field_val(row_dict, "symbol").upper()
            if not symbol:
                continue

            dt_raw = get_field_val(row_dict, "datetime")
            t_date, t_time, t_dt_iso = parse_datetime_str(dt_raw, require_time=True)
            if not t_date or not t_time:
                continue

            qty = clean_num(get_field_val(row_dict, "quantity"))
            if abs(qty) < 1e-5:
                continue
            price = clean_num(get_field_val(row_dict, "price"))
            proceeds = clean_num(get_field_val(row_dict, "proceeds"))

            raw_currency = (get_field_val(row_dict, "currency") or base_currency).upper()
            row_fx_rate = clean_num(get_field_val(row_dict, "fx_rate"))
            if row_fx_rate > 0:
                fx_rate = row_fx_rate
            elif raw_currency == base_currency:
                fx_rate = 1.0
            else:
                fx_rate = fx_rates_to_base.get(raw_currency, 1.0)

            raw_comm = abs(clean_num(get_field_val(row_dict, "commission")))
            raw_pnl = clean_num(get_field_val(row_dict, "realized_pnl"))

            base_comm_key = f"comm in {base_currency.lower()}"
            if base_comm_key in headers and row_dict.get(base_comm_key):
                comm_in_base = abs(clean_num(row_dict.get(base_comm_key)))
            elif "comm in eur" in headers and base_currency == "EUR" and row_dict.get("comm in eur"):
                comm_in_base = abs(clean_num(row_dict.get("comm in eur")))
            elif "comm in usd" in headers and base_currency == "USD" and row_dict.get("comm in usd"):
                comm_in_base = abs(clean_num(row_dict.get("comm in usd")))
            else:
                comm_in_base = round(raw_comm * fx_rate, 4)

            pnl_in_base = round(raw_pnl * fx_rate, 4)

            raw_cat = get_field_val(row_dict, "asset_category").upper()
            asset_category = "STK"
            if any(
                term in raw_cat
                for term in (
                    "OPTION",
                    "OPCIÓN",
                    "OPCION",
                    "OPTIONEN",
                    "OPZIONI",
                    "OPÇÕES",
                    "OPTIE",
                    "期权",
                    "期權",
                    "オプション",
                    "ОПЦИОН",
                )
            ):
                asset_category = "OPT"
            elif any(
                term in raw_cat for term in ("FUTURE", "FUTURO", "FUTURES", "FUTURS", "期货", "期貨", "先物", "ФЬЮЧЕРС")
            ):
                asset_category = "FUT"
            elif any(
                term in raw_cat
                for term in ("FOREX", "CASH", "DIVISA", "DEVISE", "WÄHRUNG", "VALUTA", "外汇", "為替", "ВАЛЮТА")
            ):
                asset_category = "CASH"
            elif any(
                term in raw_cat
                for term in (
                    "CRYPTO",
                    "CRIPTOMONEDA",
                    "KRYPTO",
                    "CRYPTOMONNAIE",
                    "CRIPTOVALUTA",
                    "CRIPTO",
                    "加密",
                    "暗号資産",
                    "КРИПТО",
                )
            ):
                asset_category = "CRYPTO"
            elif any(
                term in raw_cat
                for term in ("BOND", "BONO", "ANLEIHE", "OBLIGATION", "OBBLIGAZIONE", "债券", "債券", "ОБЛИГАЦИЯ")
            ):
                asset_category = "BOND"

            desc = (
                row_dict.get("description")
                or row_dict.get("descripción")
                or row_dict.get("beschreibung")
                or row_dict.get("description")
                or ""
            )
            symbol = normalize_symbol(symbol, desc, asset_category)

            code = (get_field_val(row_dict, "code") or "C").upper()
            open_close = "O" if "O" in code else ("C" if "C" in code else "C")

            raw_side = get_field_val(row_dict, "side").upper()
            if (
                any(
                    term in raw_side
                    for term in (
                        "BUY",
                        "COMPRA",
                        "BOT",
                        "KAUF",
                        "ACHAT",
                        "ACQUISTO",
                        "KOOP",
                        "买",
                        "買",
                        "買い",
                        "ПОКУПКА",
                    )
                )
                or raw_side == "C"
            ):
                side = "BUY"
            elif (
                any(
                    term in raw_side
                    for term in (
                        "SELL",
                        "VENTA",
                        "SLD",
                        "VERKAUF",
                        "VENTE",
                        "VENDITA",
                        "VERKOOP",
                        "卖",
                        "賣",
                        "売り",
                        "ПРОДАЖА",
                    )
                )
                or raw_side == "V"
            ):
                side = "SELL"
            else:
                side = "BUY" if qty > 0 else "SELL"

            trade_id = get_field_val(row_dict, "trade_id")
            exec_id = get_field_val(row_dict, "exec_id") or generate_deterministic_exec_id(
                symbol, t_dt_iso, side, qty, price, trade_id
            )

            trades.append(
                {
                    "ib_exec_id": exec_id,
                    "trade_id": trade_id or exec_id,
                    "account_id": row_dict.get("accountid", "") or row_dict.get("cuenta", "") or account_id,
                    "symbol": symbol,
                    "description": desc or symbol,
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
                    "order_type": (get_field_val(row_dict, "order_type") or "MKT").upper(),
                    "exchange": (get_field_val(row_dict, "exchange") or "SMART").upper(),
                }
            )

    return trades


def parse_generic_ibkr_csv(lines: List[str]) -> List[Dict[str, Any]]:
    """Parses standard tabular Flex CSV or Trade Confirmation CSV exports (multilingual)."""
    trades: List[Dict[str, Any]] = []
    if not lines:
        return []

    delimiter = detect_csv_delimiter(lines)
    reader = csv.DictReader(lines, delimiter=delimiter)

    for raw_row in reader:
        # Normalize keys by removing non-alphanumeric chars
        row = {}
        for k, v in raw_row.items():
            if k:
                clean_k = "".join(c for c in k.lower() if c.isalnum())
                row[clean_k] = v

        raw_sym = (
            row.get("symbol")
            or row.get("simbolo")
            or row.get("símbolo")
            or row.get("underlying")
            or row.get("contrato")
            or row.get("subyacente")
            or ""
        ).strip()
        if not raw_sym:
            continue

        dt_raw = (
            row.get("datetime")
            or row.get("tradedatetime")
            or row.get("date")
            or row.get("tradedate")
            or row.get("fechahora")
            or row.get("fecha")
            or ""
        )
        t_date, t_time, t_dt_iso = parse_datetime_str(dt_raw, require_time=True)
        if not t_date or not t_time:
            continue

        qty = clean_num(
            row.get("quantity") or row.get("qty") or row.get("shares") or row.get("cantidad") or row.get("posiciones")
        )
        if abs(qty) < 1e-5:
            continue
        price = clean_num(
            row.get("tradeprice")
            or row.get("price")
            or row.get("tprice")
            or row.get("preciodetrans")
            or row.get("precio")
        )
        proceeds = clean_num(row.get("proceeds") or row.get("ingresos") or row.get("importe"))
        comm = abs(
            clean_num(
                row.get("ibcommission")
                or row.get("commission")
                or row.get("commfee")
                or row.get("comm")
                or row.get("comision")
            )
        )
        realized_pnl = clean_num(
            row.get("fifopnlrealized")
            or row.get("realizedpnl")
            or row.get("realizedpl")
            or row.get("pnl")
            or row.get("pgrealizada")
        )

        raw_side = (row.get("buysell") or row.get("side") or row.get("action") or row.get("tipo") or "").upper()
        if "BUY" in raw_side or "COMPRA" in raw_side or "BOT" in raw_side:
            side = "BUY"
        elif "SELL" in raw_side or "VENTA" in raw_side or "SLD" in raw_side:
            side = "SELL"
        else:
            side = "BUY" if qty > 0 else "SELL"

        raw_cat = (
            row.get("assetcategory")
            or row.get("assetclass")
            or row.get("categoriadelactivo")
            or row.get("type")
            or "STK"
        ).upper()
        asset_category = "STK"
        if "OPT" in raw_cat or "OPC" in raw_cat:
            asset_category = "OPT"
        elif "FUT" in raw_cat:
            asset_category = "FUT"
        elif "CASH" in raw_cat or "FOREX" in raw_cat or "DIVISA" in raw_cat:
            asset_category = "CASH"
        elif "CRYPTO" in raw_cat or "CRIPT" in raw_cat:
            asset_category = "CRYPTO"

        desc = row.get("description") or row.get("descripcion") or ""
        symbol = normalize_symbol(raw_sym, desc, asset_category)

        trade_id = row.get("tradeid") or row.get("transactionid") or row.get("idoperacion") or ""
        exec_id = (
            row.get("ibexecutionid")
            or row.get("ibexecid")
            or row.get("execid")
            or row.get("idejecucion")
            or generate_deterministic_exec_id(symbol, t_dt_iso, side, qty, price, trade_id)
        )

        trades.append(
            {
                "ib_exec_id": exec_id,
                "trade_id": trade_id or exec_id,
                "account_id": row.get("accountid") or row.get("clientaccountid") or row.get("cuenta") or "",
                "symbol": symbol,
                "description": desc or symbol,
                "asset_category": asset_category,
                "currency": (row.get("currency") or row.get("divisa") or "EUR").upper(),
                "buy_sell": side,
                "quantity": qty,
                "trade_price": price,
                "trade_money": abs(qty) * price if price else 0.0,
                "proceeds": proceeds,
                "ib_commission": comm,
                "realized_pnl": realized_pnl,
                "trade_date": t_date,
                "trade_time": t_time,
                "trade_date_time": t_dt_iso,
                "open_close_indicator": (
                    row.get("opencloseindicator") or row.get("code") or row.get("codigo") or "C"
                ).upper()[:1],
                "order_type": (row.get("ordertype") or row.get("tipodeorden") or "MKT").upper(),
                "exchange": (row.get("exchange") or row.get("bolsa") or "SMART").upper(),
            }
        )

    return trades


def parse_csv_open_positions(lines: List[str]) -> List[Dict[str, Any]]:
    """
    Parses Open Positions section from IBKR Activity Statement CSV into structured position dicts.
    """
    delimiter = detect_csv_delimiter(lines)
    positions: List[Dict[str, Any]] = []

    report_date = date.today().isoformat()
    base_currency = "EUR"

    for line in lines[:60]:
        row = parse_csv_line_tokens(line, delimiter)
        if len(row) >= 4:
            sec = row[0].strip().lower().strip('"')
            if sec in ("account information", "información de la cuenta", "información sobre la cuenta"):
                f_name = row[2].strip().lower().strip('"')
                if "base currency" in f_name or "moneda base" in f_name or "divisa base" in f_name:
                    base_currency = row[3].strip().upper().strip('"')
            elif sec in ("statement", "extracto", "informe", "estado"):
                f_name = row[2].strip().lower().strip('"')
                if "period" in f_name or "período" in f_name:
                    p_val = row[3].strip()
                    m = re.findall(r"\b\d{4}-\d{2}-\d{2}\b", p_val)
                    if m:
                        report_date = m[-1]

    header_map: Dict[str, int] = {}
    in_open_pos = False

    for line in lines:
        row = parse_csv_line_tokens(line, delimiter)
        if not row or len(row) < 3:
            continue
        sec = row[0].strip().lower().strip('"')
        if sec not in ("open positions", "posiciones abiertas", "posiciones vivas"):
            continue

        row_type = row[1].strip().lower().strip('"')
        if row_type == "header":
            header_map = {col.strip().lower().strip('"'): i for i, col in enumerate(row)}
            in_open_pos = True
            continue

        if row_type == "data" and in_open_pos and header_map:

            def get_col(keys: List[str], default: str = "") -> str:
                for k in keys:
                    if k in header_map and header_map[k] < len(row):
                        v = row[header_map[k]].strip().strip('"')
                        if v:
                            return v
                return default

            data_disc = get_col(["datadiscriminator", "discriminador", "tipo"]).lower()
            if data_disc in ("subtotal", "total", "total (all assets)", "total (todos los activos)"):
                continue

            raw_sym = get_col(["symbol", "símbolo", "simbolo", "financial instrument", "instrumento financiero"])
            if not raw_sym:
                continue

            qty = clean_num(get_col(["quantity", "cantidad", "posición", "posicion", "position"]))
            if abs(qty) < 1e-6:
                continue

            cost_price = clean_num(get_col(["cost price", "precio de coste", "precio coste", "cost basis price"]))
            cost_basis = clean_num(get_col(["cost basis", "base de coste", "base coste", "cost basis money"]))
            close_price = clean_num(
                get_col(["close price", "precio de cierre", "precio cierre", "mark to market price", "mark price"])
            )
            pos_val = clean_num(get_col(["value", "valor", "position value", "current value"]))
            raw_unrealized = clean_num(
                get_col(
                    ["unrealized p/l", "p/l no realizado", "pnl no realizado", "unrealized pnl", "unrealized fifo p/l"]
                )
            )
            curr = get_col(["currency", "divisa", "moneda"], default=base_currency).upper()
            cat = get_col(
                ["asset category", "categoría del activo", "categoria del activo", "sectype"], default="STK"
            ).upper()
            if "STOCK" in cat or "ACCION" in cat or "ACCIONES" in cat:
                cat = "STK"
            elif "OPTION" in cat or "OPCION" in cat or "OPCIONES" in cat:
                cat = "OPT"

            norm_sym = normalize_symbol(raw_sym, raw_sym, cat)
            fx_rate = 1.0

            positions.append(
                {
                    "account_id": "",
                    "symbol": norm_sym,
                    "description": norm_sym,
                    "asset_category": cat,
                    "currency": curr,
                    "raw_currency": curr,
                    "base_currency": base_currency,
                    "fx_rate_to_base": fx_rate,
                    "quantity": qty,
                    "cost_price": cost_price,
                    "cost_basis": cost_basis,
                    "close_price": close_price,
                    "position_value": pos_val,
                    "unrealized_pnl": raw_unrealized,
                    "raw_unrealized_pnl": raw_unrealized,
                    "report_date": report_date,
                }
            )

    return positions


def parse_csv_unrealized_pnl(lines: List[str]) -> Optional[float]:
    """Extracts total Unrealized P&L from an IBKR Activity Statement CSV if available."""
    open_pos = parse_csv_open_positions(lines)
    if open_pos:
        return round(sum(p["unrealized_pnl"] for p in open_pos), 2)

    delimiter = detect_csv_delimiter(lines)
    for line in lines:
        row = parse_csv_line_tokens(line, delimiter)
        if not row or len(row) < 3:
            continue
        sec = row[0].strip().lower().strip('"')
        # 1. Performance Summary table
        if ("realized & unrealized" in sec or "rendimiento" in sec or "performance" in sec) and len(row) >= 16:
            if "total (all assets)" in line.lower() or "total (todos los activos)" in line.lower():
                unrealized_str = row[14].strip()
                val = clean_num(unrealized_str)
                return round(val, 2)
        # 2. Open Positions grand total
        if ("open positions" in sec or "posiciones abiertas" in sec) and len(row) >= 13:
            if row[1].strip().lower() in ("total", "total (all assets)") and len(row) >= 14:
                val = clean_num(row[12])
                if val != 0.0:
                    return round(val, 2)
    return None


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
    all_cash_txs: List[Dict[str, Any]] = []
    all_open_positions: List[Dict[str, Any]] = []

    for f in sorted(files_to_process):
        logger.info(f"Reading file: {f.name} ({f.stat().st_size / 1024:.1f} KB)")
        try:
            if f.suffix.lower() == ".xml":
                parsed = parse_xml_file(f)
                cash_parsed = parse_xml_cash_transactions(f)
                open_pos_parsed = parse_xml_open_positions(f)
            else:
                parsed = parse_csv_file(f)
                with open(f, "r", encoding="utf-8-sig", errors="replace") as cf:
                    csv_lines = cf.read().splitlines()
                cash_parsed = parse_csv_cash_transactions(csv_lines)
                open_pos_parsed = parse_csv_open_positions(csv_lines)

            logger.info(
                f"  -> Extracted {len(parsed)} trade executions, {len(cash_parsed)} cash transactions, {len(open_pos_parsed)} open positions."
            )
            if verbose:
                for t in parsed[:5]:
                    logger.debug(
                        f"     {t['trade_date']} {t['trade_time']} | {t['symbol']} | {t['buy_sell']} {t['quantity']} @ {t['trade_price']} | PnL: {t['realized_pnl']}"
                    )
                if len(parsed) > 5:
                    logger.debug(f"     ... and {len(parsed) - 5} more.")

            all_trades.extend(parsed)
            all_cash_txs.extend(cash_parsed)
            if open_pos_parsed:
                all_open_positions = open_pos_parsed
            total_parsed += len(parsed)
        except Exception as e:
            logger.error(f"Error parsing {f}: {e}")

    if dry_run:
        logger.info(
            f"[DRY-RUN] Would upsert {len(all_trades)} trades, {len(all_cash_txs)} cash transactions, and {len(all_open_positions)} open positions into {DB_PATH.name} (no changes written)."
        )
        return total_parsed, 0

    init_db()
    upserted_count = upsert_trades(all_trades)
    if all_cash_txs:
        upsert_cash_transactions(all_cash_txs)
    if all_open_positions:
        upsert_open_positions(all_open_positions)
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
            VALUES ('cli_import', 'success', ?, CURRENT_TIMESTAMP);
        """,
            (upserted_count,),
        )
    logger.info(
        f"✓ Successfully upserted {upserted_count} trades, {len(all_cash_txs)} cash transactions, and {len(all_open_positions)} open positions into SQLite ({DB_PATH.name})."
    )
    return total_parsed, upserted_count


def main():
    parser = argparse.ArgumentParser(
        description="IBKR Historical Multi-Year Trades Importer (CSV / XML / Activity Statements)"
    )
    parser.add_argument(
        "paths",
        nargs="+",
        help="One or more paths to CSV/XML files or directories containing statements (e.g. ./data/history/ or 2022.csv 2023.xml)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Simulates parsing and shows count without writing to database"
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Displays detailed trade outputs")

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

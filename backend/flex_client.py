import asyncio
import logging
import xml.etree.ElementTree as ET
from datetime import date
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode
from urllib.request import Request, urlopen


try:
    import httpx
except ImportError:
    httpx = None  # type: ignore[assignment]

from backend.config import IBKR_QUERY_ID, IBKR_TOKEN
from backend.database import normalize_symbol

logger = logging.getLogger("ib-journal.flex")

IBKR_SERVICE_ENDPOINTS: List[Tuple[str, str]] = [
    # Modern endpoint (AccountManagement/FlexWebService)
    (
        "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest",
        "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement",
    ),
    (
        "https://gdcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest",
        "https://gdcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement",
    ),
    (
        "https://www.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest",
        "https://www.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement",
    ),
    # Legacy servlet endpoints fallback
    (
        "https://ndcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest",
        "https://ndcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement",
    ),
    (
        "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest",
        "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement",
    ),
]


class IBKRFlexClient:
    def __init__(self, token: str = IBKR_TOKEN, query_id: str = IBKR_QUERY_ID):
        self.token = token
        self.query_id = query_id
        self._active_get_url = IBKR_SERVICE_ENDPOINTS[0][1]

    async def _http_get(self, url: str, params: Dict[str, str]) -> Tuple[int, str]:
        """Performs GET request via httpx or urllib with redirect following."""
        query_string = urlencode(params)
        full_url = f"{url}?{query_string}"

        if httpx is not None:
            async with httpx.AsyncClient(
                timeout=30.0, follow_redirects=True, headers={"User-Agent": "IB-Journal/1.0"}
            ) as client:
                resp = await client.get(full_url)
                return resp.status_code, resp.text
        else:
            # Standard library urllib fallback
            req = Request(full_url, headers={"User-Agent": "IB-Journal/1.0"})
            loop = asyncio.get_event_loop()

            def sync_req():
                with urlopen(req, timeout=30) as r:
                    return r.status, r.read().decode("utf-8")

            return await loop.run_in_executor(None, sync_req)

    async def fetch_statement_xml(self, query_id: Optional[str] = None) -> str:
        """
        Executes the two-step IBKR Flex Query Web Service protocol:
        1. SendRequest with Token & Query ID -> get ReferenceCode (with fallback endpoints)
        2. Poll GetStatement with ReferenceCode & Token -> get final XML statement
        """
        active_query_id = (query_id or self.query_id or "").strip()
        if not self.token or not active_query_id:
            raise ValueError("IBKR_TOKEN and Query ID must be provided.")

        # Step 1: Send Request with endpoint fallback
        logger.info(f"Initiating IBKR Flex Query request for query ID: {active_query_id}")
        last_network_error: Optional[Exception] = None
        status_code = 0
        resp_text = ""

        for send_url, get_url in IBKR_SERVICE_ENDPOINTS:
            try:
                status_code, resp_text = await self._http_get(send_url, {"t": self.token, "q": active_query_id, "v": "3"})
                if status_code == 200 and "<Status>Success</Status>" in resp_text:
                    self._active_get_url = get_url
                    last_network_error = None
                    break
                elif status_code == 200 and "<ErrorCode>" in resp_text:
                    # Valid response format from IBKR but error status
                    last_network_error = None
                    break
            except Exception as e:
                logger.warning(f"Could not connect to IBKR endpoint {send_url}: {e}")
                last_network_error = e

        if last_network_error is not None and not resp_text:
            raise ConnectionError(
                f"Failed to connect to Interactive Brokers servers ({last_network_error}). "
                "Please verify your internet connection, DNS settings, or VPN."
            )

        if status_code != 200:
            raise RuntimeError(f"IBKR SendRequest HTTP error: {status_code} - {resp_text}")

        root = ET.fromstring(resp_text)
        status_elem = root.find("Status")
        status = status_elem.text if status_elem is not None else ""

        if status != "Success":
            code_elem = root.find("ErrorCode")
            msg_elem = root.find("ErrorMessage")
            err_code = code_elem.text if code_elem is not None else "Unknown"
            err_msg = msg_elem.text if msg_elem is not None else resp_text
            logger.error(f"IBKR Flex Request Error [{err_code}]: {err_msg}")
            raise RuntimeError(f"IBKR Flex Error {err_code}: {err_msg}")

        ref_elem = root.find("ReferenceCode")
        if ref_elem is None or not ref_elem.text:
            raise RuntimeError("IBKR did not return a valid ReferenceCode.")

        ref_code = ref_elem.text.strip()
        logger.info(f"Received ReferenceCode: {ref_code}. Polling statement from {self._active_get_url}...")

        # Step 2: Poll for statement ready
        get_url = self._active_get_url
        max_attempts = 15
        for attempt in range(1, max_attempts + 1):
            await asyncio.sleep(attempt * 1.5)  # Progressive backoff

            s_code, stmt_text = await self._http_get(get_url, {"t": self.token, "q": ref_code, "v": "3"})

            if s_code != 200:
                continue

            stmt_text = stmt_text.strip()

            # Check if it returned an intermediate status message
            if stmt_text.startswith("<FlexStatementResponse") and "Statement is being generated" in stmt_text:
                logger.debug(f"Attempt {attempt}: Statement is generating...")
                continue

            if "<FlexStatements" in stmt_text or "<FlexQueryResponse" in stmt_text:
                logger.info("Successfully received full IBKR Flex XML statement.")
                return stmt_text

            # Check for explicit error in response
            try:
                stmt_root = ET.fromstring(stmt_text)
                err_node = stmt_root.find("ErrorMessage")
                if err_node is not None and err_node.text:
                    raise RuntimeError(f"IBKR Statement polling error: {err_node.text}")
            except ET.ParseError:
                pass

        raise TimeoutError("IBKR statement generation timed out after max retries.")

    def parse_trades_xml(self, xml_content: str) -> List[Dict[str, Any]]:
        """
        Parses XML statement extracting all trade executions and realized PnL.
        """
        trades: List[Dict[str, Any]] = []
        try:
            root = ET.fromstring(xml_content)
        except ET.ParseError as e:
            logger.error(f"Failed to parse IBKR XML: {e}")
            raise

        # Find all <Trade>, <TradeConfirm>, <Execution>, <Order>, or <FlexTrade> elements
        target_tags = ["Trade", "TradeConfirm", "Execution", "Order", "FlexTrade"]
        seen_exec_ids = set()
        for tag in target_tags:
            for trade_node in root.iter(tag):
                attrs = trade_node.attrib

                exec_id = (
                    attrs.get("ibExecId")
                    or attrs.get("ibExecutionId")
                    or attrs.get("transactionID")
                    or attrs.get("tradeID")
                    or attrs.get("executionID")
                )
                if not exec_id or exec_id in seen_exec_ids:
                    continue
                seen_exec_ids.add(exec_id)

                # Date formatting (IBKR usually provides dateTime="YYYYMMDD;HHMMSS" or dateTime="YYYY-MM-DD, HH:MM:SS")
                date_time_raw = attrs.get("dateTime") or attrs.get("tradeDate") or attrs.get("reportDate") or ""
                trade_date = ""
                trade_time = ""
                trade_datetime_iso = ""

                if date_time_raw:
                    cleaned = date_time_raw.replace(";", " ").replace(",", " ")
                    parts = cleaned.split()
                    if len(parts) >= 1:
                        raw_d = parts[0].replace("-", "")
                        if len(raw_d) == 8:
                            trade_date = f"{raw_d[:4]}-{raw_d[4:6]}-{raw_d[6:]}"
                        else:
                            trade_date = parts[0]
                    if len(parts) >= 2:
                        raw_t = parts[1].replace(":", "")
                        if len(raw_t) >= 6:
                            trade_time = f"{raw_t[:2]}:{raw_t[2:4]}:{raw_t[4:6]}"
                        else:
                            trade_time = parts[1]
                    trade_datetime_iso = f"{trade_date}T{trade_time}" if trade_time else trade_date

                if not trade_date:
                    trade_date = date.today().isoformat()

                # PnL & Money calculations
                fx_rate = float(attrs.get("fxRateToBase") or attrs.get("fxRate") or 1.0)
                raw_currency = (attrs.get("currency") or attrs.get("tradeCurrency") or "EUR").upper()
                base_currency = (attrs.get("baseCurrency") or attrs.get("accountBaseCurrency") or "EUR").upper()

                raw_pnl = float(
                    attrs.get("fifoPnlRealized")
                    or attrs.get("realizedPNL")
                    or attrs.get("realizedPnl")
                    or attrs.get("fxPnl")
                    or attrs.get("pnl")
                    or attrs.get("fifoPnl")
                    or attrs.get("mtmPnl")
                    or 0.0
                )
                raw_comm = abs(
                    float(
                        attrs.get("ibCommission")
                        or attrs.get("commission")
                        or attrs.get("totalCommission")
                        or attrs.get("taxes")
                        or attrs.get("fee")
                        or attrs.get("commissionAmount")
                        or attrs.get("totalFee")
                        or 0.0
                    )
                )

                # Convert to base currency using fxRateToBase
                realized_pnl = round(raw_pnl * fx_rate, 4) if fx_rate > 0 else raw_pnl
                commission = round(raw_comm * fx_rate, 4) if fx_rate > 0 else raw_comm

                raw_sym = attrs.get("symbol") or attrs.get("underlyingSymbol") or attrs.get("contractDescription") or "UNKNOWN"
                desc = attrs.get("description") or attrs.get("contractDescription") or ""
                asset_category = (attrs.get("assetCategory") or attrs.get("secType") or "STK").upper()
                norm_symbol = normalize_symbol(raw_sym, desc, asset_category)
                if asset_category == "STK" and ("OPT" in norm_symbol or " " in raw_sym):
                    asset_category = "OPT"

                multiplier = float(attrs.get("multiplier") or attrs.get("contractMultiplier") or (100.0 if asset_category == "OPT" else 1.0))
                if multiplier <= 0:
                    multiplier = 100.0 if asset_category == "OPT" else 1.0

                quantity = float(
                    attrs.get("quantity")
                    or attrs.get("shares")
                    or attrs.get("size")
                    or attrs.get("filledQuantity")
                    or attrs.get("filledShares")
                    or attrs.get("volume")
                    or attrs.get("execQty")
                    or 0.0
                )
                
                trade_price = float(
                    attrs.get("tradePrice")
                    or attrs.get("price")
                    or attrs.get("orderPrice")
                    or attrs.get("avgPrice")
                    or attrs.get("tradePriceUSD")
                    or attrs.get("priceUSD")
                    or attrs.get("executionPrice")
                    or attrs.get("execPrice")
                    or 0.0
                )

                proceeds = float(
                    attrs.get("proceeds")
                    or attrs.get("netCash")
                    or attrs.get("netAmount")
                    or attrs.get("grossProceeds")
                    or 0.0
                )

                # Mathematical fallbacks if direct attributes are omitted in Trade Confirmation queries
                if trade_price == 0.0 and proceeds != 0.0 and quantity != 0.0:
                    trade_price = round(abs(proceeds) / (abs(quantity) * multiplier), 4)

                side_raw = (attrs.get("buySell") or attrs.get("side") or attrs.get("action") or ("BUY" if quantity > 0 else "SELL")).upper()
                buy_sell = "BUY" if ("BUY" in side_raw or "BOT" in side_raw) else ("SELL" if ("SELL" in side_raw or "SLD" in side_raw) else side_raw)

                if proceeds == 0.0 and quantity != 0.0 and trade_price > 0.0:
                    sign = -1.0 if buy_sell == "BUY" else 1.0
                    proceeds = round(sign * abs(quantity) * trade_price * multiplier, 4)

                trade_money = float(
                    attrs.get("tradeMoney")
                    or attrs.get("grossAmount")
                    or attrs.get("amount")
                    or attrs.get("value")
                    or (abs(quantity) * trade_price * multiplier)
                )

                trade_record = {
                    "ib_exec_id": exec_id,
                    "trade_id": attrs.get("tradeID") or exec_id,
                    "account_id": attrs.get("accountId") or attrs.get("clientAccountId") or "",
                    "symbol": norm_symbol,
                    "description": desc or norm_symbol,
                    "asset_category": asset_category,
                    "currency": raw_currency,
                    "raw_currency": raw_currency,
                    "base_currency": base_currency,
                    "buy_sell": buy_sell,
                    "quantity": quantity,
                    "trade_price": trade_price,
                    "trade_money": trade_money,
                    "proceeds": proceeds,
                    "fx_rate_to_base": fx_rate,
                    "raw_commission": raw_comm,
                    "raw_realized_pnl": raw_pnl,
                    "ib_commission": commission,
                    "realized_pnl": realized_pnl,
                    "trade_date": trade_date,
                    "trade_time": trade_time,
                    "trade_date_time": trade_datetime_iso,
                    "open_close_indicator": (attrs.get("openCloseIndicator") or attrs.get("code") or attrs.get("openClose") or "C").upper(),
                    "order_type": (attrs.get("orderType") or attrs.get("order_type") or "MKT").upper(),
                    "exchange": (attrs.get("exchange") or attrs.get("listingExchange") or attrs.get("execExchange") or "SMART").upper(),
                }
                trades.append(trade_record)

        logger.info(f"Parsed {len(trades)} trade executions from XML statement.")
        return trades

    def parse_cash_transactions_xml(self, xml_content: str) -> List[Dict[str, Any]]:
        """
        Parses XML statement extracting cash transactions (deposits, withdrawals, transfers, dividends).
        """
        txs: List[Dict[str, Any]] = []
        try:
            root = ET.fromstring(xml_content)
        except ET.ParseError as e:
            logger.error(f"Failed to parse IBKR XML for cash transactions: {e}")
            return []

        base_currency = "EUR"
        for node in root.iter("AccountInformation"):
            base_currency = (node.attrib.get("baseCurrency") or "EUR").upper()

        seen_tx_ids = set()
        for node in root.iter("CashTransaction"):
            attrs = node.attrib
            amount_raw = float(attrs.get("amount") or 0.0)
            if amount_raw == 0:
                continue

            tx_type_raw = (attrs.get("type") or "DEPOSIT").upper()
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
                elif "TAX" in tx_type_raw or "WITHHOLDING" in tx_type_raw or "TAX" in desc_upper or "RETENCI" in desc_upper or "IMPUESTO" in desc_upper:
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
            t_date = ""
            if date_raw:
                raw_clean = date_raw.replace(";", " ").replace(",", " ").split()[0].replace("-", "")
                if len(raw_clean) == 8:
                    t_date = f"{raw_clean[:4]}-{raw_clean[4:6]}-{raw_clean[6:]}"
                else:
                    t_date = date_raw.split()[0]
            if not t_date:
                t_date = date.today().isoformat()

            curr = (attrs.get("currency") or base_currency).upper()
            fx_rate = float(attrs.get("fxRateToBase") or 1.0)
            amount_base = round(amount_raw * fx_rate, 2)

            account_id = attrs.get("accountId") or ""
            tx_id = (
                attrs.get("transactionID")
                or attrs.get("id")
                or f"XML_CASH_{account_id}_{t_date}_{abs(amount_raw)}_{curr}"
            )

            if tx_id in seen_tx_ids:
                continue
            seen_tx_ids.add(tx_id)

            txs.append(
                {
                    "transaction_id": tx_id,
                    "account_id": account_id,
                    "transaction_date": t_date,
                    "type": tx_type,
                    "transaction_type": tx_type,
                    "amount": amount_base,
                    "raw_amount": amount_raw,
                    "currency": curr,
                    "raw_currency": curr,
                    "amount_in_base": amount_base,
                    "base_currency": base_currency,
                    "fx_rate_to_base": fx_rate,
                    "description": desc,
                    "is_manual": False,
                }
            )

        if txs:
            logger.info(f"Parsed {len(txs)} cash transactions from XML statement.")
        return txs

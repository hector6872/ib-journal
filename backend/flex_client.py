import asyncio
import logging
import xml.etree.ElementTree as ET
from datetime import date
from typing import Any, Dict, List, Tuple
from urllib.parse import urlencode
from urllib.request import Request, urlopen


try:
    import httpx
except ImportError:
    httpx = None  # type: ignore[assignment]

from backend.config import IBKR_QUERY_ID, IBKR_TOKEN

logger = logging.getLogger("ib-journal.flex")

SEND_REQUEST_URL = "https://gdcdp.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest"
GET_STATEMENT_URL = "https://gdcdp.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement"

class IBKRFlexClient:
    def __init__(self, token: str = IBKR_TOKEN, query_id: str = IBKR_QUERY_ID):
        self.token = token
        self.query_id = query_id

    async def _http_get(self, url: str, params: Dict[str, str]) -> Tuple[int, str]:
        """Performs GET request via httpx or urllib."""
        query_string = urlencode(params)
        full_url = f"{url}?{query_string}"

        if httpx is not None:
            async with httpx.AsyncClient(timeout=30.0, headers={"User-Agent": "IB-Journal/1.0"}) as client:
                resp = await client.get(full_url)
                return resp.status_code, resp.text
        else:
            # Standard library urllib fallback
            req = Request(full_url, headers={"User-Agent": "IB-Journal/1.0"})
            loop = asyncio.get_event_loop()
            def sync_req():
                with urlopen(req, timeout=30) as r:
                    return r.status, r.read().decode('utf-8')
            return await loop.run_in_executor(None, sync_req)


    async def fetch_statement_xml(self) -> str:
        """
        Executes the two-step IBKR Flex Query Web Service protocol:
        1. SendRequest with Token & Query ID -> get ReferenceCode
        2. Poll GetStatement with ReferenceCode & Token -> get final XML statement
        """
        if not self.token or not self.query_id:
            raise ValueError("IBKR_TOKEN and IBKR_QUERY_ID must be set in .env file.")

        # Step 1: Send Request
        logger.info(f"Initiating IBKR Flex Query request for query ID: {self.query_id}")
        status_code, resp_text = await self._http_get(
            SEND_REQUEST_URL,
            {"t": self.token, "q": self.query_id, "v": "3"}
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
        logger.info(f"Received ReferenceCode: {ref_code}. Polling statement...")

        # Step 2: Poll for statement ready
        max_attempts = 15
        for attempt in range(1, max_attempts + 1):
            await asyncio.sleep(attempt * 1.5)  # Progressive backoff

            s_code, stmt_text = await self._http_get(
                GET_STATEMENT_URL,
                {"t": self.token, "q": ref_code, "v": "3"}
            )

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

        # Find all <Trade> or <Order> elements
        for trade_node in root.iter("Trade"):
            attrs = trade_node.attrib

            exec_id = (
                attrs.get("ibExecId") or
                attrs.get("transactionID") or
                attrs.get("tradeID")
            )
            if not exec_id:
                continue

            # Date formatting (IBKR usually provides dateTime="YYYYMMDD;HHMMSS" or dateTime="YYYY-MM-DD, HH:MM:SS")
            date_time_raw = attrs.get("dateTime") or attrs.get("tradeDate") or ""
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
            realized_pnl = float(attrs.get("fifoPnlRealized") or attrs.get("realizedPNL") or attrs.get("fxPnl") or 0.0)
            commission = abs(float(attrs.get("ibCommission") or attrs.get("taxes") or 0.0))
            quantity = float(attrs.get("quantity") or 0.0)
            trade_price = float(attrs.get("tradePrice") or 0.0)
            trade_money = float(attrs.get("tradeMoney") or (abs(quantity) * trade_price))
            proceeds = float(attrs.get("proceeds") or 0.0)

            trade_record = {
                "ib_exec_id": exec_id,
                "trade_id": attrs.get("tradeID") or exec_id,
                "account_id": attrs.get("accountId") or "",
                "symbol": (attrs.get("symbol") or "UNKNOWN").upper(),
                "description": attrs.get("description") or "",
                "asset_category": attrs.get("assetCategory") or "STK",
                "currency": attrs.get("currency") or "EUR",
                "buy_sell": (attrs.get("buySell") or "BUY").upper(),
                "quantity": quantity,
                "trade_price": trade_price,
                "trade_money": trade_money,
                "proceeds": proceeds,
                "ib_commission": commission,
                "realized_pnl": realized_pnl,
                "trade_date": trade_date,
                "trade_time": trade_time,
                "trade_date_time": trade_datetime_iso,
                "open_close_indicator": attrs.get("openCloseIndicator") or "C",
                "order_type": (attrs.get("orderType") or "MKT").upper(),
                "exchange": (attrs.get("exchange") or "SMART").upper(),
            }
            trades.append(trade_record)

        logger.info(f"Parsed {len(trades)} trade executions from XML statement.")
        return trades


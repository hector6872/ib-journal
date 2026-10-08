# 📥 Historical Import & Desynchronization Recovery Guide (IBKR)

This guide explains how to import your complete trade execution and cash transfer history from Interactive Brokers (IBKR) into your local SQLite database, configure automated synchronization, and recover from synchronization gaps after vacations or extended offline periods.

---

## 📌 Context & IBKR API Limitations

* **Flex Web Service API Window**: IBKR strictly limits automated API queries to a **maximum 365-day historical window**.
* **Recommended Multi-Tier Strategy**:
  1. **Daily Operations**: Configure an IBKR Flex Query covering the **last 7 calendar days** (`Last 7 Calendar Days`) for lightweight, efficient hourly syncs during market sessions.
  2. **Multi-Year History (Past Years)**: Download yearly activity statements from the IBKR Client Portal and import them using `scripts/import_trades.py` or the web drag & drop UI. Both trades and deposits/withdrawals will be ingested automatically.
  3. **Vacations / Extended Downtime (>7 days)**: The web UI will automatically display a warning badge (`⚠️ Desync (>7d)`), allowing you to drag & drop manual statements with zero risk of duplicate trades.

---

## 🚀 Method 1: Terminal CLI Importer (`scripts/import_trades.py`)

The `scripts/import_trades.py` tool is completely **idempotent** (using `INSERT ON CONFLICT(ib_exec_id) DO UPDATE` for trades and `INSERT ON CONFLICT(transaction_id) DO UPDATE` for cash movements). You can safely run it on the same files or overlapping date ranges multiple times without creating duplicate records.

### Supported File Formats:
* **IBKR Flex Query XML (`.xml`)**
* **IBKR Flex Query CSV (`.csv`)**
* **IBKR Activity Statement CSV (`.csv`)** (Standard account activity statements)
* **IBKR Trade Confirmation Reports (`.csv`)**

---

## 🌍 Multilingual & Multi-Currency Support

The importer is built with an automatic **3-tier detection engine** and universal format normalizer. It parses statements regardless of language, delimiter (`,`, `;`, `\t`), number format (US `1,234.56`, Continental European `1.234,56`, International/Russian/Nordic `1 234,56`, Swiss `1'234.56`, and accounting negatives `(120.50)`), or base currency (`EUR`, `USD`, `GBP`, `CHF`, `CAD`, `JPY`, etc.).

### Officially Supported Languages & Mappings:
| Language | Code | Trades Section | Symbol / Contract | Date / Time | Quantity | Price | Realized P&L | Cash Transfers |
|---|---|---|---|---|---|---|---|---|
| **English** | `EN` | `Trades` | `Symbol` | `Date/Time` | `Quantity` | `T. Price` | `Realized P/L` / `FIFO P/L` | `Deposits & Withdrawals` |
| **Spanish** | `ES` | `Operaciones` | `Símbolo` / `Contrato` | `Fecha/Hora` | `Cantidad` | `Precio op.` | `P/G Realizada` | `Depósitos y retiradas` |
| **German** | `DE` | `Transaktionen` / `Trades` | `Wertpapier` | `Datum/Uhrzeit` | `Anzahl` | `Kurs` / `Preis` | `Gewinn/Verlust` | `Ein- und Auszahlungen` |
| **French** | `FR` | `Opérations` | `Symbole` / `Valeur` | `Date/Heure` | `Quantité` | `Prix` / `Cours` | `P&L Réalisé` | `Dépôts et retraits` |
| **Italian** | `IT` | `Operazioni` | `Simbolo` | `Data/Ora` | `Quantità` | `Prezzo` | `P&L Realizzato` | `Depositi e prelievi` |
| **Portuguese**| `PT` | `Operações` | `Símbolo` | `Data/Hora` | `Quantidade` | `Preço` | `P&L Realizado` | `Depósitos e levantamentos`|
| **Dutch** | `NL` | `Transacties` | `Symbool` | `Datum/Tijd` | `Aantal` | `Koers` | `Gerealiseerd` | `Stortingen en opnames` |
| **Chinese** | `ZH` | `交易` / `成交` | `代码` / `代碼` | `日期/时间` | `数量` | `价格` | `已实现盈亏` | `出入金` |
| **Japanese** | `JA` | `取引` / `約定` | `シンボル` / `銘柄` | `日時` | `数量` | `価格` | `実現損益` | `入出金` |
| **Russian** | `RU` | `Сделки` / `Операции`| `Символ` | `Дата/Время` | `Количество` | `Цена` | `Прибыль` | `Депозиты и снятия` |

> 💡 **3-Tier Heuristic Engine**: If a statement comes in any other language (e.g. Polish, Swedish, Turkish), the parser automatically inspects the column structure. If it identifies the combination of *Symbol + Datetime + Quantity + Price + Realized P&L*, it will ingest the trades regardless of the section label.

---

## 🛠️ Troubleshooting: What to Do if an Import Fails

If you ever encounter an issue or an unsupported custom report format:

### Option A: Switch IBKR Portal Language to English (Universal Standard)
IBKR allows generating all statements in standard English regardless of your country or bank origin:
1. Log into your **[IBKR Client Portal](https://www.interactivebrokers.com/)**.
2. Click on the **User Profile Icon** (top right) $\rightarrow$ **Settings** (or *Configuración del usuario* / *Ajustes de cuenta*).
3. Under **User Settings** $\rightarrow$ **Language**, select **English**.
4. Navigate to **Performance & Reports** $\rightarrow$ **Statements** $\rightarrow$ **Activity**.
5. Select the desired period and click **Download CSV**.
6. Import the new English CSV into the journal.

### Option B: Use IBKR Flex Query (XML)
XML Flex queries are standardized globally by Interactive Brokers and bypass all localized string differences. See [Method 2: Flex Query Setup](#-ibkr-automated-synchronization-flex-query-setup).

---

### Usage Examples:

#### 1. Import a Single File:
```bash
python3 scripts/import_trades.py ~/Downloads/U1234567_2022.csv
```

#### 2. Import Multiple Files at Once:
```bash
python3 scripts/import_trades.py ~/Downloads/2021.csv ~/Downloads/2022.csv ~/Downloads/2023.xml
```

#### 3. Import an Entire Directory of Statements:
```bash
python3 scripts/import_trades.py ~/Downloads/ibkr_history/
```

#### 4. Dry-Run Simulation (No Disk Writes):
```bash
python3 scripts/import_trades.py --dry-run ~/Downloads/2022.csv
```

#### 5. Verbose Output Mode:
```bash
python3 scripts/import_trades.py -v ~/Downloads/2022.csv
```

---

## 🌐 Method 2: Browser Drag & Drop Import

1. Open the journal in your browser (`http://localhost:8000` or `http://raspberrypi.local:8000`).
2. In the top right navigation bar (next to the sync button), click the **Import** 📥 button or the `⚠️ Desync` alert badge.
3. Drag & drop your `.csv` or `.xml` statement files into the dropzone (or click **Select Files**).
4. The trades and cash transfers will be processed and imported immediately, automatically updating calendar grids, metrics, account equity (NAV), and analytics charts in real time.

---

## ⚙️ How to Download Historical Statements from IBKR

To download previous years' activity statements:

1. Log into your **[IBKR Client Portal](https://www.interactivebrokers.com/)**.
2. Navigate to **Performance & Reports** > **Statements**.
3. Under the **Activity** section:
   - **Period**: Select `Annual` or `Custom Date Range`.
   - **Date / Year**: Choose the target year (e.g., 2021, 2022, 2023, 2024, 2025).
   - **Format**: Select `CSV` or `XML`.
4. Click **Download**.
5. Import all downloaded files with a single command:
   ```bash
   python3 scripts/import_trades.py ~/Downloads/U*.csv
   ```

---

## 💰 Capital & Cash Management Integration

When you import an IBKR Activity Statement or Flex Query:
* **Deposits, Withdrawals & Dividends** in the statement (`Deposits & Withdrawals` section) are automatically parsed and saved to your SQLite database.
* **Account Expenses & Broker Fees**: Market data subscriptions (e.g. OPRA), broker fees, and withholding taxes are automatically classified and summarized in the dedicated Account Expenses panel.
* **Protected Records**: Manually entered cash records can be deleted or edited at any time, while broker-synchronized cash records are safeguarded against accidental deletion.
* **Account Equity (NAV)** is dynamically calculated as:
  `Account Equity = Starting Capital + Net Cash Flow + Realized P&L`
* **Return on Capital (% ROI)** is calculated against your cumulative capital base:
  `ROI % = (Net Realized P&L / (Starting Capital + Total Deposits)) * 100`
* You can configure your **Starting Capital** or add manual adjustments any time via the **Capital & Cash Management** modal.

---

---

## 🔄 IBKR Automated Synchronization (Dual-Sync Architecture)

### 💡 Why Dual-Sync? (Architectural Motivation & Rationale)

In Interactive Brokers, there is a fundamental reporting distinction between **Trade Confirmations** and **Activity Statements**:

1. **The Intraday Dilemma (`Trade Confirmation Flex Query`)**:
   - **Advantage**: Trade Confirmations report executions in near real-time (within 5–15 minutes of order fill) and include same-day trades (`Today`).
   - **Limitation**: Trade Confirmations **do not include cash transactions** (deposits, withdrawals, dividends, interest) or end-of-day account equity reconciliations.

2. **The End-of-Day Dilemma (`Activity Flex Query`)**:
   - **Advantage**: Activity Statements are comprehensive and official. They include all settled trades, final FIFO P&L, fees, taxes, and every deposit/withdrawal.
   - **Limitation**: IBKR only generates Activity Statements **after the daily overnight settlement batch** (between 01:00 and 05:30 UTC). During the active trading day, their `toDate` is strictly yesterday's close; today's open/intraday trades are not included until overnight.

3. **The Dual-Sync Solution**:
   By uniting both queries into a coordinated multi-tier automated pipeline:
   - **Tier 1 — Intraday Session (Every 15 min during market hours)**: Runs the **Trade Confirmation Flex Query** (`IBKR_TRADE_QUERY_ID`) to capture today's live fills, orders, and execution prices as you trade.
   - **Tier 2 — Daily Overnight Consolidation (06:00 UTC daily)**: Runs the **Activity Flex Query** (`IBKR_ACTIVITY_QUERY_ID`) once all global markets are closed and IBKR's overnight batch is complete. This reconciles final official P&L, updates commission precision, and automatically imports bank deposits/withdrawals to keep your Portfolio Equity (NAV) and % ROI completely up-to-date without any manual file uploads.
   - **Tier 3 — Unified Manual Sync (*Sync Now* button)**: Seamlessly polls both queries, merging trades and cash movements in a single step with a 5-minute safety cooldown.
   - **Zero Duplicates (Idempotency)**: Both queries merge into SQLite using `ON CONFLICT (ib_exec_id) DO UPDATE` for trades and `ON CONFLICT (transaction_id) DO UPDATE` for cash movements.

---

### Step 1: Generate your Flex Web Service Token (`IBKR_TOKEN`)

1. Log into your **[IBKR Client Portal](https://www.interactivebrokers.com/)**.
2. Navigate to **Performance & Reports** > **Flex Queries** (or **Reports** > **Flex Queries**).
3. On the right side, find the **Flex Web Service Status** panel and click the **Gear (⚙️) icon** / **Configure**.
4. Check the box **Enable Flex Web Service**.
5. Set token expiration (e.g., 1 year / maximum available) and click **Generate Token** / **Save**.
6. Copy the generated token into your `.env`:
   ```ini
   IBKR_TOKEN=123456789012345678901234
   ```

---

### Step 2: Create the Primary Activity Flex Query (`IBKR_ACTIVITY_QUERY_ID`) — Essential / Core Foundation

> ⭐️ **Essential**: This is the primary query required for the journal. It syncs all official settled trades, realized P&L, commissions, and automatically imports bank deposits and withdrawals.

1. In the **Flex Queries** page, locate **Activity Flex Query** and click the **+ (Add / Create)** icon.
2. Settings:
   - **Query Name**: `Trading Journal Daily Activity`
   - **Date Period**: `Last 7 Calendar Days` (or `Last 365 Calendar Days` for initial setup).
   - **Format**: `XML`.
   - **Sections**:
     - **Trades**: Select **Execution**, **Order**, and check **Select All** on columns (includes `FIFO P/L Realized`, commissions, etc.).
     - **Cash Transactions**: Select **Deposits & Withdrawals** and check **Select All** on columns.
3. Save the query and copy the numeric Query ID to `.env`:
   ```ini
   IBKR_ACTIVITY_QUERY_ID=789012
   ```

---

### Step 3: (Optional) Create the Trade Confirmation Query (`IBKR_TRADE_QUERY_ID`) — Intraday Real-Time Companion

> ⚡ **Optional Intraday Companion**: Add this if you want today's live trade fills to appear immediately in your journal every 15 minutes during market hours, without waiting for the daily overnight settlement.

1. In the **Flex Queries** page, scroll down to **Trade Confirmation Flex Query** and click **+**.
2. Settings:
   - **Query Name**: `Trading Journal Intraday`
   - **Date Period**: `Last 7 Calendar Days` (or `Today`).
   - **Format**: `XML`.
   - **Sections**: Select **Executions** / **Orders** and click **Select All** on columns.
3. Save the query and copy the Query ID to `.env`:
   ```ini
   IBKR_TRADE_QUERY_ID=123456
   ```

---

* **Why don't trades I just placed appear immediately? (Intraday Delay)**:
  IBKR Flex Web Service is a batch-based reporting engine, not a live tick-by-tick websocket feed. Interactive Brokers consolidates and updates executions in their Flex reporting database periodically throughout the trading session (typically with a **10 to 30 minute delay** after order execution). Once IBKR flushes the batch, the next sync (or clicking *Sync Now*) will ingest them automatically.
* **Where is Realized P&L in the Trades modal?**
  In the IBKR Trades modal, Realized P&L is listed further down the column list as **`FIFO P/L Realized`** (or `Realized P/L`). The easiest and safest way is to simply check the **`Select All`** checkbox at the top of the column list, ensuring all execution, price, commission, and P&L fields are exported.
* **Token Activation Delay**:
  IBKR's API gateways take **5 to 15 minutes** to propagate a newly generated token. If your first sync attempt fails with an authentication error, wait a few minutes and try again.
* **XML vs CSV for Flex Query**:
  Always choose **`XML`** for the Flex Query configuration. The automated background sync parser (`backend/flex_client.py`) expects XML responses from IBKR. For manual file drag-and-drop, both CSV and XML are supported.

---

## 🏖️ Handling Vacations & Extended Downtime (>7 Days)

If your journal has been turned off or disconnected for **more than 7 days**:

1. **UI Desync Indicator**: An amber `⚠️ Desync (Xd)` badge will automatically appear in the top header.
2. **Download Statement for the Missing Range**:
   - In the IBKR Client Portal, download an Activity Statement (CSV or XML) for the date range you were away.
3. **Import Statement**:
   - Drag & drop the file into the web UI import modal, or run `python3 scripts/import_trades.py statement.csv`.
4. The database will update all missing trades and cash movements, recompute performance analytics, and clear the desync alert automatically.

---

[← Back to README](README.md)

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
* **Deposits and Withdrawals** in the statement (`Deposits & Withdrawals` section) are automatically parsed and saved to your SQLite database.
* **Account Equity (NAV)** is dynamically calculated as:
  $$\text{Account Equity} = \text{Starting Capital} + \text{Net Cash Flow} + \text{Realized P\&L}$$
* **Return on Capital (% ROI)** is calculated against your cumulative capital base:
  $$\text{ROI \%} = \frac{\text{Net Realized P\&L}}{\text{Starting Capital} + \text{Total Deposits}} \times 100$$
* You can configure your **Starting Capital** or add manual adjustments any time via the **Capital & Cash Management** modal.

---

## 🔄 IBKR Automated Synchronization (Flex Query Setup)

Automated synchronization requires **two values** in your `.env` file:
1. `IBKR_TOKEN`: Your private Flex Web Service authentication token.
2. `IBKR_QUERY_ID`: The unique numeric ID of your Activity Flex Query.

---

### Step 1: Generate your Flex Web Service Token (`IBKR_TOKEN`)

1. Log into your **[IBKR Client Portal](https://www.interactivebrokers.com/)**.
2. Navigate to **Performance & Reports** > **Flex Queries** (or **Reports** > **Flex Queries** depending on your portal language/layout).
3. On the right side, find the **Flex Web Service Status** panel and click the **Gear (⚙️) icon** / **Configure**.
4. Check the box **Enable Flex Web Service**.
5. Set token expiration (e.g., 1 year / maximum available) and click **Generate Token** / **Save**.
6. Copy the generated alphanumeric token string and paste it into your `.env`:
   ```ini
   IBKR_TOKEN=123456789012345678901234
   ```

---

### Step 2: Create the Activity Flex Query (`IBKR_QUERY_ID`)

1. On the **Flex Queries** page, locate the **Activity Flex Query** section and click the **+ (Create / Add)** icon.
2. Configure the general query parameters:
   - **Query Name**: `Trading Journal Sync`
   - **Date Period**: Choose `Last 7 Calendar Days` (recommended for lightweight hourly background polling) or `Last 365 Calendar Days` (for initial sync).
   - **Format**: Select **`XML`**.
   - **Accounts**: Ensure your trading account is selected.
3. In the **Sections** configuration list:
   - Click on **Trades**:
     - **Top Options (Boxes)**: Ensure **`Execution`** and **`Order`** are selected (blue checkmark). You can optionally select **`Closed Lots`** as well.
     - **Columns (Checkboxes)**: Check the **`Select All`** checkbox at the top of the column list (above *Account ID*). This automatically includes all necessary fields: `FIFO P/L Realized` (P&L), `IB Commission`, `Trade Price`, `FX Rate To Base`, `Date/Time`, `Symbol`, etc., without needing to find each field manually.
     - Click **Save** at the bottom of the modal.
   - *(Recommended)* Click on **Cash Transactions**:
     - Check the **`Select All`** checkbox (or enable *Deposits & Withdrawals*) to automatically sync deposits and withdrawals.
     - Click **Save** at the bottom of the modal.
4. In the **General Configuration** section (optional settings):
   - You can leave all settings with their **default values**:
     - **Date Format**: `yyyyMMdd`
     - **Time Format**: `HHmmss`
     - **Date/Time Separator**: `; (semi-colon)`
     - **Profit and Loss**: `Default` (or `FIFO`)
     - **Include Currency Rates?**: `No` *(No es necesario activarlo, ya que cada operación ya incluye su tipo de cambio individual en `fxRateToBase`)*.
     - **Include Offsetting Trade/Cancel Pairs?**: `No`
     - **Breakout by Day?**: `No`
5. Scroll down to the bottom of the main query creation page and click **Save Changes** / **Continue** / **Create**.
6. You will return to the Flex Queries list. Look for your newly created query and locate the numeric **Query ID** column (e.g., `987654`).
7. Copy this numeric ID into your `.env`:
   ```ini
   IBKR_QUERY_ID=987654
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

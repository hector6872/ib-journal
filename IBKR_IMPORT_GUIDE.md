# 📥 Historical Import & Desynchronization Recovery Guide (IBKR)

This guide explains how to import your complete trade execution history (more than 365 days) from Interactive Brokers (IBKR) into your local SQLite database, configure automated weekly synchronization, and recover from synchronization gaps after vacations or extended offline periods.

---

## 📌 Context & IBKR API Limitations

* **Flex Web Service API Window**: IBKR strictly limits automated API queries to a **maximum 365-day historical window**.
* **Recommended Multi-Tier Strategy**:
  1. **Daily Operations**: Configure an IBKR Flex Query covering the **last 7 calendar days** (`Last 7 Calendar Days`) for lightweight, efficient hourly syncs during market sessions.
  2. **Multi-Year History (Past Years)**: Download yearly activity statements from the IBKR Client Portal and import them using `scripts/import_trades.py` or the web drag & drop UI.
  3. **Vacations / Extended Downtime (>7 days)**: The web UI will automatically display a warning badge (`⚠️ Desync (>7d)`), allowing you to drag & drop manual statements with zero risk of duplicate trades.

---

## 🚀 Method 1: Terminal CLI Importer (`scripts/import_trades.py`)

The `scripts/import_trades.py` tool is completely **idempotent** (using `INSERT ON CONFLICT(ib_exec_id) DO UPDATE`). You can safely run it on the same files or overlapping date ranges multiple times without creating duplicate records.

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
4. The trades will be processed and imported immediately, automatically updating calendar grids, metrics, and analytics charts in real time.

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

## 🔄 Daily Flex Query Setup (7 Days)

To keep your journal running optimally without overloading the IBKR API or your Raspberry Pi storage:

1. In the IBKR Client Portal, go to **Performance & Reports** > **Flex Queries**.
2. Edit or create your **Trades** Flex Query (`IBKR_QUERY_ID` in `.env`):
   - **Date Period**: `Last 7 Calendar Days`.
   - **Format**: `XML`.
   - **Sections**: Select `Trades` (include Executions, Orders, and Realized P&L).
3. Save your query.

The server will automatically poll this query during active market sessions (07:00 to 21:15 UTC, Monday through Friday).

---

## 🏖️ Handling Vacations & Extended Downtime (>7 Days)

If your journal has been turned off or disconnected for **more than 7 days**:

1. **UI Desync Indicator**: An amber `⚠️ Desync (Xd)` badge will automatically appear in the top header.
2. **Download Statement for the Missing Range**:
   - In the IBKR Client Portal, download an Activity Statement (CSV or XML) for the date range you were away.
3. **Import Statement**:
   - Drag & drop the file into the web UI import modal, or run `python3 scripts/import_trades.py statement.csv`.
4. The database will update all missing trades, recompute performance analytics, and clear the desync alert automatically.

---

[← Back to README](README.md)

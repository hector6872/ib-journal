# 📓 IBKR Trading Journal

[![CI](https://github.com/hector6872/ib-journal/actions/workflows/ci.yml/badge.svg)](https://github.com/hector6872/ib-journal/actions/workflows/ci.yml)
[![Sync Repository to GitLab](https://github.com/hector6872/ib-journal/actions/workflows/sync-to-gitlab.yml/badge.svg)](https://github.com/hector6872/ib-journal/actions/workflows/sync-to-gitlab.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Code style: ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)

An ultra-lightweight, self-hosted **Interactive Brokers (IBKR) Trading Journal & Analytics Suite** designed to run 24/7 on a **Raspberry Pi** or any Linux/macOS/Windows server.

---

## ✨ Key Features

- **⚡ Pure Vanilla Web Stack**: 100% pure HTML5, modern CSS, and vanilla ES6+ JavaScript. No React, no Node.js, no npm dependencies, no build step.
- **🛡️ MicroSD Safe & Flash Protected**: Configured with SQLite Write-Ahead Logging (`WAL`), in-memory temporary tables (`temp_store=MEMORY`), and minimal disk I/O to protect your Raspberry Pi storage.
- **🔄 Smart Market-Hours Synchronization**: Automatically ingests trade executions and realized P&L via IBKR Flex Query Web Service during market sessions, skipping redundant queries at night and on weekends.
- **⏱️ Rate-Limit Guard**: Enforced cooldown protection on the manual *"Sync Now"* button with live UI countdown timers to protect your IBKR API rate limits.
- **📅 Multi-Calendar Views**: 
  - **Year Matrix**: 12-month calendar heatmap with monthly totals and year-end summary ribbon.
  - **Month Calendar**: Traditional monthly grid with daily P&L badges and trade counters.
  - **Week Breakdown**: 7-day cards view (Monday–Sunday) with volume and executions.
- **📊 In-Depth Trading Analytics**:
  - Executive KPIs (Win Rate `WR%`, Profit Factor `PF`, Expectancy, Net Realized P&L, Total Trades, Commissions).
  - Risk & Drawdown analysis (Max Drawdown, Current Drawdown, Winning/Losing Streaks).
  - Rolling Win Rate with time filters (1W, 1M, 3M, YTD, ALL).
  - Equity Curve & Metric Evolution charts (Daily, Weekly, Monthly aggregations).
  - Detailed breakdowns by Symbol, Tag/Setup, Day of Week, Time of Day, Holding Duration, and Order Type.
- **📥 Historical Multi-Year Import**: Drag & drop IBKR Activity Statements (CSV / XML) directly in the browser or import bulk files via CLI with zero duplicate risk (`INSERT ON CONFLICT`).
- **🌐 Centralized Copy & Translations (`strings.js`)**: Edit any title, label, metric name, or translation in a single dedicated dictionary file.
- **🌓 Light / Dark / System Themes**: Instant theme toggling with smooth transitions and persistent user preferences.

---

## 📸 Layout & Interface

- **Executive KPI Bar**: Real-time Net Realized P&L, Win Rate %, Profit Factor, Expectancy, and Trade counts.
- **Calendar Tab**: Week, Month, and Year calendar views with instant execution breakdown modals on any trading day.
- **Statistics Tab**: Interactive equity curves, drawdown charts, rolling metrics, and breakdown tables.
- **Day Execution Modal**: Detailed view of all trades (Time, Symbol, Side, Volume, Price, Commission, Realized P&L).
- **Import Modal & Desync Alert**: Automatic notification if you have been offline for >7 days, allowing instant drag & drop statement ingestion.

---

## ⚡ Quick Start (Raspberry Pi & Linux)

### 1. Prerequisites
Ensure Python 3.10+ and standard tools are installed:
```bash
# Debian / Ubuntu / Raspberry Pi OS
sudo apt update
sudo apt install -y python3 python3-venv python3-pip git
```

### 2. Clone & Run Setup
```bash
git clone https://github.com/hector6872/ib-journal.git
cd ib-journal
./setup.sh
```

### 3. Configure Credentials (`.env`)
Edit your `.env` file with your IBKR Flex Query token:
```bash
nano .env
```
```ini
IBKR_TOKEN=your_ibkr_flex_token_here
IBKR_QUERY_ID=your_flex_query_id_here
PORT=8000
HOST=0.0.0.0
CURRENCY_SYMBOL=€
ENVIRONMENT=prod
DEBUG=false
```

### 4. Run Development Server
Run the all-in-one launcher with auto-reload:
```bash
./dev.sh
```
The web journal is now live at `http://localhost:8000` (or `http://raspberrypi.local:8000`).

---

## ⚙️ Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `IBKR_TOKEN` | *None* | Interactive Brokers Flex Web Service Token. |
| `IBKR_QUERY_ID` | *None* | Flex Query ID configured in IBKR Client Portal. |
| `PORT` | `8000` | HTTP port the server listens on. |
| `HOST` | `0.0.0.0` | Bind host address (`0.0.0.0` allows LAN access). |
| `CURRENCY_SYMBOL` | `€` | Display currency symbol (`$`, `€`, `£`, `¥`, etc.). |
| `SYNC_INTERVAL_MINUTES` | `60` | Background automatic sync frequency in minutes. |
| `SYNC_COOLDOWN_SECONDS` | `600` | Cooldown period between manual sync requests (seconds). |
| `DB_PATH` | `data/journal.db` | Relative or absolute path to the SQLite database file. |
| `ENVIRONMENT` | `prod` | Runtime environment (`prod` enables scheduler, `dev` disables it). |
| `DEBUG` | `false` | Enable debug logging mode. |

---

## 🔄 IBKR Flex Query Configuration Guide

To enable automated trade ingestion from Interactive Brokers:

1. Log into your **[IBKR Client Portal](https://www.interactivebrokers.com/)**.
2. Navigate to **Performance & Reports** > **Flex Queries**.
3. Under **Flex Web Service Status**, click the gear icon to **Enable Flex Web Service** and generate your **Flex Token** (copy this to `IBKR_TOKEN` in `.env`).
4. Under **Trade Confirmation Flex Query** or **Activity Flex Query**, click **+ (Create New)**:
   - **Query Name**: `Trading Journal Sync`
   - **Date Period**: *Last 7 Calendar Days* (for regular sync) or *Last 365 Calendar Days* (for initial backfill).
   - **Format**: `XML`
   - **Sections**: Select **Trades** (ensure *Executions / Closed Lots* and *Realized P&L* are enabled).
   - Save the query and copy the generated **Query ID** to `IBKR_QUERY_ID` in `.env`.

> 💡 **Note**: You only need the **Trades** section enabled. Cash transactions (deposits/withdrawals) are not required.

---

## 📥 Historical Multi-Year Import & Vacation Desync

IBKR's Flex Query API has a **365-day maximum window**. For importing older historical years or recovering gaps after being offline (>7 days):

### 1. Browser UI Drag & Drop
Click the **Import** 📥 button in the top navigation bar (or the `⚠️ Desync` alert banner) to drag and drop your CSV/XML statement files directly into the browser.

### 2. CLI Multi-File Importer (`scripts/import_trades.py`)
Import any number of IBKR Activity Statement CSVs, Flex XMLs, or trade reports safely (idempotent, zero duplicate risk):
```bash
# Import single file or multiple years
python3 scripts/import_trades.py ~/Downloads/2021.csv ~/Downloads/2022.csv ~/Downloads/2023.xml

# Import an entire directory of statements
python3 scripts/import_trades.py ~/Downloads/ibkr_statements/

# Dry run simulation (no database writes)
python3 scripts/import_trades.py --dry-run ~/Downloads/2023.csv
```

> 📖 **Read the full step-by-step import guide**: [IBKR_IMPORT_GUIDE.md](IBKR_IMPORT_GUIDE.md)

---

## 🛡️ MicroSD Protection & Optimization

Raspberry Pi SD cards degrade primarily from continuous write churn. This project implements multiple safeguards:

1. **SQLite WAL Mode (`journal_mode = WAL`)**: Eliminates atomic rollback file creation and journal thrashing.
2. **`synchronous = NORMAL`**: Drastically reduces file flush calls while maintaining database integrity.
3. **In-Memory Temporary Cache (`temp_store = MEMORY`)**: Temporary query tables and sort operations live strictly in RAM.
4. **RAM Logging**: Application stdout logs are handled directly by systemd's in-memory journal.

### Optional: Install `log2ram` (Recommended for Raspberry Pi)
To completely prevent system log writes from touching your SD card:
```bash
sudo apt install -y rsync
curl -L https://github.com/azlux/log2ram/archive/master.tar.gz | tar zx
cd log2ram-master
sudo ./install.sh
sudo reboot
```

---

## 🚀 Running as a Background Systemd Service

To keep the journal running automatically when your Raspberry Pi or Linux server boots:

1. Copy the systemd service file:
   ```bash
   sudo cp ib-journal.service /etc/systemd/system/
   ```
2. (Optional) If your username or folder path differs from `/home/pi/ib-journal`, edit the path in `/etc/systemd/system/ib-journal.service`.
3. Enable and start the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now ib-journal
   ```
4. Check status or live logs:
   ```bash
   sudo systemctl status ib-journal
   journalctl -u ib-journal -f
   ```

---

## 🎨 Customizing Text & UI Copy (`strings.js`)

All UI text, labels, tab titles, days of the week, months, and messages are centralized in:
👉 **[`frontend/js/strings.js`](frontend/js/strings.js)**

To change any wording or translate the interface into another language, simply edit the values in `STRINGS`. No build or compilation step is needed—just refresh your browser!

---

## 📡 REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/config` | `GET` | Frontend runtime configuration (currency symbol, IBKR setup status). |
| `/api/settings` | `GET` / `POST` | User settings persisted in SQLite for cross-device synchronization. |
| `/api/stats/overview` | `GET` | Global KPIs: Win Rate %, Profit Factor, Expectancy, Total Trades, Net Realized P&L. |
| `/api/stats/detailed` | `GET` | Comprehensive trading analytics (drawdowns, rolling win rates, metric evolution, breakdowns). |
| `/api/calendar/year?year=2026` | `GET` | 12-month calendar matrix and monthly summary array. |
| `/api/calendar/month?year=2026&month=10` | `GET` | Monthly calendar grid data with daily P&L and trade counts. |
| `/api/calendar/week?date=2026-10-01` | `GET` | 7-day card data with individual execution breakdown. |
| `/api/trades/day?date=2026-10-01` | `GET` | Detailed trade executions for a specific date. |
| `/api/trades/import` | `POST` | Upload and import historical CSV / XML / JSON statement payloads. |
| `/api/sync/status` | `GET` | Real-time sync status (last sync, next sync countdown, rate-limit cooldown). |
| `/api/sync/trigger` | `POST` | Manually triggers IBKR Flex Query synchronization. |

---

## 🧪 Development & Testing

### Running Tests
```bash
# Run pytest test suite
pytest -v

# Or use Python's built-in test runner
python -m unittest discover tests
```

### Running Code Quality Checks
```bash
# Code style and linting
ruff check backend/ scripts/ tests/

# Type checking
mypy backend scripts tests

# Frontend JavaScript syntax validation
for f in frontend/js/*.js; do node --check "$f"; done
```

---

## 🤝 Contributing

Contributions are welcome! Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** for details on our code of conduct, development guidelines, and pull request process.

---

## 📄 License

This project is licensed under the MIT License - see the **[LICENSE.md](LICENSE.md)** file for details.

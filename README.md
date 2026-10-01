# 🐢 IBKR Trading Journal

An ultra-lightweight, self-hosted **Interactive Brokers (IBKR) Trading Journal** designed to run 24/7 on a **Raspberry Pi**.

- **Pure Vanilla Web Stack**: 100% pure HTML5, modern CSS, and vanilla ES6+ JavaScript. No React, no Node.js, no npm dependencies, no build step.
- **MicroSD Safe & Flash Protected**: Configured with SQLite Write-Ahead Logging (`WAL`), RAM caching (`temp_store=MEMORY`), and minimal disk I/O to protect your Raspberry Pi storage.
- **Smart Market-Hours Synchronization**: Automatically ingests trade executions and realized P&L via IBKR Flex Query Web Service during market sessions, skipping redundant queries at night and on weekends.
- **Rate-Limit Guard**: Enforced cooldown protection on the manual *"Sync Now"* button with live UI countdowns.
- **Centralized Text (`strings.js`)**: Edit any title, label, metric name, or translation in a single dedicated dictionary file.
- **Multi-Calendar Views**: Year matrix (12 months + totals ribbon), Month calendar grid, and Week cards view with instant trade execution breakdown modals.

---

## 📸 Screenshots & Layout

- **Top Bar**: Live Trading KPIs (Win Rate `WR%`, Total Operations, Profit Factor `PF`, Expectancy, Net Realized P&L) and Sync countdown status.
- **Year View**: 12-month calendar heatmap with monthly totals and year-end summary ribbon.
- **Month View**: Traditional monthly calendar with daily P&L badges and trade counters.
- **Week View**: 7-day cards breakdown (Monday–Sunday) with trade volume.
- **Day Execution Modal**: Detailed view of all trades (Symbol, Buy/Sell, Volume, Price, Commission, Realized P&L).

---

## ⚡ Quick Start (Raspberry Pi & Linux)

### 1. Prerequisites
Ensure Python 3.10+ and virtual environment packages are installed on your Raspberry Pi:
```bash
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
MARKET_TIMEZONE=Europe/Madrid
CURRENCY_SYMBOL=€
```

### 4. Run Development Server
Run the all-in-one development launcher with auto-reload:
```bash
./dev.sh
```
This automatically starts the backend API and serves the Vanilla web application at `http://localhost:8000` (or `http://raspberrypi.local:8000`).

---

## 🔄 IBKR Flex Query Configuration Guide

To enable automated trade ingestion from Interactive Brokers:

1. Log into your **[IBKR Client Portal](https://www.interactivebrokers.com/)**.
2. Navigate to **Performance & Reports** > **Flex Queries**.
3. Under **Flex Web Service Status**, click the gear icon to **Enable Flex Web Service** and generate your **Flex Token** (copy this to `IBKR_TOKEN` in `.env`).
4. Under **Trade Confirmation Flex Query** or **Activity Flex Query**, click **+ (Create New)**:
   - **Query Name**: `Trading Journal Sync`
   - **Date Period**: *Last 365 Calendar Days* (for initial backfill) or *Last N Days*.
   - **Format**: `XML`
   - **Sections**: Select **Trades** (ensure *Executions / Closed Lots* and *Realized P&L* are enabled).
   - Save the query and copy the generated **Query ID** to `IBKR_QUERY_ID` in `.env`.

> 💡 **Note**: You only need the **Trades** section enabled. Cash transactions (deposits/withdrawals) are not required.

---

## 🛡️ MicroSD Protection & Optimization

Raspberry Pi SD cards degrade primarily from continuous write churn. This project implements multiple safeguards:

1. **SQLite WAL Mode (`journal_mode = WAL`)**: Eliminates atomic rollback file creation and journal thrashing.
2. **`synchronous = NORMAL`**: Drastically reduces file flush calls while maintaining database integrity.
3. **In-Memory Temporary Cache (`temp_store = MEMORY`)**: Temporary query tables and sort operations live strictly in RAM.
4. **RAM Logging**: Application stdout logs are handled directly by systemd's memory journal.

### Optional: Install `log2ram` (Recommended for Pi)
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

To keep the journal running automatically when your Raspberry Pi boots:

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
4. Check status or logs:
   ```bash
   sudo systemctl status ib-journal
   journalctl -u ib-journal -f
   ```

---

## 🎨 Customizing Text & UI Copy (`strings.js`)

All UI text, labels, tab titles, days of the week, months, and messages are defined in a single file:
👉 **[`frontend/js/strings.js`](file:///Users/hector.de.isidro/Developer/ib-journal/frontend/js/strings.js)**

To change any wording or translate the interface, simply edit the values in `STRINGS`. No build or compilation step is needed—just refresh your browser!

---

## 📡 REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/stats/overview` | `GET` | Global KPIs: Win Rate %, Profit Factor, Expectancy, Total Trades, Net P&L. |
| `/api/calendar/year?year=2026` | `GET` | 12-month calendar matrix and monthly summary array. |
| `/api/calendar/month?year=2026&month=10` | `GET` | Monthly calendar grid data with daily P&L and trade counts. |
| `/api/calendar/week?date=2026-10-01` | `GET` | 7-day card data with individual execution lists. |
| `/api/trades/day?date=2026-10-01` | `GET` | Detailed trade executions for a specific day. |
| `/api/sync/status` | `GET` | Real-time status (last sync, next sync countdown, rate-limit cooldown). |
| `/api/sync/trigger` | `POST` | Manually triggers IBKR Flex Query synchronization. |

---

## 📄 License
MIT License. Built for performance and reliability.

# Contributing to IBKR Trading Journal 📓

Thank you for your interest in contributing to **IBKR Trading Journal**! We welcome contributions, bug fixes, feature proposals, and documentation improvements.

---

## 📋 Table of Contents

1. [Code of Conduct](#-code-of-conduct)
2. [Getting Started & Development Setup](#-getting-started--development-setup)
3. [Project Architecture](#-project-architecture)
4. [Development Guidelines](#-development-guidelines)
   - [Backend (Python / FastAPI)](#backend-python--fastapi)
   - [Frontend (Vanilla ES6+ JS & Modern CSS)](#frontend-vanilla-es6-js--modern-css)
   - [Database & Storage](#database--storage)
5. [Running Tests & Quality Checks](#-running-tests--quality-checks)
6. [Submitting Changes (Pull Requests)](#-submitting-changes-pull-requests)
7. [Reporting Issues](#-reporting-issues)

---

## 📜 Code of Conduct

Please be respectful, constructive, and collaborative in all issues, pull requests, and discussions.

---

## 🛠️ Getting Started & Development Setup

### 1. Fork & Clone the Repository
```bash
git clone https://github.com/hector6872/ib-journal.git
cd ib-journal
```

### 2. Set Up Virtual Environment & Dependencies
Ensure you have **Python 3.10+** installed:
```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies including development tools
pip install --upgrade pip
pip install -e ".[all]"
```

### 3. Configure Environment (`.env`)
```bash
cp .env.example .env
```
*(You can leave default dummy credentials for local development and offline statement testing).*

### 4. Run Development Server
```bash
./dev.sh
```
Or manually with Uvicorn:
```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## 🏗️ Project Architecture

```
ib-journal/
├── backend/                  # FastAPI Application & Business Logic
│   ├── analytics.py          # Trade statistics, KPI calculations & calendar aggregations
│   ├── config.py             # Environment variables & runtime settings
│   ├── database.py           # SQLite connection with WAL mode & trade queries
│   ├── flex_client.py        # IBKR Flex Web Service XML client & parser
│   ├── main.py               # API routes & static file mounting
│   ├── scheduler.py          # Market-hours cron scheduler & rate limiter
│   └── settings.py           # User preferences persistence
├── frontend/                 # Zero-build Vanilla Web Interface
│   ├── css/                  # Institutional dark/light themes & calendar styles
│   ├── js/                   # Pure ES6+ modules (No build step, no npm)
│   │   ├── api.js            # Fetch client for backend endpoints
│   │   ├── app.js            # Tab routing & lifecycle initialization
│   │   ├── calendar_month.js # Monthly calendar grid renderer
│   │   ├── calendar_page.js  # Top-level calendar controller (Week/Month/Year)
│   │   ├── calendar_week.js  # Weekly breakdown cards
│   │   ├── calendar_year.js  # 12-month annual heatmap & ribbons
│   │   ├── day_modal.js      # Trade executions breakdown modal
│   │   ├── import_modal.js   # Drag & drop historical importer modal
│   │   ├── state.js          # Shared reactive client state
│   │   ├── stats.js          # Metrics calculation utilities
│   │   ├── stats_page.js     # Analytics charts, distributions & breakdowns
│   │   ├── strings.js        # Centralized UI copy & translations dictionary
│   │   └── theme.js          # Dark / Light / System theme controller
│   └── index.html            # Main SPA container
├── scripts/                  # CLI tools & historical statement importer
│   └── import_trades.py      # Idempotent multi-file statement importer (CSV/XML)
├── tests/                    # Unit tests and test suites
│   └── test_journal.py       # API, analytics, and database test coverage
├── IBKR_IMPORT_GUIDE.md      # Multi-year import & vacation recovery guide
├── setup.sh                  # One-click Raspberry Pi / Linux installer
├── dev.sh                    # Development launcher with auto-reload
└── pyproject.toml            # Project metadata, dependencies & linter config
```

---

## 📐 Development Guidelines

### Backend (Python / FastAPI)
- Target **Python 3.10+**.
- Follow **PEP 8** conventions. Code formatting and linting are enforced with [Ruff](https://github.com/astral-sh/ruff).
- Keep dependencies minimal to ensure smooth operation on lightweight devices like Raspberry Pi.
- Maintain idempotency when parsing and writing trades (`INSERT ON CONFLICT(ib_exec_id) DO UPDATE`).

### Frontend (Vanilla ES6+ JS & Modern CSS)
- **Zero build step policy**: Keep the frontend purely vanilla (standard ES6+ JS and modern CSS).
- **Do not introduce npm, bundlers, or heavy UI frameworks**.
- All user-facing text, titles, labels, and messages **must** be declared in [`frontend/js/strings.js`](frontend/js/strings.js) to keep translations and copy centralized.
- Ensure the interface remains fully responsive across desktop and mobile screens.

### Database & Storage
- Always use SQLite with **Write-Ahead Logging (`WAL`)** and memory temp stores (`PRAGMA temp_store = MEMORY`) to minimize SD card write churn.

---

## 🧪 Running Tests & Quality Checks

Before submitting a Pull Request, verify all checks pass locally:

### 1. Run Unit Tests
```bash
pytest -v
# or with python's built-in test runner:
python -m unittest discover tests
```

### 2. Run Linter (Ruff)
```bash
ruff check backend/ scripts/ tests/
```

### 3. Run Static Type Checking (Mypy)
```bash
mypy backend scripts tests
```

### 4. Validate Frontend JavaScript Syntax
```bash
for f in frontend/js/*.js; do
  node --check "$f"
done
```

---

## 🚀 Submitting Changes (Pull Requests)

1. **Create a new branch**:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bugfix-name
   ```
2. **Commit your changes**:
   Write clear and descriptive commit messages following conventional commit style (e.g., `feat: add metric breakdown`, `fix: handle edge case in xml parser`, `docs: update setup steps`).
3. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
4. **Open a Pull Request**:
   Describe the motivation, changes made, and steps taken to test the feature.

---

## 🐛 Reporting Issues

If you find a bug or have a suggestion:
1. Check the [existing issues](https://github.com/hector6872/ib-journal/issues) to avoid duplicates.
2. Open a new issue with detailed reproduction steps, logs (if applicable), and your environment details (OS, Python version, browser).

Thank you for helping improve IBKR Trading Journal! 📓✨

#!/usr/bin/env bash
set -e

# ========================================================
# IBKR Trading Journal - Raspberry Pi Auto-Installer
# ========================================================

echo "📓 Setting up IBKR Trading Journal..."

# 1. Check Python 3
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed. Please run: sudo apt install python3 python3-venv python3-pip"
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "✓ Found Python $PYTHON_VERSION"

# 2. Setup Virtual Environment
if [ ! -d ".venv" ]; then
    echo "📦 Creating virtual environment (.venv)..."
    python3 -m venv .venv
fi

echo "📦 Installing / updating Python dependencies..."
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

# 3. Environment Config (.env)
if [ ! -f ".env" ]; then
    echo "⚙️ Creating .env file from template..."
    cp .env.example .env
    echo "⚠️ Please edit .env with your IBKR_TOKEN and IBKR_QUERY_ID."
else
    echo "✓ Existing .env file found."
fi

# 4. Initialize Database Directory
mkdir -p data

# 5. Verify & Test DB initialization
echo "🗄️ Initializing SQLite database with MicroSD-safe WAL mode..."
.venv/bin/python3 -c "from backend.database import init_db; init_db()"

echo ""
echo "========================================================"
echo "🎉 Setup completed successfully!"
echo "========================================================"
echo "To start the journal server manually:"
echo "  source .venv/bin/activate"
echo "  python -m backend.main"
echo ""
echo "To install as a background systemd service on Raspberry Pi:"
echo "  sudo cp ib-journal.service /etc/systemd/system/"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable --now ib-journal"
echo "========================================================"

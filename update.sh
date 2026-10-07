#!/usr/bin/env bash
set -e

# ========================================================
# IBKR Trading Journal - Updater Script
# ========================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "🔄 Updating IBKR Trading Journal..."

# 1. Git pull latest changes
echo "📥 Fetching latest code from Git repository..."
git pull

# 2. Update Python dependencies if virtual environment exists
if [ -d ".venv" ]; then
    echo "📦 Updating Python dependencies in .venv..."
    .venv/bin/pip install --upgrade pip --quiet
    .venv/bin/pip install -r requirements.txt --quiet
elif [ -d "venv" ]; then
    echo "📦 Updating Python dependencies in venv..."
    venv/bin/pip install --upgrade pip --quiet
    venv/bin/pip install -r requirements.txt --quiet
fi

# 3. Verify / upgrade database schema
if [ -x ".venv/bin/python3" ]; then
    echo "🗄️ Checking SQLite database schema..."
    .venv/bin/python3 -c "from backend.database import init_db; init_db()"
elif [ -x "venv/bin/python3" ]; then
    echo "🗄️ Checking SQLite database schema..."
    venv/bin/python3 -c "from backend.database import init_db; init_db()"
fi

# 4. Restart systemd service if active
SERVICE_NAME="ib-journal"
if command -v systemctl >/dev/null 2>&1; then
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        echo "🔁 Restarting systemd service (${SERVICE_NAME})..."
        if [ "$(id -u)" -eq 0 ]; then
            systemctl restart "${SERVICE_NAME}"
        elif command -v sudo >/dev/null 2>&1; then
            sudo systemctl restart "${SERVICE_NAME}"
        fi
        echo "✓ Service restarted successfully."
    elif [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
        echo "ℹ️ Service file found at /etc/systemd/system/${SERVICE_NAME}.service (not currently active)."
    fi
fi

echo ""
echo "========================================================"
echo "✅ IBKR Trading Journal updated successfully!"
echo "========================================================"

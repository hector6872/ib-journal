#!/usr/bin/env bash
set -e

# ========================================================
# IBKR Trading Journal - Development Launcher
# ========================================================

echo "📓 Starting IBKR Trading Journal in Development Mode..."

# 1. Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Prevent virtualenv subprocess site-import conflicts
unset PYTHONHOME

# 2. Check / Create Virtual Environment
VENV_DIR="$SCRIPT_DIR/.venv"
VENV_PYTHON="$VENV_DIR/bin/python3"

if [ ! -f "$VENV_PYTHON" ]; then
    echo "📦 Virtual environment (.venv) not found. Creating one..."
    python3 -m venv "$VENV_DIR"
    "$VENV_PYTHON" -m pip install --upgrade pip
    "$VENV_PYTHON" -m pip install -r requirements.txt
fi

# 3. Ensure .env exists
if [ ! -f ".env" ]; then
    echo "⚙️ Creating .env file from .env.example..."
    cp .env.example .env
fi


# 4. Extract HOST and PORT from .env or use defaults
HOST=$(grep -E '^HOST=' .env | cut -d '=' -f2 | tr -d ' "')
PORT=$(grep -E '^PORT=' .env | cut -d '=' -f2 | tr -d ' "')

HOST=${HOST:-0.0.0.0}
PORT=${PORT:-8000}

echo ""
echo "🚀 Server is starting with Auto-Reload enabled..."
echo "👉 Local Access:   http://localhost:${PORT}"
echo "👉 Network Access: http://${HOST}:${PORT}"
echo ""
echo "Press Ctrl+C to stop the server."
echo "========================================================"

# 5. Start Uvicorn with Auto-Reload for development
# Using "$VENV_PYTHON -m uvicorn" ensures child reloader processes use the exact venv interpreter
exec "$VENV_PYTHON" -m uvicorn backend.main:app --host "$HOST" --port "$PORT" --reload --reload-dir backend


#!/usr/bin/env bash
# ==============================================================================
# Dynamic Systemd Service Installer for IBKR Trading Journal
# Supports DietPi, Raspberry Pi OS, Ubuntu, Debian, etc.
# ==============================================================================

set -euo pipefail

# Ensure script is run with sudo/root permissions
if [ "$(id -u)" -ne 0 ]; then
    echo "❌ Error: This script must be run with sudo: sudo ./scripts/install_service.sh" >&2
    exit 1
fi

# Detect actual target user (if invoked via sudo, use original caller)
SERVICE_USER="${SUDO_USER:-$(logname 2>/dev/null || id -un)}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="ib-journal"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# Detect Python interpreter path
if [ -x "${PROJECT_DIR}/.venv/bin/python3" ]; then
    PYTHON_EXEC="${PROJECT_DIR}/.venv/bin/python3"
elif [ -x "${PROJECT_DIR}/venv/bin/python3" ]; then
    PYTHON_EXEC="${PROJECT_DIR}/venv/bin/python3"
else
    PYTHON_EXEC="$(command -v python3)"
fi

echo "=========================================="
echo "Installing ${SERVICE_NAME}.service"
echo "=========================================="
echo "  User:             ${SERVICE_USER}"
echo "  Working Directory: ${PROJECT_DIR}"
echo "  Python Executable: ${PYTHON_EXEC}"
echo "  Service File:     ${SERVICE_FILE}"
echo "=========================================="

# Generate unit file
cat <<EOF > "${SERVICE_FILE}"
[Unit]
Description=IBKR Trading Journal Web Service
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${PROJECT_DIR}
ExecStart=${PYTHON_EXEC} -m backend.main
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# MicroSD write wear reduction environment
Environment=PYTHONUNBUFFERED=1
Environment=PYTHONDONTWRITEBYTECODE=1

[Install]
WantedBy=multi-user.target
EOF

# Reload and enable
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo ""
echo "✅ ${SERVICE_NAME} installed and started successfully!"
echo "To check service status:  sudo systemctl status ${SERVICE_NAME}"
echo "To view live logs:        journalctl -u ${SERVICE_NAME} -f"
echo "=========================================="

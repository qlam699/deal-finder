#!/usr/bin/env bash
# Redeploy app code: install deps, build, restart systemd.
# Preserves data.db (products + API keys). Safe for GitHub Actions.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_PATH="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICE_NAME="deal-codayroi"

cd "${APP_PATH}"
echo "==> Deploy in ${APP_PATH}"

if [[ ! -f package.json ]]; then
  echo "ERROR: package.json not found in ${APP_PATH}"
  exit 1
fi

# Never delete production DB here
if [[ -f data.db ]]; then
  echo "==> Keeping existing data.db"
fi

echo "==> npm ci..."
npm ci

echo "==> npm run build..."
npm run build

if systemctl list-unit-files "${SERVICE_NAME}.service" 2>/dev/null | grep -q "${SERVICE_NAME}"; then
  echo "==> Restarting ${SERVICE_NAME}..."
  if sudo -n systemctl restart "${SERVICE_NAME}" 2>/dev/null; then
    sudo -n systemctl --no-pager --full status "${SERVICE_NAME}" || true
  elif systemctl restart "${SERVICE_NAME}" 2>/dev/null; then
    systemctl --no-pager --full status "${SERVICE_NAME}" || true
  else
    echo "ERROR: cannot restart ${SERVICE_NAME}. Install sudoers via setup-vps.sh or run: sudo systemctl restart ${SERVICE_NAME}"
    exit 1
  fi
else
  echo "WARN: systemd unit ${SERVICE_NAME} not installed yet. Run setup-vps.sh first."
fi

echo "==> Deploy finished."
echo "    Health: curl -I http://127.0.0.1:3000"

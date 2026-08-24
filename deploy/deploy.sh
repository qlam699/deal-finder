#!/usr/bin/env bash
# Redeploy: npm ci + build + systemctl restart. Keeps data.db.
# Run as root (GitHub Actions / VPS_USER with sudo) or as APP_USER.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_PATH="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICE_NAME="deal-codayroi"
# Must match systemd User=/Group= (see setup-vps.sh / deal-codayroi.service)
APP_USER="${APP_USER:-deal}"
APP_GROUP="${APP_GROUP:-deal}"

run_as_app() {
  if [[ "$(id -un)" == "${APP_USER}" ]]; then
    "$@"
  elif [[ "${EUID}" -eq 0 ]]; then
    sudo -u "${APP_USER}" -H -- "$@"
  else
    echo "ERROR: run as ${APP_USER} or root (sudo bash deploy/deploy.sh)" >&2
    exit 1
  fi
}

cd "${APP_PATH}"
echo "==> Deploy in ${APP_PATH} (runtime ${APP_USER}:${APP_GROUP})"

if [[ ! -f package.json ]]; then
  echo "ERROR: package.json not found in ${APP_PATH}"
  exit 1
fi

if [[ -f data.db ]]; then
  echo "==> Keeping existing data.db"
fi

if [[ "${EUID}" -eq 0 ]]; then
  chown -R "${APP_USER}:${APP_GROUP}" "${APP_PATH}" || true
fi

echo "==> npm ci..."
run_as_app npm ci

echo "==> Cleaning previous .next build..."
run_as_app rm -rf "${APP_PATH}/.next"

echo "==> npm run build..."
run_as_app npm run build

if [[ ! -f "${APP_PATH}/.next/BUILD_ID" ]]; then
  echo "ERROR: .next/BUILD_ID missing after build — build failed or incomplete"
  exit 1
fi
if [[ ! -f "${APP_PATH}/.next/server/middleware-manifest.json" ]]; then
  echo "ERROR: .next/server/middleware-manifest.json missing after build"
  ls -la "${APP_PATH}/.next/server" 2>/dev/null || true
  exit 1
fi

if systemctl list-unit-files "${SERVICE_NAME}.service" 2>/dev/null | grep -q "${SERVICE_NAME}"; then
  echo "==> Restarting ${SERVICE_NAME}..."
  if [[ "${EUID}" -eq 0 ]]; then
    systemctl restart "${SERVICE_NAME}"
    systemctl --no-pager --full status "${SERVICE_NAME}" || true
  elif sudo -n systemctl restart "${SERVICE_NAME}" 2>/dev/null; then
    sudo -n systemctl --no-pager --full status "${SERVICE_NAME}" || true
  else
    echo "ERROR: cannot restart ${SERVICE_NAME}"
    exit 1
  fi
else
  echo "WARN: systemd unit ${SERVICE_NAME} not installed yet. Run setup-vps.sh first."
fi

echo "==> Deploy finished."
echo "    Health: curl -I http://127.0.0.1:3000"

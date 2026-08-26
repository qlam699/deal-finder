#!/usr/bin/env bash
# Apply CI release on the VPS (same pattern as bacpq).
#   sudo APP_DIR=/var/www/deal.codayroi.com/app bash scripts/deploy.sh --release /tmp/deal-release.tar.gz
#   sudo bash scripts/deploy.sh   # restart only (artifact already in APP_DIR)
#
# Wipes APP_DIR on --release. SQLite lives in DATA_DIR (/var/lib/deal) — not deleted.
set -euo pipefail

APP_USER="${APP_USER:-deal}"
DATA_DIR="${DATA_DIR:-/var/lib/deal}"
SERVICE_NAME="deal-codayroi"
PORT="${PORT:-3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_TAR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      RELEASE_TAR="${2:?--release needs tarball path}"
      shift 2
      ;;
    *)
      echo "Usage: $0 [--release /path/to/deal-release.tar.gz]" >&2
      exit 1
      ;;
  esac
done

if [[ -n "${RELEASE_TAR}" ]]; then
  APP_DIR="${APP_DIR:-/var/www/deal.codayroi.com/app}"
else
  APP_DIR="${APP_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
fi

install_unit() {
  local unit_src="${APP_DIR}/deploy/deal-codayroi.service"
  if [[ ! -f "${unit_src}" ]]; then
    echo "Missing ${unit_src}" >&2
    return 1
  fi
  local unit_tmp
  unit_tmp="$(mktemp)"
  sed "s|__APP_DIR__|${APP_DIR}|g" "${unit_src}" > "${unit_tmp}"
  install -m 644 "${unit_tmp}" /etc/systemd/system/${SERVICE_NAME}.service
  rm -f "${unit_tmp}"
  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}"
}

restart_service() {
  if [[ ! -f /etc/systemd/system/${SERVICE_NAME}.service ]]; then
    echo "==> No systemd unit — run: sudo bash scripts/setup-vps-webinoly.sh" >&2
    return 1
  fi
  echo "==> systemctl restart ${SERVICE_NAME}"
  systemctl daemon-reload
  systemctl restart "${SERVICE_NAME}"
  systemctl --no-pager --full status "${SERVICE_NAME}" || true
}

migrate_cwd_db_once() {
  mkdir -p "${DATA_DIR}"
  if [[ -f "${APP_DIR}/data.db" && ! -f "${DATA_DIR}/data.db" ]]; then
    echo "==> Move legacy ${APP_DIR}/data.db → ${DATA_DIR}/data.db"
    cp -a "${APP_DIR}/data.db" "${DATA_DIR}/data.db"
    # WAL/SHM if present
    [[ -f "${APP_DIR}/data.db-wal" ]] && cp -a "${APP_DIR}/data.db-wal" "${DATA_DIR}/data.db-wal" || true
    [[ -f "${APP_DIR}/data.db-shm" ]] && cp -a "${APP_DIR}/data.db-shm" "${DATA_DIR}/data.db-shm" || true
  fi
  chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}" 2>/dev/null || true
}

apply_release() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Need root for --release" >&2
    exit 1
  fi
  if [[ ! -f "${RELEASE_TAR}" ]]; then
    echo "Tarball not found: ${RELEASE_TAR}" >&2
    exit 1
  fi

  migrate_cwd_db_once

  if [[ -f /etc/systemd/system/${SERVICE_NAME}.service ]]; then
    echo "==> systemctl stop ${SERVICE_NAME}"
    systemctl stop "${SERVICE_NAME}" || true
  fi

  echo "==> Wipe ${APP_DIR} (keep ${DATA_DIR}/data.db)"
  rm -rf "${APP_DIR}"
  mkdir -p "${APP_DIR}"
  echo "==> Extract ${RELEASE_TAR} → ${APP_DIR}"
  tar -xzf "${RELEASE_TAR}" -C "${APP_DIR}"

  if id -u "${APP_USER}" >/dev/null 2>&1; then
    chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
  fi
  chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}" 2>/dev/null || true

  echo "==> Install systemd unit"
  install_unit
}

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/deploy.sh ..." >&2
  exit 1
fi

if [[ -n "${RELEASE_TAR}" ]]; then
  apply_release
else
  migrate_cwd_db_once
fi

if [[ ! -f "${APP_DIR}/.next/BUILD_ID" ]]; then
  echo "Missing ${APP_DIR}/.next/BUILD_ID — deploy with --release from GitHub Actions." >&2
  exit 1
fi
if [[ ! -d "${APP_DIR}/node_modules" ]]; then
  echo "Missing ${APP_DIR}/node_modules — deploy with --release from GitHub Actions." >&2
  exit 1
fi

restart_service

echo "==> health"
sleep 2
if curl -fsS -o /dev/null -I "http://127.0.0.1:${PORT}/"; then
  curl -sI "http://127.0.0.1:${PORT}/" | head -5
else
  echo "Health check failed. journalctl -u ${SERVICE_NAME} -n 80 --no-pager" >&2
  exit 1
fi
echo
echo "==> Deploy OK → https://deal.codayroi.com (DATA_DIR=${DATA_DIR})"

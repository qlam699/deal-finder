#!/usr/bin/env bash
# Bootstrap VPS once (NOT called by GitHub Actions).
# - Installs Node 20 + build tools if missing
# - Installs systemd unit
# - Wipes SQLite DB so production starts clean
set -euo pipefail

APP_PATH="${VPS_APP_PATH:-/var/www/deal.codayroi.com/app}"
SERVICE_NAME="deal-codayroi"
DOMAIN="deal.codayroi.com"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/setup-vps.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> App path: ${APP_PATH}"
mkdir -p "$(dirname "${APP_PATH}")"

if [[ "${REPO_ROOT}" != "${APP_PATH}" ]]; then
  echo "Note: script is in ${REPO_ROOT}; expected app at ${APP_PATH}."
  echo "Clone/copy the repo to ${APP_PATH} first if you have not."
fi

echo "==> Installing build tools..."
apt-get update -y
apt-get install -y curl build-essential python3 git ca-certificates

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v(2[0-9]|[3-9])'; then
  echo "==> Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Node: $(node -v)  npm: $(npm -v)"

if ! id -u deploy >/dev/null 2>&1; then
  echo "==> Creating user deploy..."
  useradd --create-home --shell /bin/bash deploy
fi

echo "==> Ensuring ${APP_PATH} ownership..."
if [[ ! -d "${APP_PATH}" ]]; then
  echo "ERROR: ${APP_PATH} does not exist. Clone the repo there first, e.g.:"
  echo "  sudo mkdir -p $(dirname "${APP_PATH}")"
  echo "  sudo git clone https://github.com/qlam699/deal-finder.git ${APP_PATH}"
  echo "  sudo chown -R deploy:deploy $(dirname "${APP_PATH}")"
  exit 1
fi
chown -R deploy:deploy "$(dirname "${APP_PATH}")"

echo "==> Cleaning SQLite DB for first-time production setup..."
# Stop service if running so WAL files are not locked
systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
rm -f "${APP_PATH}/data.db" "${APP_PATH}/data.db-wal" "${APP_PATH}/data.db-shm"
echo "    Removed data.db / data.db-wal / data.db-shm (fresh DB on next start)."

echo "==> Installing systemd unit..."
UNIT_SRC="${APP_PATH}/deploy/deal-codayroi.service"
if [[ ! -f "${UNIT_SRC}" ]]; then
  UNIT_SRC="${SCRIPT_DIR}/deal-codayroi.service"
fi
install -m 644 "${UNIT_SRC}" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"

echo "==> Allowing deploy to restart service without password..."
SYSTEMCTL_BIN="$(command -v systemctl || echo /usr/bin/systemctl)"
cat > /etc/sudoers.d/deal-codayroi <<EOF
deploy ALL=(root) NOPASSWD: ${SYSTEMCTL_BIN} start ${SERVICE_NAME}, ${SYSTEMCTL_BIN} stop ${SERVICE_NAME}, ${SYSTEMCTL_BIN} restart ${SERVICE_NAME}, ${SYSTEMCTL_BIN} status ${SERVICE_NAME}, ${SYSTEMCTL_BIN} is-active ${SERVICE_NAME}
EOF
chmod 440 /etc/sudoers.d/deal-codayroi

echo ""
echo "==> Setup done. Next steps:"
echo "  1) As deploy (or with sudo -u deploy):"
echo "       cd ${APP_PATH} && bash deploy/deploy.sh"
echo "  2) Webinoly reverse proxy + SSL (DNS must point here):"
echo "       sudo site ${DOMAIN} -proxy=127.0.0.1:3000"
echo "       sudo site ${DOMAIN} -ssl=on"
echo "  3) GitHub Secrets: VPS_HOST, VPS_USER=deploy, VPS_SSH_KEY"
echo "  4) Do NOT run this setup script from CI — only deploy.sh"
echo ""
echo "Logs: journalctl -u ${SERVICE_NAME} -f"

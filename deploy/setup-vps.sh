#!/usr/bin/env bash
# Bootstrap VPS once (first Actions run or manual).
# - Installs Node 20 + build tools if missing
# - Creates APP_USER / APP_GROUP (runtime owner of the app — NOT the GitHub SSH user)
# - Installs systemd unit; wipes SQLite DB for a clean production start
set -euo pipefail

APP_PATH="${VPS_APP_PATH:-/var/www/deal.codayroi.com/app}"
SERVICE_NAME="deal-codayroi"
DOMAIN="deal.codayroi.com"
# Runtime Linux account (systemd User=). Distinct from VPS_USER (SSH for CI, often root).
APP_USER="${APP_USER:-deal}"
APP_GROUP="${APP_GROUP:-deal}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/setup-vps.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> App path: ${APP_PATH}"
echo "==> Runtime owner: ${APP_USER}:${APP_GROUP} (systemd); CI SSH user is separate (VPS_USER)"
mkdir -p "$(dirname "${APP_PATH}")"

if [[ "${REPO_ROOT}" != "${APP_PATH}" ]]; then
  echo "Note: script is in ${REPO_ROOT}; expected app at ${APP_PATH}."
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

echo "==> Ensuring APP_GROUP=${APP_GROUP} and APP_USER=${APP_USER}..."
if ! getent group "${APP_GROUP}" >/dev/null 2>&1; then
  groupadd "${APP_GROUP}"
fi
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash -g "${APP_GROUP}" "${APP_USER}"
else
  usermod -g "${APP_GROUP}" "${APP_USER}" 2>/dev/null || true
fi

echo "==> Ensuring ${APP_PATH} ownership ${APP_USER}:${APP_GROUP}..."
if [[ ! -d "${APP_PATH}" ]]; then
  echo "ERROR: ${APP_PATH} does not exist. Clone first, e.g.:"
  echo "  sudo git clone https://github.com/qlam699/deal-finder.git ${APP_PATH}"
  exit 1
fi
chown -R "${APP_USER}:${APP_GROUP}" "$(dirname "${APP_PATH}")"

echo "==> Cleaning SQLite DB for first-time production setup..."
systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
rm -f "${APP_PATH}/data.db" "${APP_PATH}/data.db-wal" "${APP_PATH}/data.db-shm"
echo "    Removed data.db / data.db-wal / data.db-shm (fresh DB on next start)."

echo "==> Installing systemd unit (User=${APP_USER} Group=${APP_GROUP})..."
UNIT_SRC="${APP_PATH}/deploy/deal-codayroi.service"
if [[ ! -f "${UNIT_SRC}" ]]; then
  UNIT_SRC="${SCRIPT_DIR}/deal-codayroi.service"
fi
# Fill APP_USER / APP_GROUP from this script into the unit file
sed -e "s/@APP_USER@/${APP_USER}/g" -e "s/@APP_GROUP@/${APP_GROUP}/g" \
  "${UNIT_SRC}" > "/etc/systemd/system/${SERVICE_NAME}.service"
chmod 644 "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"

echo "==> Optional: allow ${APP_USER} to restart service without password..."
SYSTEMCTL_BIN="$(command -v systemctl || echo /usr/bin/systemctl)"
cat > /etc/sudoers.d/deal-codayroi <<EOF
${APP_USER} ALL=(root) NOPASSWD: ${SYSTEMCTL_BIN} start ${SERVICE_NAME}, ${SYSTEMCTL_BIN} stop ${SERVICE_NAME}, ${SYSTEMCTL_BIN} restart ${SERVICE_NAME}, ${SYSTEMCTL_BIN} status ${SERVICE_NAME}, ${SYSTEMCTL_BIN} is-active ${SERVICE_NAME}
EOF
chmod 440 /etc/sudoers.d/deal-codayroi

echo ""
echo "==> Setup done. Next steps:"
echo "  1) sudo bash ${APP_PATH}/deploy/deploy.sh"
echo "  2) sudo site ${DOMAIN} -proxy=127.0.0.1:3000 && sudo site ${DOMAIN} -ssl=on"
echo "  3) GitHub: VPS_HOST, VPS_USER=root (SSH), VPS_SSH_KEY — not APP_USER=${APP_USER}"
echo ""
echo "Logs: journalctl -u ${SERVICE_NAME} -f"

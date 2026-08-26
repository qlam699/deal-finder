#!/usr/bin/env bash
# First-time VPS setup (Webinoly already installed). Same flow as bacpq.
# Does NOT apt-install nginx/certbot or hand-edit sites-available (except optional SSL via `site`).
#
# Usage (root), from extracted release at APP_DIR:
#   sudo bash scripts/setup-vps-webinoly.sh
#   sudo SKIP_SSL=1 bash scripts/setup-vps-webinoly.sh
#   sudo SKIP_SITE=1 bash scripts/setup-vps-webinoly.sh
set -euo pipefail

DOMAIN="${DOMAIN:-deal.codayroi.com}"
APP_USER="${APP_USER:-deal}"
PORT="${PORT:-3000}"
SKIP_SITE="${SKIP_SITE:-0}"
SKIP_SSL="${SKIP_SSL:-0}"
# SQLite + backups live here (survives APP_DIR wipe on each release)
DATA_DIR="${DATA_DIR:-/var/lib/deal}"

webinoly_create_proxy() {
  local domain="$1"
  local port="$2"
  local attempt
  for attempt in \
    "-proxy=[127.0.0.1:${port}]" \
    "-proxy=[http://127.0.0.1:${port}]" \
    "-proxy=[localhost:${port}]" \
    "-proxy=[http://localhost:${port}]"
  do
    echo "==> Try: site ${domain} ${attempt}"
    # shellcheck disable=SC2086
    if site "${domain}" ${attempt}; then
      echo "==> Proxy OK (${attempt})"
      return 0
    fi
  done
  return 1
}

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/setup-vps-webinoly.sh" >&2
  exit 1
fi

if ! command -v site >/dev/null 2>&1; then
  echo "Webinoly \`site\` not found. Install Webinoly first: https://webinoly.com/" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SITE_NGINX="/etc/nginx/sites-available/${DOMAIN}"

echo "==> App dir: ${APP_DIR}"
echo "==> Domain: ${DOMAIN}"
echo "==> Proxy: 127.0.0.1:${PORT}"
echo "==> Data dir: ${DATA_DIR} (data.db preserved across deploys)"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y --allow-releaseinfo-change
apt-get install -y curl ca-certificates

if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 20)'; then
  echo "==> Install Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "==> Node $(node -v)"

if ! getent group "${APP_USER}" >/dev/null 2>&1; then
  groupadd --system "${APP_USER}"
fi
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  adduser --system --ingrouproup --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}" 2>/dev/null \
    || useradd --system --gid "${APP_USER}" --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

mkdir -p "${DATA_DIR}" "${APP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}" "${DATA_DIR}"

UNIT_TMP="$(mktemp)"
sed "s|__APP_DIR__|${APP_DIR}|g" "${APP_DIR}/deploy/deal-codayroi.service" > "${UNIT_TMP}"
install -m 644 "${UNIT_TMP}" /etc/systemd/system/deal-codayroi.service
rm -f "${UNIT_TMP}"
systemctl daemon-reload
systemctl enable deal-codayroi

if [[ -f "${APP_DIR}/.next/BUILD_ID" && -d "${APP_DIR}/node_modules" ]]; then
  echo "==> Restart from existing release artifact"
  bash "${APP_DIR}/scripts/deploy.sh" || true
else
  echo "==> No release artifact yet in ${APP_DIR}."
  echo "    Push main / Run workflow — CI builds + SCP tarball → deploy.sh --release."
fi

if [[ "${SKIP_SITE}" != "1" ]]; then
  if [[ -e "${SITE_NGINX}" ]]; then
    echo "==> Site ${DOMAIN} already exists (Webinoly). Not recreating."
    site "${DOMAIN}" -info || true
  else
    echo "==> Create Webinoly reverse proxy → :${PORT}"
    mkdir -p "/var/www/${DOMAIN}/htdocs"
    if ! webinoly_create_proxy "${DOMAIN}" "${PORT}"; then
      echo "WARN: proxy site failed — app can still run on :${PORT}" >&2
      echo "  sudo site ${DOMAIN} -proxy=[127.0.0.1:${PORT}]" >&2
      echo "  sudo site ${DOMAIN} -ssl=on" >&2
    fi
  fi

  if [[ "${SKIP_SSL}" != "1" && -e "${SITE_NGINX}" ]]; then
    echo "==> SSL Let's Encrypt (Webinoly)"
    if site "${DOMAIN}" -ssl=on; then
      echo "==> SSL OK"
    else
      echo "SSL pending. DNS A ${DOMAIN} → VPS IP, then: sudo site ${DOMAIN} -ssl=on" >&2
    fi
  elif [[ "${SKIP_SSL}" == "1" ]]; then
    echo "==> Skip SSL (SKIP_SSL=1). Later: sudo site ${DOMAIN} -ssl=on"
  fi
else
  echo "==> Skip Webinoly site (SKIP_SITE=1)"
fi

echo
echo "==> Setup done."
echo "    Local:  curl -sI http://127.0.0.1:${PORT}/"
echo "    Public: https://${DOMAIN}/"
echo "    Log:    journalctl -u deal-codayroi -f"
echo "    Deploy: Actions → SCP artifact → sudo bash scripts/deploy.sh --release /tmp/deal-release.tar.gz"
echo
echo "If https:// returns 301 loop: remove duplicate Certbot empty :443 server block"
echo "  (see deploy/README.md). Prefer Webinoly \`site\` only — do not hand-merge SSL."

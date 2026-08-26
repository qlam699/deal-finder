#!/usr/bin/env bash
# Fix ERR_TOO_MANY_REDIRECTS / 301 loop for deal.codayroi.com.
# Cause: duplicate empty Certbot :443 block or return 301 inside HTTPS server.
# Writes one clean HTTP→HTTPS + one HTTPS→proxy site (keeps Let's Encrypt certs).
#
#   sudo bash scripts/fix-nginx-site.sh
set -euo pipefail

DOMAIN="${DOMAIN:-deal.codayroi.com}"
UPSTREAM="${UPSTREAM:-deal_codayroi_com}"
PORT="${PORT:-3000}"
SITE_FILE="/etc/nginx/sites-available/${DOMAIN}"
PROXY_FILE="/etc/nginx/apps.d/${DOMAIN}-proxy.conf"
CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run: sudo bash scripts/fix-nginx-site.sh" >&2
  exit 1
fi

if ! curl -sf -o /dev/null -I "http://127.0.0.1:${PORT}/"; then
  echo "ERROR: app not up on :${PORT} — fix deal-codayroi first" >&2
  systemctl status deal-codayroi --no-pager || true
  exit 1
fi

if [[ ! -f "${CERT}" || ! -f "${KEY}" ]]; then
  echo "ERROR: missing LE certs at /etc/letsencrypt/live/${DOMAIN}/" >&2
  echo "  sudo site ${DOMAIN} -ssl=on" >&2
  exit 1
fi

mkdir -p "/var/www/${DOMAIN}/htdocs" /etc/nginx/apps.d /etc/nginx/conf.d

# Upstream (Webinoly name)
if [[ -f /etc/nginx/conf.d/upstream_proxy.conf ]]; then
  if ! grep -q "upstream ${UPSTREAM}" /etc/nginx/conf.d/upstream_proxy.conf; then
    cat >> /etc/nginx/conf.d/upstream_proxy.conf <<EOF

upstream ${UPSTREAM} {
    server 127.0.0.1:${PORT};
    keepalive 8;
}
EOF
  fi
else
  cat > /etc/nginx/conf.d/upstream_proxy.conf <<EOF
upstream ${UPSTREAM} {
    server 127.0.0.1:${PORT};
    keepalive 8;
}
EOF
fi

# Proxy snippet — headers ON (Webinoly default comments them out)
cat > "${PROXY_FILE}" <<EOF
# Managed by scripts/fix-nginx-site.sh — reverse proxy to Next.js
location / {
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Connection "";
    proxy_set_header Proxy "";
    proxy_redirect off;
    proxy_intercept_errors off;
    proxy_connect_timeout 300;
    proxy_send_timeout 300;
    proxy_read_timeout 300;
    proxy_pass http://${UPSTREAM};
}
EOF

SSL_EXTRA=""
[[ -f /etc/letsencrypt/options-ssl-nginx.conf ]] && SSL_EXTRA="${SSL_EXTRA}
    include /etc/letsencrypt/options-ssl-nginx.conf;"
[[ -f /etc/letsencrypt/ssl-dhparams.pem ]] && SSL_EXTRA="${SSL_EXTRA}
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"

cp -a "${SITE_FILE}" "/tmp/${DOMAIN}.nginx.bak.$(date +%s)" 2>/dev/null || true

# Single HTTP redirect + single HTTPS proxy — NO second Certbot empty server
cat > "${SITE_FILE}" <<EOF
# Managed by scripts/fix-nginx-site.sh (deal.codayroi.com)
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${DOMAIN};

    ssl_certificate     ${CERT};
    ssl_certificate_key ${KEY};${SSL_EXTRA}

    access_log off;
    error_log /var/log/nginx/${DOMAIN}.error.log;

    root /var/www/${DOMAIN}/htdocs;
    client_max_body_size 50M;

    # NO include common/auth.conf (avoids 401 Basic Auth)
    # NO include common/locations.conf (avoids redirect fights with Next)
    include apps.d/${DOMAIN}-proxy.conf;
}
EOF

ln -sfn "${SITE_FILE}" "/etc/nginx/sites-enabled/${DOMAIN}"

# Drop stray certbot-only includes if present as separate files
rm -f "/etc/nginx/sites-enabled/${DOMAIN}.conf" 2>/dev/null || true

nginx -t
systemctl reload nginx

echo "==> Test"
curl -sI "http://127.0.0.1:${PORT}/" | head -3
echo "---"
CODE="$(curl -sk -o /dev/null -w '%{http_code}' "https://${DOMAIN}/" || true)"
echo "https://${DOMAIN}/ → HTTP ${CODE}"
curl -skI "https://${DOMAIN}/" | head -12

if [[ "${CODE}" == "301" || "${CODE}" == "302" ]]; then
  echo "WARN: still redirecting — check:" >&2
  echo "  sudo nginx -T 2>/dev/null | grep -nE 'server_name ${DOMAIN}|return 301|listen .*443'" >&2
  exit 1
fi

if [[ "${CODE}" != "200" && "${CODE}" != "304" ]]; then
  echo "WARN: unexpected status ${CODE}" >&2
  exit 1
fi

echo "==> OK — open https://${DOMAIN}/ (incognito)"

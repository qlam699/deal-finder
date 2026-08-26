# Deploy — deal.codayroi.com (same pattern as bacpq)

Stack: Webinoly Nginx → Next.js `127.0.0.1:3000` (systemd `deal-codayroi`) → SQLite.

| Path | Role |
|---|---|
| **`VPS_USER`** | SSH from GitHub Actions (`root`, same as bacpq) |
| **`APP_USER=deal`** | systemd process owner |
| **`APP_DIR`** | `/var/www/deal.codayroi.com/app` — wiped each release |
| **`DATA_DIR`** | `/var/lib/deal` — `data.db` kept across deploys |

## How deploy works (like bacpq)

1. GitHub Actions: `npm ci` + `npm run build` on `ubuntu-latest`
2. Pack `deal-release.tar.gz` (`.next`, production `node_modules`, …)
3. SCP → VPS `/tmp/deal-release.tar.gz`
4. `scripts/deploy.sh --release` → wipe `APP_DIR` → extract → `systemctl restart`
5. **No** `git clone` / `npm run build` on the VPS

## Files

| Path | Purpose |
|---|---|
| [`scripts/setup-vps-webinoly.sh`](../scripts/setup-vps-webinoly.sh) | First boot: Node, user `deal`, unit, Webinoly proxy+SSL |
| [`scripts/deploy.sh`](../scripts/deploy.sh) | `--release` extract + restart |
| [`deploy/deal-codayroi.service`](./deal-codayroi.service) | systemd (`__APP_DIR__` filled by scripts) |
| [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) | build artifact → SCP → deploy |

## GitHub Secrets

| Secret | Value |
|---|---|
| `VPS_HOST` | Same as bacpq |
| `VPS_USER` | `root` (same as bacpq) |
| `VPS_SSH_KEY` | Same private key as bacpq (`bacpq-deploy`) |

## First time on VPS

DNS: A `deal.codayroi.com` → VPS IP. Webinoly already installed.

Push `main` (or Actions → Run workflow). First run seeds `APP_DIR` + `setup-vps-webinoly.sh` (creates proxy + SSL).

Manual:

```bash
# After SCP of tarball (or from a failed mid-run):
sudo mkdir -p /var/www/deal.codayroi.com/app
sudo tar -xzf /tmp/deal-release.tar.gz -C /var/www/deal.codayroi.com/app
sudo bash /var/www/deal.codayroi.com/app/scripts/setup-vps-webinoly.sh
sudo env APP_DIR=/var/www/deal.codayroi.com/app \
  bash /var/www/deal.codayroi.com/app/scripts/deploy.sh --release /tmp/deal-release.tar.gz
```

## Ops

```bash
sudo systemctl status deal-codayroi
journalctl -u deal-codayroi -f
curl -sI http://127.0.0.1:3000/
curl -sI https://deal.codayroi.com/
```

Backup DB:

```bash
sudo sqlite3 /var/lib/deal/data.db ".backup /root/deal-$(date +%F).db"
```

## HTTPS 301 loop / ERR_TOO_MANY_REDIRECTS

```bash
curl -sI http://127.0.0.1:3000/          # must be 200
sudo bash /var/www/deal.codayroi.com/app/scripts/fix-nginx-site.sh
curl -sI https://deal.codayroi.com/      # must be 200 + X-Powered-By: Next.js
```

Script writes one HTTP→HTTPS block + one HTTPS→proxy block (removes duplicate empty Certbot `:443`).

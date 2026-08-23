# Deploy — deal.codayroi.com (Webinoly + systemd + GitHub Actions)

Production: **https://deal.codayroi.com**  
Stack: Nginx (Webinoly reverse proxy) → Next.js on `127.0.0.1:3000` (systemd) → SQLite `data.db`

## Files

| Path | Purpose |
|---|---|
| [`deploy/deal-codayroi.service`](./deal-codayroi.service) | systemd unit (`User=deploy`) |
| [`deploy/setup-vps.sh`](./setup-vps.sh) | **One-time** bootstrap; **wipes** `data.db` |
| [`deploy/deploy.sh`](./deploy.sh) | Build + restart; **keeps** `data.db` |
| [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) | On push to `main` → SSH → deploy |

## One-time VPS bootstrap

1. DNS: A record `deal.codayroi.com` → VPS IP (`dig +short deal.codayroi.com`).
2. SSH as root/sudo:

```bash
# User + app dir
sudo useradd --create-home --shell /bin/bash deploy || true
sudo mkdir -p /var/www/deal.codayroi.com
sudo git clone https://github.com/qlam699/deal-finder.git /var/www/deal.codayroi.com/app
sudo chown -R deploy:deploy /var/www/deal.codayroi.com

# Bootstrap (installs Node/tools, systemd unit, CLEANS data.db)
cd /var/www/deal.codayroi.com/app
sudo bash deploy/setup-vps.sh

# First build + start
sudo -u deploy bash deploy/deploy.sh
sudo systemctl start deal-codayroi

# Webinoly
sudo site deal.codayroi.com -proxy=127.0.0.1:3000
sudo site deal.codayroi.com -ssl=on
```

3. SSH key for GitHub Actions (on VPS as `deploy`):

```bash
sudo -u deploy mkdir -p /home/deploy/.ssh
sudo -u deploy chmod 700 /home/deploy/.ssh
sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/gha_deploy -N ""
sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys < /home/deploy/.ssh/gha_deploy.pub
sudo -u deploy chmod 600 /home/deploy/.ssh/authorized_keys
# Copy PRIVATE key contents of /home/deploy/.ssh/gha_deploy → GitHub secret VPS_SSH_KEY
# (never commit the private key)
```

`setup-vps.sh` already installs passwordless `sudo` for `systemctl restart|status deal-codayroi` so Actions (SSH as `deploy`) can restart the unit.

**Do not** copy local `data.db` during setup. Schema is created empty on first app start.

## GitHub Secrets

Repo → Settings → Secrets and variables → Actions:

| Secret | Required | Example |
|---|---|---|
| `VPS_HOST` | yes | `1.2.3.4` or hostname |
| `VPS_USER` | yes | `deploy` |
| `VPS_SSH_KEY` | yes | Full private key PEM / OpenSSH |
| `VPS_PORT` | no | `22` |
| `VPS_APP_PATH` | no | `/var/www/deal.codayroi.com/app` |

## Ongoing deploys

Push or merge to `main` → workflow SSHs in → `git fetch` + `reset --hard origin/main` → `deploy/deploy.sh`.

Manual:

```bash
cd /var/www/deal.codayroi.com/app
sudo -u deploy bash deploy/deploy.sh
```

## Ops

```bash
sudo systemctl status deal-codayroi
journalctl -u deal-codayroi -f
curl -I http://127.0.0.1:3000
```

Backup DB (while running):

```bash
cd /var/www/deal.codayroi.com/app
sqlite3 data.db ".backup /home/deploy/backups/data-$(date +%F).db"
```

Never run `setup-vps.sh` from CI — it deletes the production database.

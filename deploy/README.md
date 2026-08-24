# Deploy — deal.codayroi.com (Webinoly + systemd + GitHub Actions)

Production: **https://deal.codayroi.com**  
Stack: Nginx (Webinoly) → Next.js `127.0.0.1:3000` (systemd) → SQLite `data.db`

## Two different “users” (do not mix)

| Name | Role | Example |
|---|---|---|
| **`VPS_USER`** | SSH vào VPS từ GitHub Actions | `root` (giống bacpq) |
| **`APP_USER` / `APP_GROUP`** | Linux chạy process Next + sở hữu file app | `deal` / `deal` |

CI SSH bằng `VPS_USER` + `sudo`. App chạy bằng `APP_USER` (systemd `User=`).

## Files

| Path | Purpose |
|---|---|
| [`deploy/deal-codayroi.service`](./deal-codayroi.service) | systemd (`User=@APP_USER@` → `deal`) |
| [`deploy/setup-vps.sh`](./setup-vps.sh) | Bootstrap; tạo `APP_USER`/`APP_GROUP`; **xóa** `data.db` |
| [`deploy/deploy.sh`](./deploy.sh) | `npm ci` + build + restart; **giữ** `data.db` |
| [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) | Push → SSH → setup (lần đầu) → `deploy.sh` |

Override runtime owner nếu cần: `APP_USER=... APP_GROUP=... sudo -E bash deploy/setup-vps.sh`

## GitHub Secrets (SSH — reuse bacpq)

| Secret | Value |
|---|---|
| `VPS_HOST` | Same as bacpq |
| `VPS_USER` | `root` (SSH), **không** phải `deal` |
| `VPS_SSH_KEY` | Private key `bacpq/bacpq-deploy` |

## One-time / first Actions run

Workflow clone + `setup-vps.sh` + `deploy.sh`. Sau đó trên VPS:

```bash
sudo site deal.codayroi.com -proxy=127.0.0.1:3000
sudo site deal.codayroi.com -ssl=on
```

Nếu lần trước tạo nhầm user `deploy` (không có group):

```bash
sudo groupadd deal || true
sudo useradd -m -s /bin/bash -g deal deal || true
# hoặc xóa user deploy cũ nếu không dùng: sudo userdel -r deploy
```

Rồi push code mới và re-run workflow.

## Ops

```bash
sudo systemctl status deal-codayroi
journalctl -u deal-codayroi -f
curl -I http://127.0.0.1:3000
sudo bash /var/www/deal.codayroi.com/app/deploy/deploy.sh
```

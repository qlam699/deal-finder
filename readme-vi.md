# Chotot Deal Finder — Dev Spec (Tiếng Việt)

> Bản tiếng Anh: [`README.md`](./README.md)

---

## 1. Tổng quan

### 1.1 Mục tiêu sản phẩm

- Quét tin đăng mới theo danh mục cấu hình được (điện thoại, laptop, ...).
- Định giá thị trường bằng chuỗi fallback nhiều AI provider.
- Tính % chênh lệch giữa giá Chợ Tốt và giá thị trường.
- Giúp người dùng quyết định có nên mua để lướt (mua đi bán lại) hay không.
- Quản lý API key, danh mục, thùng rác ngay trên UI.

### 1.2 Phạm vi hiện tại (MVP)

- Chạy local với Next.js + SQLite.
- Scrape Chợ Tốt qua public gateway API.
- Định giá: theo thứ tự danh sách API key (kéo thả trên tab API Keys); scrape thuần là bước cuối.
- Soft delete / hard delete / empty trash.
- Lịch sử `seen_products` để không quét lại tin đã từng thấy (kể cả sau khi xóa vĩnh viễn).
- Phân trang server-side, tìm kiếm theo title / mã tin.

### 1.3 Ngoài phạm vi (chưa làm)

- Deploy production / multi-user auth.
- Mã hóa API key khi lưu DB.
- Thông báo Telegram / Email.
- Cron bền vững ngoài process Next.js.

### 1.4 Deploy production

Xem **[deploy/README.md](./deploy/README.md)** — VPS Webinoly + systemd. CI build artifact + SCP (kiểu bacpq), không `npm build` trên VPS. Domain: `https://deal.codayroi.com`.

---

## 2. Tech stack

| Thành phần | Công nghệ |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Base UI) |
| Database | SQLite (`better-sqlite3`), file `data.db` |
| AI | `@google/generative-ai`, `openai` SDK (Groq / Cloudflare / Qwen / OpenRouter) |
| Scrape hỗ trợ | `cheerio` |
| Runtime local | `npm run dev` / `npm run build` + `npm start` |

---

## 3. Kiến trúc

```text
┌──────────────────┐
│  Dashboard UI    │  src/components/dashboard.tsx
│  (client-only)   │
└────────┬─────────┘
         │ fetch
┌────────▼─────────┐
│  Next.js API     │  src/app/api/*/route.ts
└────────┬─────────┘
         │
   ┌─────┴──────┐
   ▼            ▼
scraper.ts   price-checker.ts
   │            │
   └─────┬──────┘
         ▼
      db.ts  →  data.db (SQLite)
```

### Luồng chính

1. User bấm **Quét sản phẩm mới** → `POST /api/scrape`.
2. `scrapeAllCategories()` gọi Chợ Tốt API theo danh mục `enabled`.
3. Tin mới (chưa có trong `seen_products`) được insert vào `products`.
4. Lấy batch sản phẩm `checked = 0`, ưu tiên `listed_at` mới nhất.
5. `checkPrice(title + body)` chạy fallback chain AI.
6. Cập nhật `market_price` (bán ra), `deal_price` (nên mua), `profit_margin`, `checked = 1`.
7. UI hiển thị bảng + % chênh lệch.

---

## 4. Cấu trúc thư mục

```text
src/
  app/
    page.tsx                 # Entry page
    client-page.tsx          # dynamic import dashboard, ssr:false
    layout.tsx               # Root layout + metadata
    api/
      scrape/route.ts        # Quét + định giá batch
      products/route.ts      # CRUD list / trash / pagination / search
      categories/route.ts    # Danh mục
      api-keys/route.ts      # Quản lý API key
      cron/route.ts          # Cron in-memory
  components/
    dashboard.tsx            # UI chính (tabs)
    ui/                      # shadcn components
  lib/
    db.ts                    # Schema + helpers SQLite
    scraper.ts               # Chợ Tốt scraper
    price-checker.ts         # Định giá + fallback AI
    utils.ts                 # cn() helper
data.db                      # SQLite (gitignore)
```

---

## 5. Database schema

File: `data.db` (tự tạo khi app chạy lần đầu).

Timezone: dùng `datetime('now', 'localtime')` / parse `+07:00` (giờ VN).

### 5.1 `seen_products`

| Cột | Kiểu | Mô tả |
|---|---|---|
| `chotot_id` | TEXT PK | ID tin Chợ Tốt đã từng quét |
| `first_seen_at` | TEXT | Lần đầu thấy |

**Quy tắc:** Xóa vĩnh viễn trong `products` **không** xóa `seen_products` → lần sau bỏ qua tin cũ.

### 5.2 `categories`

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT | Tên hiển thị |
| `chotot_category_id` | TEXT | Mã `cg` Chợ Tốt (vd: `5010`) |
| `enabled` | INTEGER | 1 = đang theo dõi |

Seed mặc định: Điện thoại (`5010`), Laptop (`5030`), Máy tính bảng (`5040`).

### 5.3 `products`

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | INTEGER PK | |
| `chotot_id` | TEXT UNIQUE | ID tin |
| `title` | TEXT | Tiêu đề |
| `price` | INTEGER | Giá Chợ Tốt (VND) |
| `listed_at` | INTEGER | Timestamp đăng tin (ms) |
| `category` | TEXT | Tên danh mục |
| `image` | TEXT | URL ảnh |
| `url` | TEXT | Link tin |
| `market_price` | INTEGER | TB thị trường = giá nên bán ra |
| `deal_price` | INTEGER | Giá nên deal mua vào để lướt |
| `profit_margin` | REAL | % chênh vs giá bán (market) |
| `created_at` | TEXT | Thời điểm lưu DB (local VN) |
| `checked` | INTEGER | 0 chưa định giá / 1 đã định giá |
| `raw_json` | TEXT | Raw ad JSON (có `body`) |
| `deleted_at` | TEXT NULL | Soft delete |

### 5.4 `api_keys`

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | INTEGER PK | |
| `provider` | TEXT | `gemini` / `groq` / `cloudflare` / `qwen` / `openrouter` |
| `api_key` | TEXT | Key (plain text). Cloudflare: `ACCOUNT_ID\|API_TOKEN` |
| `label` | TEXT | Nhãn tùy chọn |
| `priority` | INTEGER | Thứ tự chạy toàn cục (1 = trước). Kéo thả trên tab API Keys |
| `requests_today` | INTEGER | Số request trong ngày |
| `last_reset` | TEXT | Ngày reset counter |
| `last_error` | TEXT | Lỗi gần nhất |
| `status` | TEXT | `active` / `error` |
| `created_at` | TEXT | |

### 5.5 `settings`

Key-value (vd: `timezone_vn_migrated`).

---

## 6. Module lõi

### 6.1 Scraper — `src/lib/scraper.ts`

- API: `https://gateway.chotot.com/v1/public/ad-listing?cg=<id>&limit=20&o=0&st=s,k`
- Normalize image URL (giữ nguyên nếu đã là `https://`).
- Gọi `insertProduct()` — chỉ insert nếu `chotot_id` chưa có trong `seen_products`.
- Log console: category, URL, số tin mới / skipped.

### 6.2 Price checker — `src/lib/price-checker.ts`

**Prompt (ý chính):**

> Máy cũ này thị trường giá nhiêu, nếu mua đi bán lại thì giá hợp lý để mua là nhiêu, cho biết độ chênh lệch giá thấp nhất thị trường rồi khuyến nghị nên mua không.  
> Dưới đây là thông tin người bán ghi:  
> `title: ...`  
> `content: ...` (body mô tả)

AI trả JSON: `average` → `market_price` (bán), `recommended_buy_price` → `deal_price` (mua). Cùng một `PRICE_PROMPT` cho mọi AI provider. Scrape hỗ trợ: TGDD + Hoàng Hà + tin tương tự Chợ Tốt (HCM).

**Fallback chain:** theo `priority` của từng API key (trên → dưới ở tab API Keys). Scrape thuần là bước cuối nếu mọi key active thất bại.

Provider hỗ trợ: Gemini (`gemini-2.5-flash` + `googleSearch`), Groq (`qwen/qwen3.6-27b`), Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct-fast`, key `ACCOUNT_ID|API_TOKEN`), Qwen (`qwen-turbo`), OpenRouter (`openrouter/free`). Non-Gemini có scrape TGDD hỗ trợ trước khi gọi.

**Công thức margin hiện dùng:**

```text
profit_margin = ((market_price - chotot_price) / market_price) * 100
```

### 6.3 Dashboard — `src/components/dashboard.tsx`

Tabs:

1. **Sản phẩm** — search, filter category, sort, pagination (page size 10), xóa → trash.
2. **Thùng rác** — khôi phục / xóa vĩnh viễn / xóa hết.
3. **Danh mục** — bật/tắt / thêm category.
4. **API Keys** — thêm / xóa / reset status.

SSR: tắt (`dynamic(..., { ssr: false })`) để tránh hydration mismatch do browser extension.

---

## 7. API reference

### `POST /api/scrape`

Quét tất cả category enabled + định giá tối đa 5 sản phẩm chưa check (ưu tiên mới nhất).

Response:

```json
{
  "success": true,
  "newProducts": 12,
  "byCategory": { "Điện thoại": 5, "Laptop": 7 },
  "priceChecked": 3
}
```

### `GET /api/products`

Query:

| Param | Mặc định | Mô tả |
|---|---|---|
| `page` | `1` | Trang |
| `pageSize` | `10` | Số item / trang |
| `category` | — | Lọc danh mục |
| `q` | — | Search title / chotot_id |
| `sortBy` | `created_at` | `created_at` / `profit_margin` / `price` |
| `trash` | — | `1` = lấy thùng rác |

Response:

```json
{
  "items": [...],
  "total": 42,
  "page": 1,
  "pageSize": 10,
  "totalPages": 5
}
```

### `POST /api/products`

Actions:

| action | Body | Mô tả |
|---|---|---|
| `soft-delete` | `{ id }` | Đưa vào thùng rác |
| `restore` | `{ id }` | Khôi phục |
| `hard-delete` | `{ id }` | Xóa vĩnh viễn 1 item |
| `empty-trash` | `{}` | Xóa hết thùng rác |

### `GET/POST /api/categories`

- `GET`: danh sách categories
- `POST action=toggle`: `{ id, enabled }`
- `POST action=add`: `{ name, chotot_category_id }`

### `GET/POST /api/api-keys`

- `GET`: danh sách key đã mask
- `POST action=add`: `{ provider, api_key, label? }`
- `POST action=delete`: `{ id }`
- `POST action=reset`: `{ id }`

### `POST /api/cron`

| action | Body | Mô tả |
|---|---|---|
| `start` | `{ intervalMinutes? }` | Bắt đầu cron (mặc định 10 phút) |
| `stop` | `{}` | Dừng |
| `status` | `{}` | Trạng thái |

> Cron dùng `setInterval` in-memory — mất khi restart process.

---

## 8. Chạy local

```bash
npm install
npm run dev
```

Mở: [http://localhost:3000](http://localhost:3000)

Build production:

```bash
npm run build
npm start
```

### Checklist dùng nhanh

1. Tab **API Keys** → thêm ít nhất 1 key (ưu tiên Gemini).
2. Tab **Danh mục** → bật danh mục cần theo dõi.
3. Tab **Sản phẩm** → **Quét sản phẩm mới**.
4. Xem cột giá thị trường / % chênh lệch / log terminal.

---

## 9. Logging

Prefix console để debug:

| Prefix | Nguồn |
|---|---|
| `[SCRAPER]` | Quét category / URL / tin mới |
| `[PRICE]` | Provider AI / scrape fallback |
| `[API]` | `/api/scrape` |
| `[CRON]` | Job định kỳ |

---

## 10. Quyết định kỹ thuật quan trọng

| Quyết định | Lý do |
|---|---|
| SQLite local | Đơn giản, đủ cho MVP 1 máy |
| `seen_products` tách khỏi `products` | Không quét lại sau hard delete |
| Soft delete | Có thể khôi phục nhầm |
| Client-only dashboard | Tránh hydration lỗi do extension |
| Multi-provider fallback | Giảm phụ thuộc 1 API |
| Prompt kèm title + body | Phân tích tình trạng máy cũ (trầy, lỗi, ...) |
| Giờ VN (`localtime` +07) | Hiển thị thời gian đúng người dùng VN |

---

## 11. Rủi ro & hạn chế

- Chợ Tốt / TGDD đổi HTML hoặc rate-limit → scrape có thể fail.
- Gemini grounding có thể cần billing tier phù hợp.
- API key lưu plain text trong SQLite.
- Cron không bền vững qua restart.
- UI đã có giá deal mua + giá thị trường bán; `should_buy` / `summary` chưa hiện đầy đủ.

---

## 12. Hướng phát triển tiếp

1. Hiển thị `should_buy`, `summary` trên UI.
2. Mã hóa API key at-rest.
3. Cron ngoài process (node-cron script / Windows Task Scheduler / Docker).
4. Thông báo deal tốt (Telegram).
5. Filter theo ngưỡng % lời tối thiểu.
6. Test tự động cho scraper + price-checker parser.
7. Deploy (VPS) với backup `data.db`. → Xem [deploy/README.md](./deploy/README.md).

---

## 13. Changelog kỹ thuật ngắn

- Scrape Chợ Tốt + định giá AI multi-provider.
- Soft/hard delete + empty trash.
- `seen_products` chống quét lại.
- Phân trang server + search.
- Timezone VN.
- Prompt định giá kèm title + nội dung người bán.
- Log console chi tiết khi scrape / check giá.

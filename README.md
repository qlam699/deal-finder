# Chotot Deal Finder — Developer Spec

> Vietnamese version: [`readme-vi.md`](./readme-vi.md)

---

## 1. Overview

### 1.1 Product goals

- Scrape newly posted listings by configurable categories (phones, laptops, etc.).
- Estimate market price using a multi-provider AI fallback chain.
- Compute the % gap between Chợ Tốt price and estimated market price.
- Help users decide whether to buy for resale.
- Manage API keys, categories, and trash directly in the UI.

### 1.2 Current scope (MVP)

- Local Next.js + SQLite app.
- Scrape Chợ Tốt via public gateway API.
- Pricing chain: Gemini → DeepSeek → Qwen → OpenRouter → pure scrape.
- Soft delete / hard delete / empty trash.
- Persistent `seen_products` history so previously seen ads are never re-ingested (even after permanent delete).
- Server-side pagination and search by title / listing ID.

### 1.3 Out of scope (not implemented yet)

- Production multi-user auth / cloud deploy hardening.
- Encrypting API keys at rest.
- Telegram / Email alerts.
- Durable cron outside the Next.js process.

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Base UI) |
| Database | SQLite (`better-sqlite3`), file `data.db` |
| AI | `@google/generative-ai`, `openai` SDK (DeepSeek / Qwen / OpenRouter) |
| Assistive scrape | `cheerio` |
| Local runtime | `npm run dev` / `npm run build` + `npm start` |

---

## 3. Architecture

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

### Main flow

1. User clicks **Scan new products** → `POST /api/scrape`.
2. `scrapeAllCategories()` calls Chợ Tốt API for all enabled categories.
3. New ads (not present in `seen_products`) are inserted into `products`.
4. Fetch unchecked products (`checked = 0`), newest `listed_at` first.
5. `checkPrice(title + body)` runs the AI fallback chain.
6. Update `market_price`, `profit_margin`, `checked = 1`.
7. UI renders the table with price gap %.

---

## 4. Source layout

```text
src/
  app/
    page.tsx                 # Entry page
    client-page.tsx          # dynamic dashboard import, ssr:false
    layout.tsx               # Root layout + metadata
    api/
      scrape/route.ts        # Scan + batch pricing
      products/route.ts      # List / trash / pagination / search
      categories/route.ts    # Category management
      api-keys/route.ts      # API key management
      cron/route.ts          # In-memory cron
  components/
    dashboard.tsx            # Main UI (tabs)
    ui/                      # shadcn components
  lib/
    db.ts                    # SQLite schema + helpers
    scraper.ts               # Chợ Tốt scraper
    price-checker.ts         # Pricing + AI fallback
    utils.ts                 # cn() helper
data.db                      # SQLite (gitignored)
```

---

## 5. Database schema

File: `data.db` (auto-created on first run).

Timezone: `datetime('now', 'localtime')` and UI parse with `+07:00` (Vietnam time).

### 5.1 `seen_products`

| Column | Type | Description |
|---|---|---|
| `chotot_id` | TEXT PK | Listing ID already seen |
| `first_seen_at` | TEXT | First seen timestamp |

**Rule:** Hard-deleting a row from `products` does **not** remove `seen_products`, so the same listing will not be scraped again.

### 5.2 `categories`

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT | Display name |
| `chotot_category_id` | TEXT | Chợ Tốt `cg` id (e.g. `5010`) |
| `enabled` | INTEGER | 1 = tracking |

Default seed: Phones (`5010`), Laptops (`5020`), Tablets (`5030`).

### 5.3 `products`

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | |
| `chotot_id` | TEXT UNIQUE | Listing ID |
| `title` | TEXT | Title |
| `price` | INTEGER | Chợ Tốt price (VND) |
| `listed_at` | INTEGER | Listing timestamp (ms) |
| `category` | TEXT | Category name |
| `image` | TEXT | Image URL |
| `url` | TEXT | Listing URL |
| `market_price` | INTEGER | Estimated market price |
| `profit_margin` | REAL | Gap % |
| `created_at` | TEXT | DB insert time (VN local) |
| `checked` | INTEGER | 0 = not priced / 1 = priced |
| `raw_json` | TEXT | Raw ad JSON (includes `body`) |
| `deleted_at` | TEXT NULL | Soft delete marker |

### 5.4 `api_keys`

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | |
| `provider` | TEXT | `gemini` / `deepseek` / `qwen` / `openrouter` |
| `api_key` | TEXT | Key (plain text in MVP) |
| `label` | TEXT | Optional label |
| `priority` | INTEGER | Order within provider |
| `requests_today` | INTEGER | Daily request counter |
| `last_reset` | TEXT | Counter reset date |
| `last_error` | TEXT | Last error |
| `status` | TEXT | `active` / `error` |
| `created_at` | TEXT | |

### 5.5 `settings`

Key-value store (e.g. `timezone_vn_migrated`).

---

## 6. Core modules

### 6.1 Scraper — `src/lib/scraper.ts`

- Endpoint: `https://gateway.chotot.com/v1/public/ad-listing?cg=<id>&limit=20&o=0&st=s,k`
- Normalizes image URLs (keeps absolute `https://` as-is).
- Calls `insertProduct()` — inserts only if `chotot_id` is not already in `seen_products`.
- Console logs: category, URL, new/skipped counts.

### 6.2 Price checker — `src/lib/price-checker.ts`

**Prompt intent (Vietnamese):**

> How much is this used device on the market? What is a reasonable buy price for resale? Report the gap vs the lowest market price and recommend whether to buy. Keep the answer short.  
> Seller information:  
> `title: ...`  
> `content: ...` (listing body)

Expected JSON fields: `min`, `max`, `average`, `recommended_buy_price`, `min_gap_percent`, `should_buy`, `summary`, `sources`.

**Fallback chain:**

1. Gemini (`gemini-2.5-flash` + `googleSearch`)
2. DeepSeek (`deepseek-chat`) + helper scrape
3. Qwen (`qwen-turbo`) + helper scrape
4. OpenRouter (`openrouter/free`) + helper scrape
5. Pure scrape via cheerio

**Margin formula currently used:**

```text
profit_margin = ((market_price - chotot_price) / market_price) * 100
```

### 6.3 Dashboard — `src/components/dashboard.tsx`

Tabs:

1. **Products** — search, category filter, sort, pagination (page size 10), move to trash.
2. **Trash** — restore / hard delete / empty trash.
3. **Categories** — enable/disable / add categories.
4. **API Keys** — add / delete / reset status.

SSR is disabled (`dynamic(..., { ssr: false })`) to avoid hydration mismatches caused by browser extensions.

---

## 7. API reference

### `POST /api/scrape`

Scans all enabled categories and prices up to 5 unchecked products (newest first).

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

Query params:

| Param | Default | Description |
|---|---|---|
| `page` | `1` | Page number |
| `pageSize` | `10` | Items per page |
| `category` | — | Category filter |
| `q` | — | Search title / chotot_id |
| `sortBy` | `created_at` | `created_at` / `profit_margin` / `price` |
| `trash` | — | `1` = trash list |

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

| action | Body | Description |
|---|---|---|
| `soft-delete` | `{ id }` | Move to trash |
| `restore` | `{ id }` | Restore from trash |
| `hard-delete` | `{ id }` | Permanently delete one item |
| `empty-trash` | `{}` | Permanently delete all trashed items |

### `GET/POST /api/categories`

- `GET`: list categories
- `POST action=toggle`: `{ id, enabled }`
- `POST action=add`: `{ name, chotot_category_id }`

### `GET/POST /api/api-keys`

- `GET`: masked key list
- `POST action=add`: `{ provider, api_key, label? }`
- `POST action=delete`: `{ id }`
- `POST action=reset`: `{ id }`

### `POST /api/cron`

| action | Body | Description |
|---|---|---|
| `start` | `{ intervalMinutes? }` | Start cron (default 10 minutes) |
| `stop` | `{}` | Stop |
| `status` | `{}` | Status |

> Cron uses in-memory `setInterval` and is lost on process restart.

---

## 8. Local development

```bash
npm install
npm run dev
```

Open: [http://localhost:3000](http://localhost:3000)

Production build:

```bash
npm run build
npm start
```

### Quick start checklist

1. **API Keys** tab → add at least one key (Gemini preferred).
2. **Categories** tab → enable categories to track.
3. **Products** tab → click **Scan new products**.
4. Review market price / gap % and terminal logs.

---

## 9. Logging

Console prefixes:

| Prefix | Source |
|---|---|
| `[SCRAPER]` | Category/URL/new listing logs |
| `[PRICE]` | AI provider / scrape fallback |
| `[API]` | `/api/scrape` |
| `[CRON]` | Periodic job |

---

## 10. Key technical decisions

| Decision | Why |
|---|---|
| Local SQLite | Simple enough for single-machine MVP |
| Separate `seen_products` | Prevent re-scraping after hard delete |
| Soft delete | Allow accidental-delete recovery |
| Client-only dashboard | Avoid extension-induced hydration errors |
| Multi-provider fallback | Reduce single-API dependency |
| Prompt includes title + body | Factor in scratches, defects, accessories |
| VN timezone (`localtime` +07) | Correct local time display |

---

## 11. Risks & limitations

- Upstream HTML/API changes or rate limits can break scrapers.
- Gemini grounding may require an eligible billing tier.
- API keys are stored as plain text in SQLite.
- Cron is not durable across restarts.
- UI currently focuses on `average` / margin; richer AI fields (`should_buy`, `summary`) are not fully surfaced yet.

---

## 12. Suggested next steps

1. Show `should_buy`, `summary`, and `recommended_buy_price` in the UI.
2. Encrypt API keys at rest.
3. Move cron outside Next.js (standalone script / scheduler / Docker).
4. Add deal alerts (Telegram).
5. Filter by minimum profit threshold.
6. Add automated tests for scraper + JSON price parser.
7. Deploy to a VPS with `data.db` backups.

---

## 13. Short technical changelog

- Chợ Tốt scraping + multi-provider AI pricing.
- Soft/hard delete + empty trash.
- `seen_products` anti-rescan history.
- Server pagination + search.
- Vietnam timezone support.
- Pricing prompt with seller title + body.
- Detailed scrape/price console logging.

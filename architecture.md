# Project Architecture

## 1. Project Overview

- Project name: `olddevice-chotot` (Chotot Deal Finder)
- Purpose: Scrape Chợ Tốt listings, estimate market price via AI, surface deals with enough margin for resale
- Main users: Single operator (local / VPS); no multi-user auth yet
- Main business domains: Listing scrape, AI pricing, deal publish filter, category/API-key management, trash
- Current architecture status: MVP running as Next.js App Router + SQLite; production at `https://deal.codayroi.com`
- Last verified: 2026-09-22 (code + README + deploy docs)

## 2. Technology Stack

### Frontend

- Framework: Next.js 16 (App Router)
- Language: TypeScript
- UI libraries: React 19, Tailwind CSS 4, shadcn/ui (Base UI), lucide-react
- State management: Client component local state in `dashboard.tsx` (no global store)
- Build tool: Next.js / npm
- Testing: None automated yet (noted as suggested next step in README)

### Backend

- Framework: Next.js Route Handlers (`src/app/api/*/route.ts`)
- Language: TypeScript
- Runtime: Node.js (CI uses Node 22)
- API style: REST JSON route handlers
- Testing: None automated yet

### Data and Infrastructure

- Database: SQLite via `better-sqlite3` (`data.db`; WAL mode)
- Cache: None
- Message queue: None (in-process background jobs + `setInterval` cron)
- Storage: Local / VPS filesystem; prod DB under `DATA_DIR` (`/var/lib/deal`)
- Deployment: GitHub Actions build → SCP tarball → systemd on Webinoly VPS
- CI/CD: `.github/workflows/deploy.yml` (push to `main` or workflow_dispatch)
- Monitoring: systemd journal (`journalctl -u deal-codayroi`)

## 3. Repository Structure

```text
src/
  app/
    page.tsx                 # Server entry
    client-page.tsx          # dynamic(..., { ssr: false }) dashboard
    layout.tsx               # Root layout + metadata
    api/
      scrape/route.ts        # Start scrape/pricing job
      products/route.ts      # List / trash / soft-hard delete
      products/check-price/  # On-demand price check job
      products/check-existence/ # Listing still-alive check job
      categories/route.ts
      api-keys/route.ts
      cron/route.ts          # Start/stop/status in-process cron
  components/
    dashboard.tsx            # Main UI (tabs)
    ui/                      # shadcn primitives
  lib/
    db.ts                    # Schema, migrations, CRUD, scrape settings
    scraper.ts               # Chợ Tốt gateway scrape + deal fill
    price-checker.ts         # Multi-provider AI pricing chain
    background-job.ts        # Scrape + price + publish/discard job + cron
    price-check-jobs.ts      # Per-product price-check background state
    listing-check-jobs.ts    # Existence-check background state
    utils.ts                 # cn()
deploy/                      # systemd unit + deploy README
scripts/                     # VPS setup, release deploy, nginx fix
.github/workflows/deploy.yml
data.db                      # Local SQLite (gitignored); not in release tarball
```

## 4. System Architecture

```text
Dashboard (client-only)
  -> Next.js API routes
       -> background-job / price-check-jobs / listing-check-jobs
       -> scraper.ts / price-checker.ts
       -> db.ts -> data.db (SQLite)
```

Include:

- Entry points: `src/app/page.tsx` → `client-page.tsx` → `dashboard.tsx`
- Application layers: UI → API routes → lib services → SQLite
- Service boundaries: scrape, price check, publish/discard, category/key CRUD, cron
- Shared modules: `src/lib/db.ts` is the shared persistence layer
- External integrations: Chợ Tốt public gateway; Gemini / Groq / Cloudflare / Qwen / OpenRouter; assistive scrape (cheerio) for non-Gemini providers
- Background jobs: in-memory job flags + optional `setInterval` cron; job status also persisted to `settings.job_status`
- Authentication and authorization: none (open local/VPS app)

## 5. Main Data Flow

### Scrape + price + publish

```text
User (or cron) triggers scrape
 -> POST /api/scrape or /api/cron
 -> runScrapeJob() in background-job.ts
 -> scrapeAllCategoriesForDeals() / fillCategoryPublishedDeals()
 -> insertProduct() if chotot_id not in seen_products
 -> AI checkPrice() for unpublished / unchecked rows
 -> publishOrDiscardAfterPriceCheck(minMarginPercent)
      published=1 kept in list
      else hard-delete product row (seen_products retained)
 -> Dashboard GET /api/products (published=1 only)
```

### Soft delete / trash

```text
UI soft-delete
 -> POST /api/products action=soft-delete
 -> products.deleted_at set
 -> Trash tab lists deleted_at IS NOT NULL
 -> restore | hard-delete | empty-trash
```

Hard delete does **not** remove `seen_products`, so the listing is not re-ingested.

## 6. Important Modules

### Database (`db.ts`)

- Responsibility: SQLite connection, schema/migrations, products/categories/keys/settings helpers, scrape settings, publish/discard
- Entry point: `getDb()`
- Important files: `src/lib/db.ts`
- Dependencies: `better-sqlite3`, `DATA_DIR` env
- Used by: all API routes and job modules
- Notes: DB path is `DATA_DIR/data.db` in production, else `cwd/data.db`

### Scraper (`scraper.ts`)

- Responsibility: Fetch Chợ Tốt ads by enabled categories; insert new candidates
- Entry point: `scrapeAllCategoriesForDeals`, `fillCategoryPublishedDeals`
- Important files: `src/lib/scraper.ts`
- Dependencies: Chợ Tốt gateway API, `db.insertProduct`
- Used by: `background-job.ts`
- Notes: Default scrape limit 5 (clamp 1–50); settings include personal-only and price range filters

### Price checker (`price-checker.ts`)

- Responsibility: Estimate market/deal prices via ordered API-key fallback; scrape-assist then AI
- Entry point: `checkPrice`, `scrapeDataForAI`
- Important files: `src/lib/price-checker.ts`
- Dependencies: provider SDKs, `db` key rotation helpers
- Used by: `background-job.ts`, price-check jobs
- Notes: Margin formula `((market_price - chotot_price) / market_price) * 100`

### Background job (`background-job.ts`)

- Responsibility: Orchestrate scrape → price → publish/discard; cron start/stop/status
- Entry point: `runScrapeJob`, `startCron`, `stopCron`, `getJobStatus`
- Important files: `src/lib/background-job.ts`
- Dependencies: scraper, price-checker, db
- Used by: `/api/scrape`, `/api/cron`
- Notes: Cron is in-process `setInterval`; lost on process restart unless restarted via API

### Dashboard (`dashboard.tsx`)

- Responsibility: Products / Trash / Categories / API Keys UI
- Entry point: dynamic import from `client-page.tsx` with `ssr: false`
- Important files: `src/components/dashboard.tsx`
- Dependencies: product/category/key/cron APIs
- Used by: home page
- Notes: SSR disabled to avoid browser-extension hydration mismatches

### Deploy

- Responsibility: CI build artifact, VPS extract + systemd restart, Webinoly proxy
- Entry point: `.github/workflows/deploy.yml`, `scripts/deploy.sh`
- Important files: `deploy/README.md`, `deploy/deal-codayroi.service`, `scripts/*`
- Dependencies: GitHub secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
- Used by: production releases on `main`
- Notes: App code wiped each release; SQLite lives in `/var/lib/deal`

## 7. Data Model

File: `data.db` (auto-created). Timestamps use `datetime('now', 'localtime')`; UI treats VN time (`+07:00`).

### `seen_products`

- `chotot_id` TEXT PK
- `first_seen_at` TEXT
- Rule: survives hard delete of `products` → no re-scrape

### `categories`

- `id`, `name`, `chotot_category_id`, `enabled`
- Default seed: Phones `5010`, Laptops `5030`, Tablets `5040`

### `products`

- Core listing fields: `chotot_id`, `title`, `price`, `listed_at`, `category`, `image`, `url`
- Pricing: `market_price`, `deal_price`, `profit_margin`, `checked`
- Visibility: `published` (only published deals shown in main list), `deleted_at` (soft delete)
- Extra: `company_ad`, `content`, `raw_json`

### `api_keys`

- `provider`, `api_key` (plain text), `label`, `priority`, usage/error/status fields
- Providers: `gemini` / `groq` / `cloudflare` / `qwen` / `openrouter`
- Cloudflare key format: `ACCOUNT_ID|API_TOKEN`

### `settings`

- Key-value store
- Known keys: `scrape_settings` (JSON: `personalOnly`, `minPrice`, `maxPrice`, `minMarginPercent`), `job_status`, migration flags

### Scrape settings defaults (code)

- `personalOnly: true`
- `minPrice: 100000`
- `maxPrice: 60000000`
- `minMarginPercent: 10`

## 8. APIs and Integrations

### `POST /api/scrape`

- Purpose: Run scrape + pricing job (async/in-process)
- Source: `src/app/api/scrape/route.ts`
- Authentication: none
- Request flow: start `runScrapeJob`
- Response flow: job accepted / status
- Error handling: job `lastError` in status
- Important files: `background-job.ts`

### `GET/POST /api/products`

- Purpose: Paginated list/search; soft-delete / restore / hard-delete / empty-trash
- Source: `src/app/api/products/route.ts`
- Query params: `page`, `pageSize`, `category`, `q`, `sortBy`, `trash`
- Important files: `db.getProducts`, trash helpers

### `POST /api/products/check-price` / `check-existence`

- Purpose: Background per-product or batch listing maintenance jobs
- Source: `src/app/api/products/check-price/route.ts`, `check-existence/route.ts`
- Important files: `price-check-jobs.ts`, `listing-check-jobs.ts`

### `GET/POST /api/categories`

- Purpose: List / toggle / add categories
- Source: `src/app/api/categories/route.ts`

### `GET/POST /api/api-keys`

- Purpose: List (masked) / add / delete / reset / reorder priorities
- Source: `src/app/api/api-keys/route.ts`

### `POST /api/cron`

- Purpose: `start` / `stop` / `status` for in-memory cron
- Source: `src/app/api/cron/route.ts`
- Notes: Default interval 10 minutes; scrape limit configurable

### Chợ Tốt gateway

- Purpose: Public ad listing feed
- Source: `https://gateway.chotot.com/v1/public/ad-listing?...`
- Authentication: public
- Important files: `src/lib/scraper.ts`

### AI providers

- Purpose: Market/deal price JSON estimation
- Authentication: keys in `api_keys` table
- Request flow: priority-ordered keys; scrape-assist for non-Gemini; scrape-only last resort
- Important files: `src/lib/price-checker.ts`

## 9. Configuration

Document:

- Environment variables:
  - `DATA_DIR` — directory containing `data.db` (production: `/var/lib/deal`)
  - Standard Next.js / Node runtime vars as needed by host
- Configuration files: `next.config.ts`, `package.json`, `components.json`, `deploy/deal-codayroi.service`
- Feature flags: none formal; scrape filters live in `settings.scrape_settings`
- Runtime profiles: `npm run dev` | `npm run build` + `npm start` | systemd `deal-codayroi`
- Secrets handling: API keys stored plaintext in SQLite (not encrypted); VPS SSH key only in GitHub Secrets — never commit secrets

## 10. Development Workflow

- Setup: `npm install`
- Build: `npm run build`
- Test: no project test script yet
- Lint: `npm run lint`
- Run locally: `npm run dev` → http://localhost:3000
- Database migration: inline `ALTER TABLE` / settings flags in `initSchema()` on first open
- Deployment: push `main` → Actions packs `.next` + prod `node_modules` → SCP → `scripts/deploy.sh --release`
- Branch conventions: production deploys from `main`

## 11. Conventions and Constraints

Document confirmed:

- Coding conventions: TypeScript App Router; `@/` path alias to `src/`
- Naming rules: route folders match resource names; lib modules are kebab-case files
- Architectural boundaries: UI must not open SQLite directly; go through API → `db.ts`
- Security requirements: no auth yet; treat VPS as trusted single-operator; do not log raw API keys
- Compatibility requirements: Next.js 16 APIs may differ from older training data — check `node_modules/next/dist/docs/` / `AGENTS.md`
- Performance constraints: default scrape/price batch size 5; cron not durable
- Known technical limitations: plaintext keys; upstream scrape fragility; richer AI fields (`should_buy`, `summary`) not fully surfaced in UI

## 12. Known Risks and Technical Debt

### Upstream scrape / rate limits

- Description: Chợ Tốt HTML/API changes or rate limits can break ingestion
- Impact: No new deals
- Related files: `src/lib/scraper.ts`, assistive scrape in `price-checker.ts`
- Possible solution: Monitor logs; adapt selectors/endpoints; backoff
- Verification status: Documented in README

### Plaintext API keys

- Description: Keys stored in SQLite without encryption
- Impact: DB file compromise exposes provider credentials
- Related files: `src/lib/db.ts`, `api_keys` table
- Possible solution: Encrypt at rest
- Verification status: Confirmed limitation

### Non-durable cron

- Description: In-process `setInterval` lost on restart
- Impact: Scheduled scans stop until manually restarted
- Related files: `src/lib/background-job.ts`, `/api/cron`
- Possible solution: systemd timer / external cron / `node-cron` supervised process
- Verification status: Confirmed in code + README

### Missing automated tests

- Description: No scraper/parser/job tests
- Impact: Regressions harder to catch
- Related files: pricing JSON parse, publish/discard logic
- Possible solution: Unit tests for parser + margin publish rules
- Verification status: Suggested in README

## 13. Architectural Decisions

### Local SQLite MVP

- Context: Single-operator deal finder
- Decision: File SQLite with `better-sqlite3`
- Reason: Simple persistence, zero external DB ops
- Alternatives: Postgres, remote DB
- Impact: Easy local/VPS deploy; limited multi-instance scaling
- Evidence: `src/lib/db.ts`, README
- Date recorded: 2026-09-22

### Separate `seen_products`

- Context: Hard-deleted ads should not reappear after rescrape
- Decision: Persistent seen history independent of `products`
- Reason: Anti-rescan after permanent delete or discard
- Alternatives: Soft-only history on products
- Impact: Disk growth of IDs; no accidental re-ingest
- Evidence: `insertProduct` / README rule
- Date recorded: 2026-09-22

### Publish only after margin threshold

- Context: Noise of non-deals in the main list
- Decision: `published` flag + `publishOrDiscardAfterPriceCheck(minMarginPercent)`
- Reason: Keep UI focused on actionable flips
- Alternatives: Show all priced listings with filters only
- Impact: Unpublished/no-deal rows are hard-deleted from `products` but remain in `seen_products`
- Evidence: `src/lib/db.ts`, `background-job.ts`
- Date recorded: 2026-09-22

### Client-only dashboard

- Context: Browser extensions caused hydration mismatches
- Decision: `dynamic(..., { ssr: false })`
- Reason: Avoid SSR/client HTML mismatch
- Alternatives: Suppress hydration warnings; CSP
- Impact: Slightly slower first paint; simpler UI correctness
- Evidence: `src/app/client-page.tsx`, README
- Date recorded: 2026-09-22

### CI-built release tarball (no VPS build)

- Context: Same pattern as bacpq; VPS should stay thin
- Decision: GitHub Actions builds and SCPs artifact; `DATA_DIR` persists DB
- Reason: Faster, reproducible Linux amd64 builds
- Alternatives: Build on VPS
- Impact: App dir wiped each deploy; DB must stay outside `APP_DIR`
- Evidence: `deploy/README.md`, `.github/workflows/deploy.yml`
- Date recorded: 2026-09-22

## 14. Open Questions

- [ ] Should cron auto-start on process boot in production?
  - Context: In-memory cron currently requires API start after restart
  - How to verify: Inspect systemd unit and boot behavior on VPS; decide start-on-boot vs external timer

- [ ] Are `should_buy` / `summary` AI fields still returned but unused in UI?
  - Context: README lists as incomplete UI surface
  - How to verify: Inspect `checkPrice` response shape and `dashboard.tsx` columns

- [ ] Exact request body contracts for newer routes (`check-price`, `check-existence`, scrape settings save)
  - Context: README API section may lag code
  - How to verify: Read corresponding `route.ts` files when needed for a task

## 15. Verification History

| Date | Area | Verified by | Evidence |
|---|---|----|----|
| 2026-09-22 | Overview / stack / layout | README + `package.json` + `src/` tree | `README.md`, `package.json` |
| 2026-09-22 | Schema + publish/discard | Code inspection | `src/lib/db.ts` |
| 2026-09-22 | Job / cron orchestration | Code inspection | `src/lib/background-job.ts` |
| 2026-09-22 | Deploy path | Deploy docs + workflow | `deploy/README.md`, `.github/workflows/deploy.yml` |
| 2026-09-22 | Extra API routes | Glob | `src/app/api/products/check-*` |

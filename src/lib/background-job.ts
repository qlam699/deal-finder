import { scrapeAllCategoriesForDeals, type NewProductCandidate } from "@/lib/scraper";
import {
  getUnpublishedProductIds,
  getDb,
  publishOrDiscardAfterPriceCheck,
  MIN_PUBLISH_MARGIN_PERCENT,
} from "@/lib/db";
import { checkPrice } from "@/lib/price-checker";

export type JobStatus = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  lastResult: {
    newProducts: number;
    byCategory: Record<string, number>;
    priceChecked: number;
    published: number;
    discarded: number;
  } | null;
  mode: "idle" | "once" | "cron";
  cronRunning: boolean;
  intervalMinutes: number | null;
  scrapeLimit: number | null;
};

let jobRunning = false;
let cronInterval: ReturnType<typeof setInterval> | null = null;
let cronIntervalMinutes: number | null = null;
let cronScrapeLimit = 5;

const DEFAULT_SCRAPE_LIMIT = 5;
const MAX_SCRAPE_LIMIT = 50;

export function clampScrapeLimit(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_SCRAPE_LIMIT;
  return Math.min(MAX_SCRAPE_LIMIT, Math.max(1, v));
}

let status: JobStatus = {
  running: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  lastResult: null,
  mode: "idle",
  cronRunning: false,
  intervalMinutes: null,
  scrapeLimit: null,
};

function persistStatus() {
  try {
    getDb()
      .prepare(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('job_status', ?)",
      )
      .run(JSON.stringify(status));
  } catch (err) {
    console.error("[JOB] Failed to persist status", err);
  }
}

export function getJobStatus(): JobStatus {
  return {
    ...status,
    cronRunning: !!cronInterval,
    intervalMinutes: cronIntervalMinutes,
    scrapeLimit: cronInterval ? cronScrapeLimit : status.scrapeLimit,
  };
}

function extractSellerDescription(product: { content?: string | null; raw_json?: string }): string {
  if (product.content?.trim()) return product.content;
  if (!product.raw_json) return "";
  try {
    const raw = JSON.parse(product.raw_json) as { body?: string };
    return raw.body || "";
  } catch {
    return "";
  }
}

async function evaluateProduct(
  product: NewProductCandidate & { checked?: number },
): Promise<"published" | "discarded"> {
  if (!product.checked) {
    console.log(`[JOB] price-check product_id=${product.id} title="${product.title}"`);
    const sellerDescription = extractSellerDescription(product);
    await checkPrice(product.id, product.title, product.price, sellerDescription);
  }

  const outcome = publishOrDiscardAfterPriceCheck(product.id);
  if (outcome === "published") {
    console.log(
      `[JOB] PUBLISHED product_id=${product.id} (margin > ${MIN_PUBLISH_MARGIN_PERCENT}%)`,
    );
  } else {
    console.log(
      `[JOB] DISCARDED product_id=${product.id} (no deal / margin ≤ ${MIN_PUBLISH_MARGIN_PERCENT}%) — kept in seen_products only`,
    );
  }
  return outcome;
}

export async function runScrapeJob(opts?: {
  mode?: "once" | "cron";
  limitPerCategory?: number;
}): Promise<void> {
  if (jobRunning) {
    console.log("[JOB] Skip start: already running");
    return;
  }

  const targetPublishedPerCategory = clampScrapeLimit(
    opts?.limitPerCategory ?? (opts?.mode === "cron" ? cronScrapeLimit : DEFAULT_SCRAPE_LIMIT),
  );

  jobRunning = true;
  status = {
    ...getJobStatus(),
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastError: null,
    mode: opts?.mode || "once",
    scrapeLimit: targetPublishedPerCategory,
  };
  persistStatus();

  console.log(
    `[JOB] Started mode=${status.mode} targetPublishedPerCategory=${targetPublishedPerCategory}`,
  );

  try {
    let priceChecked = 0;
    let published = 0;
    let discarded = 0;

    // Recover unpublished leftovers from an interrupted previous run.
    const pendingIds = getUnpublishedProductIds();
    if (pendingIds.length > 0) {
      const pending = getDb()
        .prepare(
          `SELECT id, title, price, content, raw_json, category, checked FROM products WHERE id IN (${pendingIds.map(() => "?").join(",")}) AND deleted_at IS NULL`,
        )
        .all(...pendingIds) as (NewProductCandidate & { checked: number })[];

      console.log(`[JOB] Recover pending unpublished=${pending.length}`);
      for (const product of pending) {
        const beforeChecked = product.checked;
        const outcome = await evaluateProduct(product);
        if (!beforeChecked) priceChecked++;
        if (outcome === "published") published++;
        else discarded++;
      }
    }

    const scrapeResult = await scrapeAllCategoriesForDeals(
      targetPublishedPerCategory,
      async (product) => {
        const outcome = await evaluateProduct(product);
        priceChecked++;
        if (outcome === "published") published++;
        else discarded++;
        return outcome;
      },
    );

    status.lastResult = {
      newProducts: scrapeResult.totalNew,
      byCategory: scrapeResult.byCategory,
      priceChecked,
      published,
      discarded,
    };
    console.log(
      `[JOB] Done newProducts=${scrapeResult.totalNew} priceChecked=${priceChecked} published=${published} discarded=${discarded} byCategory=${JSON.stringify(scrapeResult.byCategory)}`,
    );
  } catch (err) {
    status.lastError = String(err);
    console.error("[JOB] Error", err);
  } finally {
    jobRunning = false;
    status.running = false;
    status.finishedAt = new Date().toISOString();
    status.mode = cronInterval ? "cron" : "idle";
    persistStatus();
  }
}

export function startCron(
  intervalMinutes = 10,
  limitPerCategory = DEFAULT_SCRAPE_LIMIT,
): JobStatus {
  const minutes = Math.max(1, intervalMinutes);
  cronScrapeLimit = clampScrapeLimit(limitPerCategory);
  if (cronInterval) clearInterval(cronInterval);
  cronIntervalMinutes = minutes;
  cronInterval = setInterval(
    () => {
      void runScrapeJob({ mode: "cron", limitPerCategory: cronScrapeLimit });
    },
    minutes * 60 * 1000,
  );

  status.cronRunning = true;
  status.intervalMinutes = minutes;
  status.scrapeLimit = cronScrapeLimit;
  status.mode = "cron";
  persistStatus();
  console.log(
    `[JOB] Cron started intervalMinutes=${minutes} targetPublishedPerCategory=${cronScrapeLimit}`,
  );

  void runScrapeJob({ mode: "cron", limitPerCategory: cronScrapeLimit });
  return getJobStatus();
}

export function stopCron(): JobStatus {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
  }
  cronIntervalMinutes = null;
  status.cronRunning = false;
  status.intervalMinutes = null;
  status.scrapeLimit = null;
  if (!jobRunning) status.mode = "idle";
  persistStatus();
  console.log("[JOB] Cron stopped");
  return getJobStatus();
}

export function isJobRunning(): boolean {
  return jobRunning;
}

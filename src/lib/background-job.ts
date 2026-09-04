import { scrapeAllCategories } from "@/lib/scraper";
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
};

let jobRunning = false;
let cronInterval: ReturnType<typeof setInterval> | null = null;
let cronIntervalMinutes: number | null = null;

let status: JobStatus = {
  running: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  lastResult: null,
  mode: "idle",
  cronRunning: false,
  intervalMinutes: null,
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

export async function runScrapeJob(opts?: {
  mode?: "once" | "cron";
}): Promise<void> {
  if (jobRunning) {
    console.log("[JOB] Skip start: already running");
    return;
  }

  jobRunning = true;
  status = {
    ...getJobStatus(),
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastError: null,
    mode: opts?.mode || "once",
  };
  persistStatus();

  console.log(`[JOB] Started mode=${status.mode}`);

  try {
    const scrapeResult = await scrapeAllCategories();
    // Recover unpublished leftovers from an interrupted previous run.
    const pendingIds = getUnpublishedProductIds();
    const queueIds = [...new Set([...scrapeResult.newProductIds, ...pendingIds])];

    const toPrice = getDb()
      .prepare(
        queueIds.length === 0
          ? "SELECT * FROM products WHERE 0"
          : `SELECT * FROM products WHERE id IN (${queueIds.map(() => "?").join(",")}) AND deleted_at IS NULL`,
      )
      .all(...queueIds) as {
      id: number;
      title: string;
      price: number;
      content?: string;
      raw_json?: string;
      checked: number;
    }[];

    console.log(
      `[JOB] Fetched new from Chotot=${scrapeResult.newProductIds.length}, pending=${pendingIds.length}, AI queue=${toPrice.length} (publish if margin > ${MIN_PUBLISH_MARGIN_PERCENT}%)`,
    );

    let priceChecked = 0;
    let published = 0;
    let discarded = 0;

    for (const product of toPrice) {
      if (!product.checked) {
        console.log(`[JOB] price-check product_id=${product.id} title="${product.title}"`);
        const sellerDescription = extractSellerDescription(product);
        const success = await checkPrice(
          product.id,
          product.title,
          product.price,
          sellerDescription,
        );
        if (success) priceChecked++;
      }

      const outcome = publishOrDiscardAfterPriceCheck(product.id);
      if (outcome === "published") {
        published++;
        console.log(
          `[JOB] PUBLISHED product_id=${product.id} (margin > ${MIN_PUBLISH_MARGIN_PERCENT}%)`,
        );
      } else {
        discarded++;
        console.log(
          `[JOB] DISCARDED product_id=${product.id} (no deal / margin ≤ ${MIN_PUBLISH_MARGIN_PERCENT}%) — kept in seen_products only`,
        );
      }
    }

    status.lastResult = {
      newProducts: scrapeResult.total,
      byCategory: scrapeResult.byCategory,
      priceChecked,
      published,
      discarded,
    };
    console.log(
      `[JOB] Done newProducts=${scrapeResult.total} priceChecked=${priceChecked} published=${published} discarded=${discarded}`,
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

export function startCron(intervalMinutes = 10): JobStatus {
  const minutes = Math.max(1, intervalMinutes);
  if (cronInterval) clearInterval(cronInterval);
  cronIntervalMinutes = minutes;
  cronInterval = setInterval(
    () => {
      void runScrapeJob({ mode: "cron" });
    },
    minutes * 60 * 1000,
  );

  status.cronRunning = true;
  status.intervalMinutes = minutes;
  status.mode = "cron";
  persistStatus();
  console.log(`[JOB] Cron started intervalMinutes=${minutes}`);

  // Run immediately in background
  void runScrapeJob({ mode: "cron" });
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
  if (!jobRunning) status.mode = "idle";
  persistStatus();
  console.log("[JOB] Cron stopped");
  return getJobStatus();
}

export function isJobRunning(): boolean {
  return jobRunning;
}

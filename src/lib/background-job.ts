import { scrapeAllCategories } from "@/lib/scraper";
import { getProductsByIds, getUncheckedProducts, getDb } from "@/lib/db";
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
  priceLimit?: number;
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

  const priceLimit = opts?.priceLimit ?? 10;
  console.log(`[JOB] Started mode=${status.mode} priceLimit=${priceLimit}`);

  try {
    const scrapeResult = await scrapeAllCategories();
    // Prefer newly inserted products; fill remaining slots with unchecked backlog (no market price).
    const newIds = scrapeResult.newProductIds;
    const newSet = new Set(newIds);
    const backlog = getUncheckedProducts(priceLimit * 2) as { id: number }[];
    const backlogIds = backlog.map((p) => p.id).filter((id) => !newSet.has(id));
    const queueIds = [...newIds, ...backlogIds].slice(0, priceLimit);

    const toPrice = getProductsByIds(queueIds) as {
      id: number;
      title: string;
      price: number;
      content?: string;
      raw_json?: string;
    }[];

    console.log(
      `[JOB] New products this run=${scrapeResult.newProductIds.length}, AI queue=${toPrice.length}`,
    );

    let priceChecked = 0;
    for (const product of toPrice) {
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

    status.lastResult = {
      newProducts: scrapeResult.total,
      byCategory: scrapeResult.byCategory,
      priceChecked,
    };
    console.log(
      `[JOB] Done newProducts=${scrapeResult.total} priceChecked=${priceChecked}`,
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
      void runScrapeJob({ priceLimit: 10, mode: "cron" });
    },
    minutes * 60 * 1000,
  );

  status.cronRunning = true;
  status.intervalMinutes = minutes;
  status.mode = "cron";
  persistStatus();
  console.log(`[JOB] Cron started intervalMinutes=${minutes}`);

  // Run immediately in background
  void runScrapeJob({ priceLimit: 10, mode: "cron" });
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

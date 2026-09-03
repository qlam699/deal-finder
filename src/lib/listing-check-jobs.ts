import { getAllActiveProductsForExistenceCheck, softDeleteProduct } from "./db";

type ListingCheckStatus = {
  running: boolean;
  checked: number;
  total: number;
  deleted: number;
  lastError: string | null;
};

const status: ListingCheckStatus = {
  running: false,
  checked: 0,
  total: 0,
  deleted: 0,
  lastError: null,
};

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
};

function isMissingListing(response: Response, html: string): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if ((response.status === 404 || response.status === 410) && contentType.includes("text/html")) {
    return true;
  }
  if (!response.ok) return false;

  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  return [
    "tin đăng không còn tồn tại",
    "tin đăng này đã hết hạn",
    "tin đăng đã hết hạn",
    "tin này không còn tồn tại",
  ].some((phrase) => text.includes(phrase));
}

async function checkUrl(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
    const html = response.ok ? await response.text() : "";
    return isMissingListing(response, html);
  } finally {
    clearTimeout(timeout);
  }
}

export function getListingCheckStatus(): ListingCheckStatus {
  return { ...status };
}

export function startListingCheckBackground(): ListingCheckStatus & { started: boolean } {
  if (status.running) return { started: false, ...getListingCheckStatus() };

  status.running = true;
  status.checked = 0;
  status.total = 0;
  status.deleted = 0;
  status.lastError = null;

  void runListingCheck();
  return { started: true, ...getListingCheckStatus() };
}

async function runListingCheck() {
  try {
    const products = getAllActiveProductsForExistenceCheck();
    status.total = products.length;

    for (const product of products) {
      try {
        if (await checkUrl(product.url)) {
          const result = softDeleteProduct(product.id);
          if (result.changes > 0) status.deleted++;
        }
      } catch (error) {
        console.warn(`[LISTING-CHECK] Skip id=${product.id}:`, error);
      } finally {
        status.checked++;
      }
    }
  } catch (error) {
    status.lastError = String(error);
  } finally {
    status.running = false;
  }
}
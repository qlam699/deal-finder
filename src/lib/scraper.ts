import { getEnabledCategories, insertProduct } from "./db";

const CHOTOT_API = "https://gateway.chotot.com/v1/public/ad-listing";
/** Chợ Tốt region_v2 — Tp Hồ Chí Minh (verify via loadRegions; 12000 is Hà Nội). */
const CHOTOT_REGION_HCM = "13000";

/** Ads fetched per API page while hunting for enough published deals. */
const FETCH_PAGE_SIZE = 20;
/** Stop scanning a category after this many listing rows (seen + new). */
const MAX_SCAN_PER_CATEGORY = 200;

interface ChototAd {
  list_id: number;
  subject: string;
  body?: string;
  price: number;
  category: number;
  category_name?: string;
  image?: string;
  images?: string[];
  list_time?: number;
  region_name?: string;
  area_name?: string;
  /** true = Bán chuyên; absent/false = Cá nhân */
  company_ad?: boolean;
}

interface ChototResponse {
  ads: ChototAd[];
  total: number;
}

export type NewProductCandidate = {
  id: number;
  title: string;
  price: number;
  content?: string;
  raw_json?: string;
  category: string;
};

function normalizeChototImage(image?: string): string | undefined {
  if (!image) return undefined;
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  return `https://cdn.chotot.com/${image.replace(/^\/+/, "")}`;
}

async function fetchCategoryPage(
  categoryId: string,
  limit: number,
  offset: number,
): Promise<ChototAd[]> {
  const url =
    `${CHOTOT_API}?cg=${categoryId}&limit=${limit}&o=${offset}` +
    `&st=s,k&region_v2=${CHOTOT_REGION_HCM}&f=p`;
  console.log(`[SCRAPER] Fetch cg=${categoryId} limit=${limit} o=${offset} url=${url}`);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!res.ok) {
    console.error(`[SCRAPER] Failed cg=${categoryId} status=${res.status} url=${url}`);
    throw new Error(`Chotot API error: ${res.status}`);
  }

  const data: ChototResponse = await res.json();
  return data.ads || [];
}

function ingestAd(ad: ChototAd, categoryName: string): NewProductCandidate | null {
  const imageUrl = normalizeChototImage(ad.image) || normalizeChototImage(ad.images?.[0]);
  const result = insertProduct({
    chotot_id: String(ad.list_id),
    title: ad.subject,
    price: ad.price,
    listed_at: ad.list_time,
    category: categoryName,
    image: imageUrl,
    url: `https://www.chotot.com/${ad.list_id}.htm`,
    content: ad.body || "",
    raw_json: JSON.stringify(ad),
    company_ad: ad.company_ad === true ? 1 : 0,
  });

  if (result.changes > 0 && result.productId) {
    console.log(
      `[SCRAPER] NEW ad_id=${ad.list_id} product_id=${result.productId} title="${ad.subject}"`,
    );
    return {
      id: result.productId,
      title: ad.subject,
      price: ad.price,
      content: ad.body || "",
      raw_json: JSON.stringify(ad),
      category: categoryName,
    };
  }

  console.log(`[SCRAPER] SKIP seen ad_id=${ad.list_id} title="${ad.subject}"`);
  return null;
}

/**
 * Quét danh mục cho đến khi có `targetPublished` tin ĐÃ publish (hợp lệ),
 * hoặc hết tin / đạt trần scan. Mỗi tin mới được evaluate ngay (AI + publish/discard).
 */
export async function fillCategoryPublishedDeals(
  categoryId: string,
  categoryName: string,
  targetPublished: number,
  evaluate: (product: NewProductCandidate) => Promise<"published" | "discarded">,
): Promise<{
  published: number;
  discarded: number;
  newCandidates: number;
  scanned: number;
}> {
  const target = Math.min(50, Math.max(1, Math.floor(targetPublished) || 1));
  console.log(
    `[SCRAPER] Fill category="${categoryName}" cg=${categoryId} targetPublished=${target} seller=personal(f=p)`,
  );

  let published = 0;
  let discarded = 0;
  let newCandidates = 0;
  let scanned = 0;
  let offset = 0;

  while (published < target && scanned < MAX_SCAN_PER_CATEGORY) {
    const pageSize = Math.min(FETCH_PAGE_SIZE, MAX_SCAN_PER_CATEGORY - scanned);
    const ads = await fetchCategoryPage(categoryId, pageSize, offset);
    if (ads.length === 0) {
      console.log(`[SCRAPER] category="${categoryName}" no more ads at o=${offset}`);
      break;
    }

    offset += ads.length;

    for (const ad of ads) {
      if (scanned >= MAX_SCAN_PER_CATEGORY || published >= target) break;
      scanned++;

      const candidate = ingestAd(ad, categoryName);
      if (!candidate) continue;

      newCandidates++;
      const outcome = await evaluate(candidate);
      if (outcome === "published") {
        published++;
        console.log(
          `[SCRAPER] category="${categoryName}" published ${published}/${target} product_id=${candidate.id}`,
        );
      } else {
        discarded++;
      }
    }

    // API returned fewer than requested → end of list
    if (ads.length < pageSize) break;
  }

  console.log(
    `[SCRAPER] Done category="${categoryName}" published=${published}/${target} discarded=${discarded} new=${newCandidates} scanned=${scanned}`,
  );
  return { published, discarded, newCandidates, scanned };
}

export async function scrapeAllCategoriesForDeals(
  targetPublishedPerCategory: number,
  evaluate: (product: NewProductCandidate) => Promise<"published" | "discarded">,
): Promise<{
  totalPublished: number;
  totalDiscarded: number;
  totalNew: number;
  byCategory: Record<string, number>;
}> {
  const target = Math.min(50, Math.max(1, Math.floor(targetPublishedPerCategory) || 1));
  const categories = getEnabledCategories() as {
    id: number;
    name: string;
    chotot_category_id: string;
  }[];
  console.log(
    `[SCRAPER] Start all categories count=${categories.length} targetPublishedPerCategory=${target}`,
  );

  const byCategory: Record<string, number> = {};
  let totalPublished = 0;
  let totalDiscarded = 0;
  let totalNew = 0;

  for (const cat of categories) {
    try {
      const result = await fillCategoryPublishedDeals(
        cat.chotot_category_id,
        cat.name,
        target,
        evaluate,
      );
      byCategory[cat.name] = result.published;
      totalPublished += result.published;
      totalDiscarded += result.discarded;
      totalNew += result.newCandidates;
    } catch (err) {
      console.error(`Error scraping ${cat.name}:`, err);
      byCategory[cat.name] = -1;
    }
  }

  console.log(
    `[SCRAPER] Finished published=${totalPublished} discarded=${totalDiscarded} new=${totalNew}`,
  );
  return { totalPublished, totalDiscarded, totalNew, byCategory };
}

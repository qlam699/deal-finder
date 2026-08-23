import { getEnabledCategories, insertProduct } from "./db";

const CHOTOT_API = "https://gateway.chotot.com/v1/public/ad-listing";
/** Chợ Tốt region_v2 — Tp Hồ Chí Minh (verify via loadRegions; 12000 is Hà Nội). */
const CHOTOT_REGION_HCM = "13000";

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
}

interface ChototResponse {
  ads: ChototAd[];
  total: number;
}

export async function scrapeCategory(
  categoryId: string,
  categoryName: string,
  limit = 5,
): Promise<{ newCount: number; newProductIds: number[] }> {
  const url = `${CHOTOT_API}?cg=${categoryId}&limit=${limit}&o=0&st=s,k&region_v2=${CHOTOT_REGION_HCM}`;
  console.log(`[SCRAPER] Start category="${categoryName}" cg=${categoryId} region=HCM(${CHOTOT_REGION_HCM}) url=${url}`);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!res.ok) {
    console.error(`[SCRAPER] Failed category="${categoryName}" status=${res.status} url=${url}`);
    throw new Error(`Chotot API error: ${res.status}`);
  }

  const data: ChototResponse = await res.json();
  console.log(`[SCRAPER] Fetched category="${categoryName}" ads=${data.ads?.length ?? 0}`);
  let newCount = 0;
  let skippedSeenCount = 0;
  const newProductIds: number[] = [];

  for (const ad of data.ads || []) {
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
    });

    if (result.changes > 0 && result.productId) {
      newCount++;
      newProductIds.push(result.productId);
      console.log(`[SCRAPER] NEW ad_id=${ad.list_id} product_id=${result.productId} title="${ad.subject}"`);
    } else {
      skippedSeenCount++;
      console.log(`[SCRAPER] SKIP seen ad_id=${ad.list_id} title="${ad.subject}"`);
    }
  }

  console.log(
    `[SCRAPER] Done category="${categoryName}" new=${newCount} skipped_seen=${skippedSeenCount}`,
  );
  return { newCount, newProductIds };
}

function normalizeChototImage(image?: string): string | undefined {
  if (!image) return undefined;
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  return `https://cdn.chotot.com/${image.replace(/^\/+/, "")}`;
}

export async function scrapeAllCategories(): Promise<{
  total: number;
  byCategory: Record<string, number>;
  newProductIds: number[];
}> {
  const categories = getEnabledCategories() as { id: number; name: string; chotot_category_id: string }[];
  console.log(`[SCRAPER] Start all categories count=${categories.length}`);
  const byCategory: Record<string, number> = {};
  const newProductIds: number[] = [];
  let total = 0;

  for (const cat of categories) {
    try {
      const result = await scrapeCategory(cat.chotot_category_id, cat.name);
      byCategory[cat.name] = result.newCount;
      total += result.newCount;
      newProductIds.push(...result.newProductIds);
    } catch (err) {
      console.error(`Error scraping ${cat.name}:`, err);
      byCategory[cat.name] = -1;
    }
  }

  console.log(`[SCRAPER] Finished all categories total_new=${total} new_ids=${newProductIds.length}`);
  return { total, byCategory, newProductIds };
}

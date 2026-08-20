import { getEnabledCategories, insertProduct } from "./db";

const CHOTOT_API = "https://gateway.chotot.com/v1/public/ad-listing";

interface ChototAd {
  list_id: number;
  subject: string;
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

export async function scrapeCategory(categoryId: string, categoryName: string, limit = 20): Promise<number> {
  const url = `${CHOTOT_API}?cg=${categoryId}&limit=${limit}&o=0&st=s,k`;
  console.log(`[SCRAPER] Start category="${categoryName}" cg=${categoryId} url=${url}`);

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
      raw_json: JSON.stringify(ad),
    });

    if (result.changes > 0) {
      newCount++;
      console.log(`[SCRAPER] NEW ad_id=${ad.list_id} title="${ad.subject}"`);
    } else {
      skippedSeenCount++;
    }
  }

  console.log(
    `[SCRAPER] Done category="${categoryName}" new=${newCount} skipped_seen=${skippedSeenCount}`,
  );
  return newCount;
}

function normalizeChototImage(image?: string): string | undefined {
  if (!image) return undefined;
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  return `https://cdn.chotot.com/${image.replace(/^\/+/, "")}`;
}

export async function scrapeAllCategories(): Promise<{ total: number; byCategory: Record<string, number> }> {
  const categories = getEnabledCategories() as { id: number; name: string; chotot_category_id: string }[];
  console.log(`[SCRAPER] Start all categories count=${categories.length}`);
  const byCategory: Record<string, number> = {};
  let total = 0;

  for (const cat of categories) {
    try {
      const count = await scrapeCategory(cat.chotot_category_id, cat.name);
      byCategory[cat.name] = count;
      total += count;
    } catch (err) {
      console.error(`Error scraping ${cat.name}:`, err);
      byCategory[cat.name] = -1;
    }
  }

  console.log(`[SCRAPER] Finished all categories total_new=${total}`);
  return { total, byCategory };
}

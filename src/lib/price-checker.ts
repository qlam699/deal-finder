import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import * as cheerio from "cheerio";
import {
  getNextAvailableKey,
  incrementKeyUsage,
  markKeyError,
  markKeyExhaustedToday,
  updateProductPrice,
} from "./db";

interface PriceResult {
  /** Giá bán ra / trung bình thị trường */
  marketPrice: number;
  /** Giá nên deal mua để lướt có lời */
  dealPrice: number;
  sources?: string[];
  provider?: string;
}

interface ApiKeyRow {
  id: number;
  provider: string;
  api_key: string;
  label: string | null;
  priority: number;
  requests_today: number;
}

/** Shared by every AI provider (Gemini / Groq / Cloudflare / Qwen / OpenRouter). */
const PRICE_PROMPT = (sellerInfo: string, listingPrice: number) =>
  `Bạn đang hỗ trợ người mua máy cũ trên Chợ Tốt để LƯỚT (mua vào → bán ra có lời) tại Việt Nam.

Thông tin tin đăng (PHẢI đọc kỹ CẢ title lẫn content/mô tả):
${sellerInfo}
Giá người bán đang rao trên Chợ Tốt (listing): ${listingPrice} VND

Hãy ước lượng và trả JSON duy nhất (không markdown):
1) average = giá thị trường trung bình khi BÁN RA (máy cùng model/cấu hình ở tình trạng TƯƠNG ĐƯƠNG tin này).
2) recommended_buy_price = giá DEAL MUA VÀO bạn nên thương lượng với seller.

ĐIỀU KIỆN / LỖI TỪ TITLE + MÔ TẢ (bắt buộc trừ giá):
- Đọc hết title và content. Mọi chi tiết làm máy kém hơn bản “đẹp/fullbox” đều phải làm average và recommended_buy_price THẤP HƠN so với máy lành tương đương.
- Ví dụ (không giới hạn): hết/pin chai/pin phồng, không pin, sọc/nhám/lóe/cháy màn, màn nứt/cấn, lưng/viền trầy nặng, loa rè, nút liệt, Face ID/Touch ID hỏng, icloud/activation lock, vào nước, máy tháo/ghép linh kiện, thiếu sạc/hộp/phụ kiện, “xác”/chỉ lấy linh kiện, lỗi phần mềm nặng.
- Mức trừ: lỗi nhẹ (trầy thẩm mỹ) trừ ít; lỗi dùng được nhưng khó bán (sọc màn, pin kém) trừ rõ; lỗi nặng / thiếu linh kiện quan trọng (không pin, màn hỏng nặng) average và deal phải thấp hơn nhiều — không lấy giá máy đẹp làm average.
- Nếu title/mô tả mâu thuẫn, ưu tiên mô tả chi tiết và giả định xấu hơn (an toàn cho người lướt).
- Trong "summary" nêu ngắn 1–2 điểm trừ giá đã xét (vd. "sọc màn → trừ deal").

RÀNG BUỘC BẮT BUỘC cho recommended_buy_price:
- Phải ≤ giá Chợ Tốt (listing ${listingPrice}). Đây là giá thương lượng mua vào, không phải giá mua tối đa theo thị trường độc lập.
- Phải thấp hơn average đủ để còn lời hợp lý khi bán lại (không quá đáng với seller), sau khi đã trừ điều kiện/lỗi ở trên.
- Ví dụ: listing 12.000.000, average (bán ra) 13.000.000 → recommended_buy_price khoảng 11.000.000 (lời ~2.000.000 nếu bán 13tr).
- Máy lỗi: listing 8.000.000 nhưng mô tả “không pin / sọc màn” → average phải phản ánh máy lỗi (vd. thấp hơn máy đẹp cùng model), recommended_buy_price ≤ listing và thường thấp hơn nữa để còn biên rủi ro.
- Nếu listing đã rất thấp so với average, recommended_buy_price vẫn ≤ listing (có thể gần bằng listing hoặc thấp hơn một chút để chốt deal).

Format:
{
  "min": <giá thấp nhất thị trường cùng tình trạng, VND>,
  "max": <giá cao nhất thị trường cùng tình trạng, VND>,
  "average": <giá TB bán ra cùng tình trạng, VND>,
  "recommended_buy_price": <giá deal mua vào ≤ listing, VND>,
  "min_gap_percent": <phần trăm (average - recommended_buy_price) / average>,
  "should_buy": <true|false>,
  "summary": "<1 câu: khuyến nghị + điểm trừ giá từ mô tả nếu có>",
  "sources": ["url1", "url2"]
}
Nếu không đủ dữ liệu:
{"min": 0, "max": 0, "average": 0, "recommended_buy_price": 0, "min_gap_percent": 0, "should_buy": false, "summary": "không đủ dữ liệu", "sources": []}`;

/** Clamp deal: luôn ≤ giá Chợ Tốt và (nếu có thể) < giá bán thị trường. */
function normalizeDealPrice(
  marketPrice: number,
  listingPrice: number,
  suggestedDeal?: number,
): number {
  let deal =
    suggestedDeal != null && Number.isFinite(suggestedDeal) && suggestedDeal > 0
      ? Math.round(suggestedDeal)
      : Math.round(Math.min(listingPrice, marketPrice * 0.9));

  // Deal mua ≤ giá đang rao.
  deal = Math.min(deal, listingPrice);

  // Còn biên so với giá bán ra khi listing chưa thấp hơn market.
  if (listingPrice >= marketPrice) {
    deal = Math.min(deal, Math.round(marketPrice * 0.9));
  } else if (deal >= marketPrice) {
    deal = Math.min(listingPrice, Math.round(marketPrice * 0.95));
  }

  if (deal <= 0) deal = Math.min(listingPrice, Math.round(marketPrice * 0.9));
  return deal;
}

// Provider implementations
async function checkWithGemini(
  apiKey: string,
  sellerInfo: string,
  listingPrice: number,
): Promise<PriceResult | null> {
  console.log(`[PRICE] Trying provider=gemini`);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [{ googleSearch: {} } as unknown as import("@google/generative-ai").Tool],
  });

  const result = await model.generateContent(PRICE_PROMPT(sellerInfo, listingPrice));
  const text = result.response.text();
  return parseAIResponse(text, listingPrice);
}

async function checkWithGroq(
  apiKey: string,
  sellerInfo: string,
  listingPrice: number,
  scrapedData?: string,
): Promise<PriceResult | null> {
  console.log(`[PRICE] Trying provider=groq model=qwen/qwen3.6-27b`);
  const client = new OpenAI({ baseURL: "https://api.groq.com/openai/v1", apiKey });
  const prompt = scrapedData
    ? `Dựa vào dữ liệu sau từ các trang bán hàng:\n${scrapedData}\n\n${PRICE_PROMPT(sellerInfo, listingPrice)}`
    : PRICE_PROMPT(sellerInfo, listingPrice);

  const response = (await client.chat.completions.create({
    model: "qwen/qwen3.6-27b",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_completion_tokens: 1024,
    stream: false,
    // Disable thinking mode so response is clean JSON (Groq Qwen3.6).
    reasoning_effort: "none",
  } as Parameters<typeof client.chat.completions.create>[0] & {
    reasoning_effort?: string;
  })) as { choices: Array<{ message?: { content?: string | null } }> };

  const text = response.choices[0]?.message?.content || "";
  const parsed = parseAIResponse(text, listingPrice);
  if (!parsed) {
    console.warn(`[PRICE] Groq parse failed, raw snippet: ${text.slice(0, 300)}`);
  }
  return parsed;
}

async function checkWithQwen(
  apiKey: string,
  sellerInfo: string,
  listingPrice: number,
  scrapedData?: string,
): Promise<PriceResult | null> {
  console.log(`[PRICE] Trying provider=qwen`);
  const client = new OpenAI({ baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", apiKey });
  const prompt = scrapedData
    ? `Dựa vào dữ liệu sau từ các trang bán hàng:\n${scrapedData}\n\n${PRICE_PROMPT(sellerInfo, listingPrice)}`
    : PRICE_PROMPT(sellerInfo, listingPrice);

  const response = await client.chat.completions.create({
    model: "qwen-turbo",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  return parseAIResponse(response.choices[0]?.message?.content || "", listingPrice);
}

async function checkWithOpenRouter(
  apiKey: string,
  sellerInfo: string,
  listingPrice: number,
  scrapedData?: string,
): Promise<PriceResult | null> {
  console.log(`[PRICE] Trying provider=openrouter`);
  const client = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });
  const prompt = scrapedData
    ? `Dựa vào dữ liệu sau từ các trang bán hàng:\n${scrapedData}\n\n${PRICE_PROMPT(sellerInfo, listingPrice)}`
    : PRICE_PROMPT(sellerInfo, listingPrice);

  const response = await client.chat.completions.create({
    model: "openrouter/free",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  return parseAIResponse(response.choices[0]?.message?.content || "", listingPrice);
}

/** Format stored in api_keys.api_key: ACCOUNT_ID|API_TOKEN */
function parseCloudflareCredential(apiKey: string): { accountId: string; token: string } | null {
  const sep = apiKey.indexOf("|");
  if (sep <= 0 || sep === apiKey.length - 1) return null;
  const accountId = apiKey.slice(0, sep).trim();
  const token = apiKey.slice(sep + 1).trim();
  if (!/^[a-f0-9]{32}$/i.test(accountId) || !token) return null;
  return { accountId, token };
}

async function checkWithCloudflare(
  apiKey: string,
  sellerInfo: string,
  listingPrice: number,
  scrapedData?: string,
): Promise<PriceResult | null> {
  const cred = parseCloudflareCredential(apiKey);
  if (!cred) {
    throw new Error("Invalid Cloudflare credential format (expected ACCOUNT_ID|API_TOKEN)");
  }

  console.log(`[PRICE] Trying provider=cloudflare model=@cf/meta/llama-3.1-8b-instruct-fast`);
  const client = new OpenAI({
    apiKey: cred.token,
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/v1`,
  });
  const prompt = scrapedData
    ? `Dựa vào dữ liệu sau từ các trang bán hàng:\n${scrapedData}\n\n${PRICE_PROMPT(sellerInfo, listingPrice)}`
    : PRICE_PROMPT(sellerInfo, listingPrice);

  const response = await client.chat.completions.create({
    model: "@cf/meta/llama-3.1-8b-instruct-fast",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  const text = response.choices[0]?.message?.content || "";
  const parsed = parseAIResponse(text, listingPrice);
  if (!parsed) {
    console.warn(`[PRICE] Cloudflare parse failed, raw snippet: ${text.slice(0, 300)}`);
  }
  return parsed;
}

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
};

function parseVndNumber(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const num = parseInt(digits, 10);
  if (!Number.isFinite(num) || num < 100_000 || num > 100_000_000) return null;
  return num;
}

function extractPricesFromHtml(html: string, limit = 12): number[] {
  const prices: number[] = [];
  const re = /(\d{1,3}(?:[.,]\d{3}){1,4})\s*(?:đ|₫|Đ)/g;
  for (const m of html.matchAll(re)) {
    const n = parseVndNumber(m[1]);
    if (n) prices.push(n);
    if (prices.length >= limit) break;
  }
  return prices;
}

type ScrapeHit = { source: string; label: string; price: number; url: string };

async function scrapeTheGioiDiDong(productName: string): Promise<ScrapeHit[]> {
  const url = `https://www.thegioididong.com/tim-kiem?key=${encodeURIComponent(productName)}`;
  console.log(`[PRICE] Scrape TGDD url=${url}`);
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) return [];
  const html = await res.text();
  const $ = cheerio.load(html);
  const hits: ScrapeHit[] = [];

  $(".item, .product-item, [class*='product']").slice(0, 6).each((_, el) => {
    const name = $(el).find("[class*='name'], h3, .product-name").first().text().trim();
    const priceText = $(el).find("[class*='price']").first().text().trim();
    const price = parseVndNumber(priceText);
    if (name && price) hits.push({ source: "TGDD", label: name, price, url });
  });

  if (hits.length === 0) {
    for (const price of extractPricesFromHtml(html, 6)) {
      hits.push({ source: "TGDD", label: productName, price, url });
    }
  }
  return hits;
}

async function scrapeHoangHa(productName: string): Promise<ScrapeHit[]> {
  const url = `https://hoanghamobile.com/tim-kiem?kw=${encodeURIComponent(productName)}`;
  console.log(`[PRICE] Scrape HoangHa url=${url}`);
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) return [];
  const html = await res.text();
  const $ = cheerio.load(html);
  const hits: ScrapeHit[] = [];

  $("[class*='price'], .price, .product-price").slice(0, 8).each((_, el) => {
    const block = $(el).closest("a, .product, .item, li, article");
    const name =
      block.find("[class*='name'], h3, h2, .title").first().text().trim() ||
      block.attr("title") ||
      productName;
    // Lấy giá đầu (giá đang bán), bỏ giá gạch.
    const priceText = $(el).text().split(/\s{2,}|\n/)[0] || $(el).text();
    const price = parseVndNumber(priceText);
    if (price) hits.push({ source: "HoangHa", label: name.slice(0, 120), price, url });
  });

  if (hits.length === 0) {
    for (const price of extractPricesFromHtml(html, 6)) {
      hits.push({ source: "HoangHa", label: productName, price, url });
    }
  }
  return hits.slice(0, 6);
}

/** Tin tương tự trên Chợ Tốt HCM — sát giá máy cũ hơn shop mới. */
async function scrapeChototComps(productName: string): Promise<ScrapeHit[]> {
  // Rút gọn query để API search tốt hơn (bỏ % pin / emoji dài).
  const q = productName
    .replace(/\d+\s*%/g, " ")
    .replace(/[^\p{L}\p{N}\s/+\-.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!q) return [];

  const url = `https://gateway.chotot.com/v1/public/ad-listing?q=${encodeURIComponent(q)}&region_v2=13000&limit=10&st=s,k`;
  console.log(`[PRICE] Scrape Chotot comps url=${url}`);
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    ads?: { list_id?: number; subject?: string; price?: number }[];
  };

  const hits: ScrapeHit[] = [];
  for (const ad of data.ads || []) {
    const price = Number(ad.price);
    if (!Number.isFinite(price) || price < 100_000 || price > 100_000_000) continue;
    hits.push({
      source: "Chotot",
      label: (ad.subject || q).slice(0, 120),
      price,
      url: ad.list_id ? `https://www.chotot.com/${ad.list_id}.htm` : url,
    });
  }
  return hits;
}

async function collectMarketHits(productName: string): Promise<ScrapeHit[]> {
  const results = await Promise.allSettled([
    scrapeTheGioiDiDong(productName),
    scrapeHoangHa(productName),
    scrapeChototComps(productName),
  ]);

  const hits: ScrapeHit[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") hits.push(...r.value);
    else console.warn("[PRICE] Scrape source failed", r.reason);
  }
  return hits;
}

function formatHitsForAI(hits: ScrapeHit[]): string {
  if (hits.length === 0) return "";
  return hits.map((h) => `[${h.source}] ${h.label}: ${h.price.toLocaleString("vi-VN")}đ`).join("\n");
}

function averageHitPrice(hits: ScrapeHit[]): number | null {
  if (hits.length === 0) return null;
  // Ưu tiên tin Chợ Tốt (máy cũ) nếu có ≥2 mẫu; không thì trung bình tất cả.
  const chotot = hits.filter((h) => h.source === "Chotot");
  const pool = chotot.length >= 2 ? chotot : hits;
  const prices = pool.map((h) => h.price).sort((a, b) => a - b);
  // Bỏ outlier đầu/cuối nếu đủ mẫu.
  const trimmed =
    prices.length >= 5 ? prices.slice(1, prices.length - 1) : prices;
  return Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
}

// Scrape fallback (multi-source)
async function scrapeMarketPrice(
  productName: string,
  listingPrice: number,
): Promise<PriceResult | null> {
  try {
    const hits = await collectMarketHits(productName);
    const avg = averageHitPrice(hits);
    if (!avg) return null;
    const sources = [...new Set(hits.map((h) => h.url))];
    console.log(
      `[PRICE] Fallback scrape hits=${hits.length} avg=${avg} sources=${[...new Set(hits.map((h) => h.source))].join(",")}`,
    );
    return {
      marketPrice: avg,
      dealPrice: normalizeDealPrice(avg, listingPrice),
      sources,
      provider: "scrape",
    };
  } catch {
    return null;
  }
}

export async function scrapeDataForAI(productName: string): Promise<string> {
  try {
    const hits = await collectMarketHits(productName);
    const text = formatHitsForAI(hits);
    console.log(`[PRICE] Scrape support lines=${hits.length}`);
    return text;
  } catch {
    return "";
  }
}

function parseAIResponse(text: string, listingPrice: number): PriceResult | null {
  try {
    // Strip thinking / markdown wrappers from models like Groq Qwen3.6
    let cleaned = text
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/```(?:json)?/gi, "")
      .trim();

    // Prefer a JSON object that contains "average"
    const candidates = cleaned.match(/\{[\s\S]*?\}/g) || [];
    const withAverage = [...candidates].reverse().find((c) => /"average"\s*:/.test(c));

    let raw = withAverage || null;
    if (!raw) {
      const start = cleaned.lastIndexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start >= 0 && end > start) {
        raw = cleaned.slice(start, end + 1);
      }
    }
    if (!raw) return null;

    const data = JSON.parse(raw);
    const marketPrice = Number(data.average ?? 0);
    if (!Number.isFinite(marketPrice) || marketPrice <= 0) return null;

    const suggested = Number(data.recommended_buy_price ?? 0);
    const dealPrice = normalizeDealPrice(
      marketPrice,
      listingPrice,
      Number.isFinite(suggested) && suggested > 0 ? suggested : undefined,
    );

    return {
      marketPrice,
      dealPrice,
      sources: data.sources || [],
    };
  } catch {
    return null;
  }
}

/** Daily free-tier / rate-limit — skip key until next VN local day. */
function isDailyQuotaError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("quota exceeded") ||
    msg.includes("free_tier") ||
    msg.includes("free tier") ||
    msg.includes("rate-limit") ||
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted") ||
    msg.includes("generaterequestsperday") ||
    msg.includes("neuron") ||
    msg.includes("workers ai")
  );
}

// Main price check with fallback chain
export async function checkPrice(
  productId: number,
  productName: string,
  productPrice: number,
  sellerDescription?: string,
): Promise<boolean> {
  console.log(`[PRICE] Start check product_id=${productId} title="${productName}" price=${productPrice}`);
  const sellerInfo = `title: ${productName}\ncontent: ${sellerDescription || "(không có mô tả)"}`;
  const keys = getNextAvailableKey() as ApiKeyRow[];

  // List order (priority ASC) is the fallback order — set via drag-and-drop on API Keys tab.
  for (const key of keys) {
    const provider = key.provider;
    try {
      let result: PriceResult | null = null;
      const scrapedData = provider !== "gemini" ? await scrapeDataForAI(productName) : undefined;

      switch (provider) {
        case "gemini":
          result = await checkWithGemini(key.api_key, sellerInfo, productPrice);
          break;
        case "groq":
          result = await checkWithGroq(key.api_key, sellerInfo, productPrice, scrapedData);
          break;
        case "cloudflare":
          result = await checkWithCloudflare(key.api_key, sellerInfo, productPrice, scrapedData);
          break;
        case "qwen":
          result = await checkWithQwen(key.api_key, sellerInfo, productPrice, scrapedData);
          break;
        case "openrouter":
          result = await checkWithOpenRouter(key.api_key, sellerInfo, productPrice, scrapedData);
          break;
        default:
          console.warn(`[PRICE] Unknown provider=${provider} key_id=${key.id}`);
          continue;
      }

      if (result) {
        incrementKeyUsage(key.id);
        const dealPrice = normalizeDealPrice(result.marketPrice, productPrice, result.dealPrice);
        const margin = ((result.marketPrice - productPrice) / result.marketPrice) * 100;
        updateProductPrice(
          productId,
          result.marketPrice,
          dealPrice,
          Math.round(margin * 100) / 100,
        );
        console.log(
          `[PRICE] Success product_id=${productId} provider=${provider} market_price=${result.marketPrice} deal_price=${dealPrice}`,
        );
        return true;
      }

      incrementKeyUsage(key.id);
    } catch (err) {
      console.error(
        `[PRICE] Provider failed product_id=${productId} provider=${provider} key_id=${key.id}`,
        err,
      );
      if (isDailyQuotaError(err)) {
        markKeyExhaustedToday(key.id, String(err));
        console.warn(
          `[PRICE] Key ${key.id} (${provider}) marked exhausted_today — skip until next day`,
        );
      } else {
        markKeyError(key.id, String(err));
      }
      continue;
    }
  }

  // Final fallback: scrape only
  const scrapeResult = await scrapeMarketPrice(productName, productPrice);
  if (scrapeResult) {
    const dealPrice = normalizeDealPrice(
      scrapeResult.marketPrice,
      productPrice,
      scrapeResult.dealPrice,
    );
    const margin = ((scrapeResult.marketPrice - productPrice) / scrapeResult.marketPrice) * 100;
    updateProductPrice(
      productId,
      scrapeResult.marketPrice,
      dealPrice,
      Math.round(margin * 100) / 100,
    );
    console.log(
      `[PRICE] Success product_id=${productId} provider=scrape market_price=${scrapeResult.marketPrice} deal_price=${dealPrice}`,
    );
    return true;
  }

  console.warn(`[PRICE] No price found product_id=${productId}`);
  return false;
}

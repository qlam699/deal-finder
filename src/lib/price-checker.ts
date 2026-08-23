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
  marketPrice: number;
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

const PRICE_PROMPT = (sellerInfo: string) =>
  `Máy cũ này thị trường giá nhiêu, nếu mua đi bán lại thì giá hợp lý để mua là nhiêu, cho biết độ chênh lệch giá thấp nhất thị trường rồi khuyến nghị nên mua không.
Trả lời ngắn gọn.
Dưới đây là thông tin người bán ghi:
${sellerInfo}

Yêu cầu trả về JSON duy nhất (không markdown), theo format:
{
  "min": <giá thấp nhất thị trường, VND>,
  "max": <giá cao nhất thị trường, VND>,
  "average": <giá trung bình thị trường, VND>,
  "recommended_buy_price": <giá đề xuất nên mua để lướt, VND>,
  "min_gap_percent": <phần trăm chênh lệch giữa giá thấp nhất thị trường và giá đề xuất mua>,
  "should_buy": <true|false>,
  "summary": "<1 câu khuyến nghị ngắn gọn>",
  "sources": ["url1", "url2"]
}
Nếu không tìm được dữ liệu đủ tin cậy, trả:
{"min": 0, "max": 0, "average": 0, "recommended_buy_price": 0, "min_gap_percent": 0, "should_buy": false, "summary": "không đủ dữ liệu", "sources": []}`;

// Provider implementations
async function checkWithGemini(apiKey: string, sellerInfo: string): Promise<PriceResult | null> {
  console.log(`[PRICE] Trying provider=gemini`);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [{ googleSearch: {} } as unknown as import("@google/generative-ai").Tool],
  });

  const result = await model.generateContent(PRICE_PROMPT(sellerInfo));
  const text = result.response.text();
  return parseAIResponse(text);
}

async function checkWithGroq(apiKey: string, sellerInfo: string, scrapedData?: string): Promise<PriceResult | null> {
  console.log(`[PRICE] Trying provider=groq model=qwen/qwen3.6-27b`);
  const client = new OpenAI({ baseURL: "https://api.groq.com/openai/v1", apiKey });
  const prompt = scrapedData
    ? `Dựa vào dữ liệu sau từ các trang bán hàng:\n${scrapedData}\n\n${PRICE_PROMPT(sellerInfo)}`
    : PRICE_PROMPT(sellerInfo);

  const response = await client.chat.completions.create({
    model: "qwen/qwen3.6-27b",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_completion_tokens: 1024,
    // Disable thinking mode so response is clean JSON (Groq Qwen3.6).
    reasoning_effort: "none",
  } as Parameters<typeof client.chat.completions.create>[0] & {
    reasoning_effort?: string;
  });

  const text = response.choices[0]?.message?.content || "";
  const parsed = parseAIResponse(text);
  if (!parsed) {
    console.warn(`[PRICE] Groq parse failed, raw snippet: ${text.slice(0, 300)}`);
  }
  return parsed;
}

async function checkWithQwen(apiKey: string, sellerInfo: string, scrapedData?: string): Promise<PriceResult | null> {
  console.log(`[PRICE] Trying provider=qwen`);
  const client = new OpenAI({ baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", apiKey });
  const prompt = scrapedData
    ? `Dựa vào dữ liệu sau từ các trang bán hàng:\n${scrapedData}\n\n${PRICE_PROMPT(sellerInfo)}`
    : PRICE_PROMPT(sellerInfo);

  const response = await client.chat.completions.create({
    model: "qwen-turbo",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  return parseAIResponse(response.choices[0]?.message?.content || "");
}

async function checkWithOpenRouter(apiKey: string, sellerInfo: string, scrapedData?: string): Promise<PriceResult | null> {
  console.log(`[PRICE] Trying provider=openrouter`);
  const client = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });
  const prompt = scrapedData
    ? `Dựa vào dữ liệu sau từ các trang bán hàng:\n${scrapedData}\n\n${PRICE_PROMPT(sellerInfo)}`
    : PRICE_PROMPT(sellerInfo);

  const response = await client.chat.completions.create({
    model: "openrouter/free",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  return parseAIResponse(response.choices[0]?.message?.content || "");
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
    ? `Dựa vào dữ liệu sau từ các trang bán hàng:\n${scrapedData}\n\n${PRICE_PROMPT(sellerInfo)}`
    : PRICE_PROMPT(sellerInfo);

  const response = await client.chat.completions.create({
    model: "@cf/meta/llama-3.1-8b-instruct-fast",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  const text = response.choices[0]?.message?.content || "";
  const parsed = parseAIResponse(text);
  if (!parsed) {
    console.warn(`[PRICE] Cloudflare parse failed, raw snippet: ${text.slice(0, 300)}`);
  }
  return parsed;
}

// Scrape fallback
async function scrapeMarketPrice(productName: string): Promise<PriceResult | null> {
  try {
    const encoded = encodeURIComponent(productName);
    const url = `https://www.thegioididong.com/tim-kiem?key=${encoded}`;
    console.log(`[PRICE] Fallback scrape url=${url}`);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    const prices: number[] = [];

    $(".price, .btn-price, [class*='price']").each((_, el) => {
      const text = $(el).text().replace(/[^\d]/g, "");
      const num = parseInt(text);
      if (num > 100000 && num < 100000000) {
        prices.push(num);
      }
    });

    if (prices.length === 0) return null;

    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    return { marketPrice: avg, sources: [url], provider: "scrape" };
  } catch {
    return null;
  }
}

export async function scrapeDataForAI(productName: string): Promise<string> {
  try {
    const encoded = encodeURIComponent(productName);
    const url = `https://www.thegioididong.com/tim-kiem?key=${encoded}`;
    console.log(`[PRICE] Scrape support data url=${url}`);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!res.ok) return "";

    const html = await res.text();
    const $ = cheerio.load(html);
    const results: string[] = [];

    $(".item, .product-item, [class*='product']").slice(0, 5).each((_, el) => {
      const name = $(el).find("[class*='name'], h3, .product-name").first().text().trim();
      const price = $(el).find("[class*='price']").first().text().trim();
      if (name && price) {
        results.push(`${name}: ${price}`);
      }
    });

    return results.join("\n") || "";
  } catch {
    return "";
  }
}

function parseAIResponse(text: string): PriceResult | null {
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
    const marketPrice = Number(data.average ?? data.recommended_buy_price ?? 0);
    if (!Number.isFinite(marketPrice) || marketPrice <= 0) return null;

    return {
      marketPrice,
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
  const providerOrder = ["gemini", "groq", "cloudflare", "qwen", "openrouter"];

  for (const provider of providerOrder) {
    const providerKeys = keys.filter((k) => k.provider === provider);

    for (const key of providerKeys) {
      try {
        let result: PriceResult | null = null;
        const scrapedData = provider !== "gemini" ? await scrapeDataForAI(productName) : undefined;

        switch (provider) {
          case "gemini":
            result = await checkWithGemini(key.api_key, sellerInfo);
            break;
          case "groq":
            result = await checkWithGroq(key.api_key, sellerInfo, scrapedData);
            break;
          case "cloudflare":
            result = await checkWithCloudflare(key.api_key, sellerInfo, scrapedData);
            break;
          case "qwen":
            result = await checkWithQwen(key.api_key, sellerInfo, scrapedData);
            break;
          case "openrouter":
            result = await checkWithOpenRouter(key.api_key, sellerInfo, scrapedData);
            break;
        }

        if (result) {
          incrementKeyUsage(key.id);
          const margin = ((result.marketPrice - productPrice) / result.marketPrice) * 100;
          updateProductPrice(productId, result.marketPrice, Math.round(margin * 100) / 100);
          console.log(
            `[PRICE] Success product_id=${productId} provider=${provider} market_price=${result.marketPrice}`,
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
  }

  // Final fallback: scrape only
  const scrapeResult = await scrapeMarketPrice(productName);
  if (scrapeResult) {
    const margin = ((scrapeResult.marketPrice - productPrice) / scrapeResult.marketPrice) * 100;
    updateProductPrice(productId, scrapeResult.marketPrice, Math.round(margin * 100) / 100);
    console.log(
      `[PRICE] Success product_id=${productId} provider=scrape market_price=${scrapeResult.marketPrice}`,
    );
    return true;
  }

  console.warn(`[PRICE] No price found product_id=${productId}`);
  return false;
}

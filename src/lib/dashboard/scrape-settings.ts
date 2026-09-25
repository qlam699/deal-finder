import type { ScrapeSettingsState } from "@/lib/dashboard/types";

export const SCRAPE_SETTINGS_STORAGE_KEY = "deal-finder-scrape-settings";

export const DEFAULT_SCRAPE_SETTINGS: ScrapeSettingsState = {
  personalOnly: true,
  minPrice: 100000,
  maxPrice: 60000000,
  minMarginPercent: 5,
  skipKeywords: ["bể", "hư", "hỏng", "sọc", "xác"],
};

const MAX_SKIP_KEYWORDS = 100;
const MAX_SKIP_KEYWORD_LENGTH = 80;

export function normalizeSkipKeywords(input?: unknown): string[] {
  let raw: string[] = [];
  if (Array.isArray(input)) {
    raw = input.map((x) => String(x ?? ""));
  } else if (typeof input === "string") {
    raw = input.split(/[\n,;]+/);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const clipped = trimmed.slice(0, MAX_SKIP_KEYWORD_LENGTH);
    const key = clipped.toLocaleLowerCase("vi");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length >= MAX_SKIP_KEYWORDS) break;
  }
  return out;
}

/** Join keywords for textarea display (one per line). */
export function skipKeywordsToText(keywords: string[]): string {
  return keywords.join("\n");
}

export function normalizeScrapeSettings(
  input?: Partial<ScrapeSettingsState> | null,
): ScrapeSettingsState {
  const minPrice = Math.max(
    0,
    Math.floor(Number(input?.minPrice ?? DEFAULT_SCRAPE_SETTINGS.minPrice)),
  );
  const maxPrice = Math.max(
    minPrice,
    Math.max(0, Math.floor(Number(input?.maxPrice ?? DEFAULT_SCRAPE_SETTINGS.maxPrice))),
  );
  const rawMargin = Math.floor(
    Number(input?.minMarginPercent ?? DEFAULT_SCRAPE_SETTINGS.minMarginPercent),
  );
  const minMarginPercent = Number.isFinite(rawMargin)
    ? Math.min(100, Math.max(1, rawMargin))
    : DEFAULT_SCRAPE_SETTINGS.minMarginPercent;

  return {
    personalOnly: input?.personalOnly ?? DEFAULT_SCRAPE_SETTINGS.personalOnly,
    minPrice,
    maxPrice,
    minMarginPercent,
    skipKeywords: normalizeSkipKeywords(
      input?.skipKeywords ?? DEFAULT_SCRAPE_SETTINGS.skipKeywords,
    ),
  };
}

export function readScrapeSettingsFromLocalStorage(): ScrapeSettingsState {
  if (typeof window === "undefined") return DEFAULT_SCRAPE_SETTINGS;

  try {
    const raw = window.localStorage.getItem(SCRAPE_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SCRAPE_SETTINGS;
    return normalizeScrapeSettings(JSON.parse(raw) as Partial<ScrapeSettingsState>);
  } catch {
    return DEFAULT_SCRAPE_SETTINGS;
  }
}

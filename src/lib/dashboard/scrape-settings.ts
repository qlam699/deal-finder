import type { ScrapeSettingsState } from "@/lib/dashboard/types";

export const SCRAPE_SETTINGS_STORAGE_KEY = "deal-finder-scrape-settings";

export const DEFAULT_SCRAPE_SETTINGS: ScrapeSettingsState = {
  personalOnly: true,
  minPrice: 100000,
  maxPrice: 60000000,
  minMarginPercent: 10,
};

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

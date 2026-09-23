"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScrapeSettingsState } from "@/lib/dashboard/types";
import {
  DEFAULT_SCRAPE_SETTINGS,
  SCRAPE_SETTINGS_STORAGE_KEY,
  normalizeScrapeSettings,
  readScrapeSettingsFromLocalStorage,
} from "@/lib/dashboard/scrape-settings";

type JobStatusResponse = {
  running?: boolean;
  cronRunning?: boolean;
  lastError?: string | null;
  lastResult?: {
    newProducts: number;
    priceChecked: number;
    published?: number;
    discarded?: number;
  } | null;
  intervalMinutes?: number | null;
  scrapeLimit?: number | null;
  scrapeSettings?: ScrapeSettingsState | null;
};

type UseScrapeJobOptions = {
  apiKeyCount: number;
  goToProductsPage: (page: number) => void;
  resetSortToNewest: () => void;
  fetchProducts: () => Promise<void>;
  fetchApiKeys: () => Promise<void>;
  refreshListAjax: () => Promise<void>;
};

export function useScrapeJob({
  apiKeyCount,
  goToProductsPage,
  resetSortToNewest,
  fetchProducts,
  fetchApiKeys,
  refreshListAjax,
}: UseScrapeJobOptions) {
  const [scraping, setScraping] = useState(false);
  const [cronRunning, setCronRunning] = useState(false);
  const [scrapeLimit, setScrapeLimit] = useState(10);
  const [scrapeSettingsOpen, setScrapeSettingsOpen] = useState(false);
  const [scrapeSettings, setScrapeSettings] = useState<ScrapeSettingsState>(
    readScrapeSettingsFromLocalStorage,
  );
  const [savingScrapeSettings, setSavingScrapeSettings] = useState(false);
  const [jobMessage, setJobMessage] = useState("");

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SCRAPE_SETTINGS_STORAGE_KEY,
        JSON.stringify(normalizeScrapeSettings(scrapeSettings)),
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [scrapeSettings]);

  const fetchJobStatus = useCallback(async () => {
    const res = await fetch("/api/scrape");
    const data = (await res.json()) as JobStatusResponse;
    setScraping(!!data.running);
    setCronRunning(!!data.cronRunning);
    if (data?.scrapeSettings) {
      setScrapeSettings(normalizeScrapeSettings(data.scrapeSettings));
    }
    if (typeof data.scrapeLimit === "number" && data.scrapeLimit > 0) {
      setScrapeLimit(data.scrapeLimit);
    }
    if (data.running) {
      setJobMessage("Đang quét ngầm trên server...");
    } else if (data.lastResult) {
      const published = data.lastResult.published ?? 0;
      const discarded = data.lastResult.discarded ?? 0;
      const margin =
        Number(data.scrapeSettings?.minMarginPercent) ||
        DEFAULT_SCRAPE_SETTINGS.minMarginPercent;
      setJobMessage(
        `Lần quét gần nhất: ${data.lastResult.newProducts} tin mới · hiện ${published} deal (≥${margin}%) · bỏ ${discarded}` +
          (data.cronRunning ? ` · Cron ${data.intervalMinutes || 10} phút` : ""),
      );
    } else if (data.cronRunning) {
      setJobMessage(`Cron đang bật (mỗi ${data.intervalMinutes || 10} phút)`);
    } else if (data.lastError) {
      setJobMessage(`Lỗi lần quét trước: ${data.lastError}`);
    }
    return data;
  }, []);

  useEffect(() => {
    if (!scraping && !cronRunning) return;

    let cancelled = false;
    let wasRunning = scraping;

    const tick = async () => {
      const data = await fetchJobStatus();
      const justFinished = wasRunning && !data.running;
      wasRunning = !!data.running;

      if (justFinished) {
        await refreshListAjax();
        return;
      }

      if (cancelled) return;
      await Promise.all([fetchProducts(), fetchApiKeys()]);
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [scraping, cronRunning, fetchJobStatus, fetchProducts, fetchApiKeys, refreshListAjax]);

  const handleScrape = useCallback(async () => {
    const limit = Math.min(50, Math.max(1, Math.floor(Number(scrapeLimit)) || 5));
    const nextSettings = normalizeScrapeSettings(scrapeSettings);
    setScrapeLimit(limit);
    setScrapeSettings(nextSettings);
    setScraping(true);
    goToProductsPage(1);
    resetSortToNewest();
    setJobMessage("Đã gửi lệnh quét ngầm...");
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limitPerCategory: limit, settings: nextSettings }),
      });
      const data = await res.json();
      setJobMessage(
        data.message ||
          "Đã bắt đầu quét ngầm. Danh sách sẽ tự cập nhật, không cần F5.",
      );
      await fetchJobStatus();
      await fetchProducts();
    } catch (err) {
      setScraping(false);
      setJobMessage(`Không start được job: ${String(err)}`);
    }
  }, [
    scrapeLimit,
    scrapeSettings,
    goToProductsPage,
    resetSortToNewest,
    fetchJobStatus,
    fetchProducts,
  ]);

  const handleToggleCron = useCallback(async () => {
    if (cronRunning) {
      await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop-cron" }),
      });
    } else {
      const limit = Math.min(50, Math.max(1, Math.floor(Number(scrapeLimit)) || 5));
      const nextSettings = normalizeScrapeSettings(scrapeSettings);
      setScrapeLimit(limit);
      setScrapeSettings(nextSettings);
      await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start-cron",
          intervalMinutes: 10,
          limitPerCategory: limit,
          settings: nextSettings,
        }),
      });
    }
    await fetchJobStatus();
  }, [cronRunning, scrapeLimit, scrapeSettings, fetchJobStatus]);

  const handleSaveScrapeSettings = useCallback(async () => {
    const nextSettings = normalizeScrapeSettings(scrapeSettings);
    setScrapeSettings(nextSettings);
    setSavingScrapeSettings(true);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: nextSettings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Không lưu được cấu hình quét");
      setScrapeSettings(normalizeScrapeSettings(data.scrapeSettings || nextSettings));
      setScrapeSettingsOpen(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Lưu cấu hình quét thất bại");
    } finally {
      setSavingScrapeSettings(false);
    }
  }, [scrapeSettings]);

  return {
    scraping,
    cronRunning,
    scrapeLimit,
    setScrapeLimit,
    scrapeSettingsOpen,
    setScrapeSettingsOpen,
    scrapeSettings,
    setScrapeSettings,
    savingScrapeSettings,
    jobMessage,
    fetchJobStatus,
    handleScrape,
    handleToggleCron,
    handleSaveScrapeSettings,
    canScrape: apiKeyCount > 0,
  };
}

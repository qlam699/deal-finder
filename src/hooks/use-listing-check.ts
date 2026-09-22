"use client";

import { useCallback, useEffect, useState } from "react";
import type { ListingCheckStatus } from "@/lib/dashboard/types";

type UseListingCheckOptions = {
  scraping: boolean;
  refreshListAjax: () => Promise<void>;
};

export function useListingCheck({ scraping, refreshListAjax }: UseListingCheckOptions) {
  const [checkingListings, setCheckingListings] = useState(false);
  const [listingCheckMessage, setListingCheckMessage] = useState("");

  const fetchListingCheckStatus = useCallback(async () => {
    const res = await fetch("/api/products/check-existence");
    const data = (await res.json()) as ListingCheckStatus;
    setCheckingListings(data.running);
    if (data.running) {
      setListingCheckMessage(`Đang kiểm tra ${data.checked}/${data.total || "..."} tin...`);
    }
    return data;
  }, []);

  const handleCheckListings = useCallback(async () => {
    if (checkingListings || scraping) return;
    setCheckingListings(true);
    setListingCheckMessage("Đang kiểm tra toàn bộ danh sách...");
    try {
      const res = await fetch("/api/products/check-existence", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Không bắt đầu được kiểm tra");
    } catch (err) {
      setCheckingListings(false);
      setListingCheckMessage("");
      alert(err instanceof Error ? err.message : "Kiểm tra tin thất bại. Thử lại.");
    }
  }, [checkingListings, scraping]);

  useEffect(() => {
    if (!checkingListings) return;
    let cancelled = false;
    const poll = async () => {
      const res = await fetch("/api/products/check-existence");
      const data = (await res.json()) as ListingCheckStatus;
      if (cancelled) return;
      if (data.running) {
        setListingCheckMessage(`Đang kiểm tra ${data.checked}/${data.total || "..."} tin...`);
      } else {
        setCheckingListings(false);
        setListingCheckMessage(
          data.lastError
            ? `Kiểm tra lỗi: ${data.lastError}`
            : `Đã kiểm tra ${data.checked} tin, xóa ${data.deleted} tin không còn tồn tại.`,
        );
        await refreshListAjax();
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [checkingListings, refreshListAjax]);

  return {
    checkingListings,
    listingCheckMessage,
    fetchListingCheckStatus,
    handleCheckListings,
  };
}

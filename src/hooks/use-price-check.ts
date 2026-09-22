"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UsePriceCheckOptions = {
  fetchProducts: () => Promise<void>;
  fetchApiKeys: () => Promise<void>;
};

export function usePriceCheck({ fetchProducts, fetchApiKeys }: UsePriceCheckOptions) {
  const [checkingPriceIds, setCheckingPriceIds] = useState<number[]>([]);
  const priceCheckErrorsShown = useRef<Set<number>>(new Set());

  const hydratePendingPriceChecks = useCallback(async () => {
    try {
      const res = await fetch("/api/products/check-price");
      const data = (await res.json()) as { pendingIds?: number[] };
      if (Array.isArray(data?.pendingIds) && data.pendingIds.length > 0) {
        setCheckingPriceIds(data.pendingIds);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (checkingPriceIds.length === 0) return;

    let cancelled = false;

    const tick = async () => {
      const [statusRes] = await Promise.all([
        fetch("/api/products/check-price"),
        fetchProducts(),
        fetchApiKeys(),
      ]);
      if (cancelled) return;

      const status = (await statusRes.json().catch(() => null)) as {
        pendingIds?: number[];
        errors?: Record<string, string>;
      } | null;

      const pending = status?.pendingIds || [];
      setCheckingPriceIds(pending);

      const errors = status?.errors || {};
      for (const [idStr, msg] of Object.entries(errors)) {
        const id = Number(idStr);
        if (!priceCheckErrorsShown.current.has(id)) {
          priceCheckErrorsShown.current.add(id);
          alert(msg);
        }
      }
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [checkingPriceIds.length, fetchProducts, fetchApiKeys]);

  const handleCheckPrice = useCallback(async (id: number) => {
    if (checkingPriceIds.includes(id)) return;
    priceCheckErrorsShown.current.delete(id);
    setCheckingPriceIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    try {
      const res = await fetch("/api/products/check-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setCheckingPriceIds((prev) => prev.filter((x) => x !== id));
        throw new Error(data?.error || "Không bắt đầu được tìm hiểu");
      }
      if (Array.isArray(data?.pendingIds)) {
        setCheckingPriceIds(data.pendingIds);
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Tìm hiểu thất bại. Thử lại.");
    }
  }, [checkingPriceIds]);

  return {
    checkingPriceIds,
    handleCheckPrice,
    hydratePendingPriceChecks,
  };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductsViewMode } from "@/lib/dashboard/types";
import {
  clearLegacyProductsViewStorage,
  persistProductsViewMode,
  resolveProductsView,
} from "@/lib/dashboard/products-view";

export function useProductsView() {
  const [productsView, setProductsView] = useState<ProductsViewMode>(() =>
    resolveProductsView(),
  );

  useEffect(() => {
    clearLegacyProductsViewStorage();

    const applyViewportView = () => setProductsView(resolveProductsView());
    applyViewportView();

    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => applyViewportView();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setProductsViewMode = useCallback((mode: ProductsViewMode) => {
    setProductsView(mode);
    persistProductsViewMode(mode);
  }, []);

  return {
    productsView,
    setProductsViewMode,
  };
}

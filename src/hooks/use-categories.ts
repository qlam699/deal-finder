"use client";

import { useCallback, useEffect, useState } from "react";
import type { Category } from "@/lib/dashboard/types";

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);

  const fetchCategories = useCallback(async () => {
    const res = await fetch("/api/categories");
    setCategories(await res.json());
  }, []);

  const handleToggleCategory = useCallback(
    async (id: number, enabled: boolean) => {
      await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", id, enabled }),
      });
      await fetchCategories();
    },
    [fetchCategories],
  );

  return {
    categories,
    fetchCategories,
    handleToggleCategory,
  };
}

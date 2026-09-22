"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useUrlPagination() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const productsPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const deletedPage = Math.max(1, parseInt(searchParams.get("trashPage") || "1", 10) || 1);

  const goToProductsPage = useCallback(
    (page: number) => {
      const next = Math.max(1, page);
      const params = new URLSearchParams(searchParams.toString());
      if (next <= 1) params.delete("page");
      else params.set("page", String(next));
      const qs = params.toString();
      if (qs === searchParams.toString()) return;
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const goToDeletedPage = useCallback(
    (page: number) => {
      const next = Math.max(1, page);
      const params = new URLSearchParams(searchParams.toString());
      if (next <= 1) params.delete("trashPage");
      else params.set("trashPage", String(next));
      const qs = params.toString();
      if (qs === searchParams.toString()) return;
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return {
    productsPage,
    deletedPage,
    goToProductsPage,
    goToDeletedPage,
  };
}

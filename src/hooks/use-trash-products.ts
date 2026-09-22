"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/lib/dashboard/types";
import { PAGE_SIZE } from "@/lib/dashboard/types";

type UseTrashProductsOptions = {
  deletedPage: number;
  goToDeletedPage: (page: number) => void;
};

export function useTrashProducts({ deletedPage, goToDeletedPage }: UseTrashProductsOptions) {
  const [deletedProducts, setDeletedProducts] = useState<Product[]>([]);
  const [deletedTotalPages, setDeletedTotalPages] = useState(1);
  const [deletedLoaded, setDeletedLoaded] = useState(false);
  const [deletedTotal, setDeletedTotal] = useState(0);

  const fetchDeletedProducts = useCallback(async () => {
    const res = await fetch(`/api/products?trash=1&page=${deletedPage}&pageSize=${PAGE_SIZE}`);
    const data = await res.json();
    setDeletedProducts(data.items || []);
    setDeletedTotalPages(data.totalPages || 1);
    setDeletedTotal(data.total || 0);
    setDeletedLoaded(true);
  }, [deletedPage]);

  useEffect(() => {
    if (!deletedLoaded) return;
    if (deletedPage > deletedTotalPages) {
      goToDeletedPage(Math.max(1, deletedTotalPages));
    }
  }, [deletedLoaded, deletedPage, deletedTotalPages, goToDeletedPage]);

  const handleRestoreProduct = useCallback(
    async (id: number) => {
      await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", id }),
      });
      await fetchDeletedProducts();
    },
    [fetchDeletedProducts],
  );

  const handleHardDeleteProduct = useCallback(
    async (id: number) => {
      const ok = window.confirm("Xóa vĩnh viễn sản phẩm này khỏi DB?");
      if (!ok) return;
      await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hard-delete", id }),
      });
      await fetchDeletedProducts();
    },
    [fetchDeletedProducts],
  );

  const handleEmptyTrash = useCallback(async () => {
    if (deletedTotal === 0) return;
    const ok = window.confirm(
      `Xóa vĩnh viễn toàn bộ ${deletedTotal} sản phẩm trong thùng rác khỏi DB?`,
    );
    if (!ok) return;
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "empty-trash" }),
    });
    goToDeletedPage(1);
    await fetchDeletedProducts();
  }, [deletedTotal, goToDeletedPage, fetchDeletedProducts]);

  return {
    deletedProducts,
    deletedTotalPages,
    deletedTotal,
    fetchDeletedProducts,
    handleRestoreProduct,
    handleHardDeleteProduct,
    handleEmptyTrash,
  };
}

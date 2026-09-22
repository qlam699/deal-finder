"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Product, ProductImageView, SortOrder } from "@/lib/dashboard/types";
import { PAGE_SIZE } from "@/lib/dashboard/types";

type UseProductsOptions = {
  productsPage: number;
  goToProductsPage: (page: number) => void;
};

export function useProducts({ productsPage, goToProductsPage }: UseProductsOptions) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productsTotalPages, setProductsTotalPages] = useState(1);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [productImageView, setProductImageView] = useState<ProductImageView>("small");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [cardIndex, setCardIndex] = useState(0);
  const prevSearchRef = useRef<string | null>(null);

  const fetchProducts = useCallback(async () => {
    const params = new URLSearchParams({
      sortBy,
      sortOrder,
      page: String(productsPage),
      pageSize: String(PAGE_SIZE),
    });
    if (filter) params.set("category", filter);
    if (search) params.set("q", search);
    const res = await fetch(`/api/products?${params}`);
    const data = await res.json();
    setProducts(data.items || []);
    setProductsTotalPages(data.totalPages || 1);
    setProductsLoaded(true);
  }, [filter, sortBy, sortOrder, productsPage, search]);

  const handleSort = useCallback(
    (column: string) => {
      if (sortBy === column) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSortOrder(column === "title" || column === "category" ? "asc" : "desc");
      }
      goToProductsPage(1);
    },
    [sortBy, goToProductsPage],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      setSearch(next);
      if (prevSearchRef.current !== null && prevSearchRef.current !== next) {
        goToProductsPage(1);
      }
      prevSearchRef.current = next;
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, goToProductsPage]);

  useEffect(() => {
    if (!productsLoaded) return;
    if (productsPage > productsTotalPages) {
      goToProductsPage(Math.max(1, productsTotalPages));
    }
  }, [productsLoaded, productsPage, productsTotalPages, goToProductsPage]);

  useEffect(() => {
    setCardIndex(0);
  }, [productsPage, search, filter, sortBy, sortOrder]);

  useEffect(() => {
    if (products.length === 0) {
      if (cardIndex !== 0) setCardIndex(0);
      return;
    }
    if (cardIndex > products.length - 1) {
      setCardIndex(products.length - 1);
    }
  }, [products, cardIndex]);

  const setCategoryFilter = useCallback(
    (value: string) => {
      setFilter(value);
      goToProductsPage(1);
    },
    [goToProductsPage],
  );

  const handleMoveToTrash = useCallback(
    async (id: number) => {
      await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "soft-delete", id }),
      });
      await fetchProducts();
    },
    [fetchProducts],
  );

  const resetSortToNewest = useCallback(() => {
    setSortBy("created_at");
  }, []);

  return {
    products,
    productsTotalPages,
    productsLoaded,
    filter,
    sortBy,
    sortOrder,
    productImageView,
    setProductImageView,
    searchInput,
    setSearchInput,
    search,
    cardIndex,
    setCardIndex,
    fetchProducts,
    handleSort,
    setCategoryFilter,
    handleMoveToTrash,
    resetSortToNewest,
  };
}

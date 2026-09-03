"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Product {
  id: number;
  chotot_id: string;
  title: string;
  price: number;
  category: string;
  image: string;
  url: string;
  content?: string | null;
  market_price: number | null;
  deal_price: number | null;
  profit_margin: number | null;
  created_at: string;
  listed_at?: number | null;
  checked: number;
  deleted_at?: string | null;
}

interface Category {
  id: number;
  name: string;
  chotot_category_id: string;
  enabled: number;
}

interface ApiKey {
  id: number;
  provider: string;
  api_key: string;
  label: string;
  priority: number;
  requests_today: number;
  last_error: string | null;
  status: string;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("vi-VN").format(price) + "đ";
}

function parseDbDate(value: string | number): Date {
  if (typeof value === "number") return new Date(value);
  // SQLite localtime: "YYYY-MM-DD HH:MM:SS" (giờ VN, không có timezone suffix)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return new Date(value.replace(" ", "T") + "+07:00");
  }
  return new Date(value);
}

function formatDateTime(value: string | number): string {
  const date = parseDbDate(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (Number.isNaN(date.getTime())) return "—";
  if (diffMs < 0) return "vừa xong";

  const sec = Math.floor(diffMs / 1000);
  if (sec < 10) return "vừa xong";
  if (sec < 60) return `${sec} giây trước`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;

  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} giờ trước`;

  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} ngày trước`;

  const month = Math.floor(day / 30);
  if (month < 12) return `${month} tháng trước`;

  const year = Math.floor(month / 12);
  return `${year} năm trước`;
}

type SortOrder = "asc" | "desc";
type ProductImageView = "small" | "medium" | "large";
type ListingCheckStatus = {
  running: boolean;
  checked: number;
  total: number;
  deleted: number;
  lastError: string | null;
};

const productImageViewClasses: Record<
  ProductImageView,
  { column: string; image: string }
> = {
  small: { column: "w-16", image: "size-12" },
  medium: { column: "w-24", image: "size-24" },
  large: { column: "w-36", image: "size-36" },
};

function SortableTableHead({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
  className,
}: {
  label: string;
  column: string;
  sortBy: string;
  sortOrder: SortOrder;
  onSort: (column: string) => void;
  className?: string;
}) {
  const isActive = sortBy === column;
  const isRight = className?.includes("text-right");
  return (
    <TableHead className={className}>
      <div className={isRight ? "flex justify-end" : undefined}>
        <button
          type="button"
          onClick={() => onSort(column)}
          className="inline-flex items-center gap-1 font-medium hover:text-foreground/80 transition-colors"
        >
          {label}
          {isActive ? (
            sortOrder === "asc" ? (
              <ArrowUp className="size-3.5 shrink-0" />
            ) : (
              <ArrowDown className="size-3.5 shrink-0" />
            )
          ) : (
            <ArrowUpDown className="size-3.5 shrink-0 opacity-40" />
          )}
        </button>
      </div>
    </TableHead>
  );
}

function ProductTitlePreview({
  title,
  content,
  url,
}: {
  title: string;
  content?: string | null;
  url: string;
}) {
  const [open, setOpen] = useState(false);
  const [hoverCapable, setHoverCapable] = useState(false);
  const description = content?.trim() || "Chưa có nội dung mô tả cho tin này.";

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setHoverCapable(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="block w-full truncate text-left cursor-pointer underline-offset-2 hover:underline"
    >
      {title}
    </button>
  );

  return (
    <>
      {hoverCapable ? (
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent
            side="bottom"
            align="start"
            className="max-w-md whitespace-pre-wrap break-words text-left leading-relaxed"
          >
            {description}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-left leading-snug">
              <a href={url} target="_blank" rel="noopener noreferrer">
                {title + " - Click xem"}
              </a>
            </DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-left leading-relaxed text-sm">
            {description}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

function normalizeImageUrl(url?: string): string {
  if (!url) return "";
  // Backward-compat for old malformed records in local DB.
  return url.replace("https://cdn.chotot.com/unsafe/585x440/https://", "https://");
}

export default function Dashboard() {
  const PAGE_SIZE = 10;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL is the source of truth for pagination (survives F5).
  const productsPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const deletedPage = Math.max(1, parseInt(searchParams.get("trashPage") || "1", 10) || 1);

  const [products, setProducts] = useState<Product[]>([]);
  const [deletedProducts, setDeletedProducts] = useState<Product[]>([]);
  const [productsTotalPages, setProductsTotalPages] = useState(1);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [deletedTotalPages, setDeletedTotalPages] = useState(1);
  const [deletedLoaded, setDeletedLoaded] = useState(false);
  const [deletedTotal, setDeletedTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [scraping, setScraping] = useState(false);
  const [cronRunning, setCronRunning] = useState(false);
  const [jobMessage, setJobMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [productImageView, setProductImageView] = useState<ProductImageView>("medium");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [newProvider, setNewProvider] = useState("gemini");
  const [addingKey, setAddingKey] = useState(false);
  const [checkingPriceIds, setCheckingPriceIds] = useState<number[]>([]);
  const [checkingListings, setCheckingListings] = useState(false);
  const [listingCheckMessage, setListingCheckMessage] = useState("");
  const [reorderingKeys, setReorderingKeys] = useState(false);
  const dragKeyIndex = useRef<number | null>(null);
  const apiKeysOrderRef = useRef<ApiKey[]>([]);
  const priceCheckErrorsShown = useRef<Set<number>>(new Set());
  const prevSearchRef = useRef<string | null>(null);

  useEffect(() => {
    apiKeysOrderRef.current = apiKeys;
  }, [apiKeys]);

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

  const fetchDeletedProducts = useCallback(async () => {
    const res = await fetch(`/api/products?trash=1&page=${deletedPage}&pageSize=${PAGE_SIZE}`);
    const data = await res.json();
    setDeletedProducts(data.items || []);
    setDeletedTotalPages(data.totalPages || 1);
    setDeletedTotal(data.total || 0);
    setDeletedLoaded(true);
  }, [deletedPage]);

  const fetchCategories = async () => {
    const res = await fetch("/api/categories");
    setCategories(await res.json());
  };

  const fetchApiKeys = useCallback(async () => {
    const res = await fetch("/api/api-keys");
    setApiKeys(await res.json());
  }, []);

  const fetchListingCheckStatus = useCallback(async () => {
    const res = await fetch("/api/products/check-existence");
    const data = (await res.json()) as ListingCheckStatus;
    setCheckingListings(data.running);
    if (data.running) {
      setListingCheckMessage(
        `Đang kiểm tra ${data.checked}/${data.total || "..."} tin...`,
      );
    }
    return data;
  }, []);

  const fetchJobStatus = useCallback(async () => {
    const res = await fetch("/api/scrape");
    const data = await res.json();
    setScraping(!!data.running);
    setCronRunning(!!data.cronRunning);
    if (data.running) {
      setJobMessage("Đang quét ngầm trên server...");
    } else if (data.lastResult) {
      setJobMessage(
        `Lần quét gần nhất: +${data.lastResult.newProducts} tin mới, định giá ${data.lastResult.priceChecked} sản phẩm` +
          (data.cronRunning ? ` · Cron ${data.intervalMinutes || 10} phút` : ""),
      );
    } else if (data.cronRunning) {
      setJobMessage(`Cron đang bật (mỗi ${data.intervalMinutes || 10} phút)`);
    } else if (data.lastError) {
      setJobMessage(`Lỗi lần quét trước: ${data.lastError}`);
    }
    return data as {
      running?: boolean;
      cronRunning?: boolean;
      lastError?: string | null;
      lastResult?: { newProducts: number; priceChecked: number } | null;
      intervalMinutes?: number | null;
    };
  }, []);

  const refreshListAjax = useCallback(async () => {
    await Promise.all([fetchProducts(), fetchDeletedProducts(), fetchApiKeys()]);
  }, [fetchProducts, fetchDeletedProducts, fetchApiKeys]);

  useEffect(() => {
    fetchProducts();
    fetchDeletedProducts();
    fetchCategories();
    fetchApiKeys();
    fetchJobStatus();
    void fetchListingCheckStatus().catch(() => {});
    void fetch("/api/products/check-price")
      .then((r) => r.json())
      .then((data: { pendingIds?: number[] }) => {
        if (Array.isArray(data?.pendingIds) && data.pendingIds.length > 0) {
          setCheckingPriceIds(data.pendingIds);
        }
      })
      .catch(() => {});
  }, [fetchProducts, fetchDeletedProducts, fetchApiKeys, fetchJobStatus, fetchListingCheckStatus]);

  // While job/cron is active: poll status + refresh product list via AJAX.
  useEffect(() => {
    if (!scraping && !cronRunning) return;

    let cancelled = false;
    let wasRunning = scraping;

    const tick = async () => {
      const data = await fetchJobStatus();
      const justFinished = wasRunning && !data.running;
      wasRunning = !!data.running;

      // Job vừa xong: luôn refresh (kể cả khi effect cleanup vì scraping=false),
      // để cập nhật products + requests_today của API keys không cần F5.
      if (justFinished) {
        await refreshListAjax();
        return;
      }

      if (cancelled) return;
      // Đang chạy: cập nhật list sản phẩm + usage API keys.
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

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      setSearch(next);
      // Reset page only when user actually changes search (not on mount / F5).
      if (prevSearchRef.current !== null && prevSearchRef.current !== next) {
        goToProductsPage(1);
      }
      prevSearchRef.current = next;
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, goToProductsPage]);

  // Clamp page if total shrinks (e.g. after delete / filter).
  useEffect(() => {
    if (!productsLoaded) return;
    if (productsPage > productsTotalPages) {
      goToProductsPage(Math.max(1, productsTotalPages));
    }
  }, [productsLoaded, productsPage, productsTotalPages, goToProductsPage]);

  useEffect(() => {
    if (!deletedLoaded) return;
    if (deletedPage > deletedTotalPages) {
      goToDeletedPage(Math.max(1, deletedTotalPages));
    }
  }, [deletedLoaded, deletedPage, deletedTotalPages, goToDeletedPage]);

  const handleScrape = async () => {
    setScraping(true);
    goToProductsPage(1);
    setSortBy("created_at");
    setJobMessage("Đã gửi lệnh quét ngầm...");
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setJobMessage(
        data.message ||
          "Đã bắt đầu quét ngầm. Danh sách sẽ tự cập nhật, không cần F5.",
      );
      await fetchJobStatus();
      // Immediate ajax refresh (may already have new rows if scrape is fast).
      await fetchProducts();
    } catch (err) {
      setScraping(false);
      setJobMessage(`Không start được job: ${String(err)}`);
    }
  };

  const handleToggleCron = async () => {
    if (cronRunning) {
      await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop-cron" }),
      });
    } else {
      await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start-cron", intervalMinutes: 10 }),
      });
    }
    await fetchJobStatus();
  };

  const handleToggleCategory = async (id: number, enabled: boolean) => {
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id, enabled }),
    });
    fetchCategories();
  };

  const handleAddApiKey = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const apiKey = String(form.get("api_key") || "").trim();
    const label = String(form.get("label") || "").trim();

    if (!newProvider || !apiKey) return;

    setAddingKey(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          provider: newProvider,
          api_key: apiKey,
          label: label || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Không thêm được API key");
      }
      formEl.reset();
      setNewProvider("gemini");
      await fetchApiKeys();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Thêm API key thất bại. Thử lại.");
    } finally {
      setAddingKey(false);
    }
  };

  const handleDeleteKey = async (id: number) => {
    await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    fetchApiKeys();
  };

  const persistApiKeyOrder = async (ordered: ApiKey[]) => {
    setReorderingKeys(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reorder",
          orderedIds: ordered.map((k) => k.id),
        }),
      });
      if (!res.ok) throw new Error("Không lưu được thứ tự");
      await fetchApiKeys();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Lưu thứ tự thất bại");
      await fetchApiKeys();
    } finally {
      setReorderingKeys(false);
    }
  };

  const handleKeyDragStart = (index: number) => {
    dragKeyIndex.current = index;
  };

  const handleKeyDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const from = dragKeyIndex.current;
    if (from === null || from === index) return;
    setApiKeys((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      dragKeyIndex.current = index;
      apiKeysOrderRef.current = next;
      return next;
    });
  };

  const handleKeyDrop = async () => {
    dragKeyIndex.current = null;
    await persistApiKeyOrder(apiKeysOrderRef.current);
  };

  const handleKeyDragEnd = () => {
    dragKeyIndex.current = null;
  };

  // Poll while background "Tìm hiểu" jobs are running.
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

  const handleMoveToTrash = async (id: number) => {
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "soft-delete", id }),
    });
    await fetchProducts();
    await fetchDeletedProducts();
  };

  const handleCheckListings = async () => {
    if (checkingListings) return;
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
  };

  useEffect(() => {
    if (!checkingListings) return;
    let cancelled = false;
    const poll = async () => {
      const res = await fetch("/api/products/check-existence");
      const data = (await res.json()) as {
        running: boolean;
        checked: number;
        total: number;
        deleted: number;
        lastError: string | null;
      };
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

  const handleCheckPrice = async (id: number) => {
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
  };

  const handleRestoreProduct = async (id: number) => {
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", id }),
    });
    await fetchProducts();
    await fetchDeletedProducts();
  };

  const handleHardDeleteProduct = async (id: number) => {
    const ok = window.confirm("Xóa vĩnh viễn sản phẩm này khỏi DB?");
    if (!ok) return;
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hard-delete", id }),
    });
    await fetchDeletedProducts();
  };

  const handleEmptyTrash = async () => {
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
  };

  const handleResetKey = async (id: number) => {
    await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", id }),
    });
    fetchApiKeys();
  };

  return (
    <TooltipProvider delay={200}>
    <main className="container mx-auto max-w-[1800px] p-6">
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Chotot Deal Finder</h1>
          {jobMessage && (
            <p className="text-sm text-muted-foreground mt-1">{jobMessage}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleToggleCron}
            disabled={!cronRunning && apiKeys.length === 0}
            title={
              !cronRunning && apiKeys.length === 0
                ? "Thêm ít nhất 1 API key trước khi bật quét định kỳ"
                : undefined
            }
          >
            {cronRunning ? "Tắt quét định kỳ" : "Bật quét định kỳ (10p)"}
          </Button>
          <Button
            onClick={handleScrape}
            disabled={scraping || apiKeys.length === 0}
            title={
              apiKeys.length === 0
                ? "Thêm ít nhất 1 API key trước khi quét"
                : undefined
            }
          >
            {scraping ? "Đang quét ngầm..." : "Quét sản phẩm mới"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Sản phẩm</TabsTrigger>
          <TabsTrigger value="categories">Danh mục</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="trash">Thùng rác ({deletedTotal})</TabsTrigger>
        </TabsList>

        {/* Products Tab */}
        <TabsContent value="products">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm theo tên sản phẩm hoặc mã tin..."
              className="w-full sm:w-80"
            />

            <Select
              value={filter}
              onValueChange={(v) => {
                setFilter(v || "");
                goToProductsPage(1);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Tất cả danh mục">
                  {filter || "Tất cả danh mục"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tất cả</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Select
                value={productImageView}
                onValueChange={(value) => setProductImageView(value as ProductImageView)}
              >
                <SelectTrigger className="w-36" aria-label="Kích thước ảnh sản phẩm">
                  <SelectValue>
                    {productImageView === "small"
                      ? "Nhỏ"
                      : productImageView === "large"
                        ? "Lớn"
                        : "Vừa"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Nhỏ</SelectItem>
                  <SelectItem value="medium">Vừa</SelectItem>
                  <SelectItem value="large">Lớn</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => void handleCheckListings()}
                disabled={checkingListings}
                title="Kiểm tra detail link của toàn bộ tin đang có và chuyển tin không còn sống vào thùng rác"
              >
                {checkingListings ? "Đang kiểm tra còn hàng..." : "Kiểm tra còn hàng"}
              </Button>
              {listingCheckMessage && (
                <span className="text-sm text-muted-foreground">
                  {listingCheckMessage}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={productImageViewClasses[productImageView].column}>
                    Ảnh
                  </TableHead>
                  <SortableTableHead
                    label="Sản phẩm"
                    column="title"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Danh mục"
                    column="category"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Thời gian"
                    column="listed_at"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Giá Chợ Tốt"
                    column="price"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="Giá deal mua (AI)"
                    column="deal_price"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="Giá thị trường (bán)(AI)"
                    column="market_price"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="Chênh lệch"
                    column="profit_margin"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                    className="text-right"
                  />
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {search
                        ? `Không tìm thấy sản phẩm cho "${search}".`
                        : "Chưa có sản phẩm. Nhấn \"Quét sản phẩm mới\" để bắt đầu."}
                    </TableCell>
                  </TableRow>
                )}
                {products.map((p) => {
                  const needsAiPrice = !p.market_price || !p.deal_price;
                  const isChecking = checkingPriceIds.includes(p.id);
                  const imageClass = productImageViewClasses[productImageView].image;
                  return (
                  <TableRow key={p.id} className={p.profit_margin && p.profit_margin > 20 ? "bg-green-50 dark:bg-green-950" : ""}>
                    <TableCell>
                      {p.image &&
                        (p.url ? (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Xem trên Chợ Tốt"
                            className={`inline-block ${imageClass} shrink-0 overflow-hidden rounded transition-opacity hover:opacity-80`}
                          >
                            <img
                              src={normalizeImageUrl(p.image)}
                              alt=""
                              className={`${imageClass} aspect-square object-cover`}
                            />
                          </a>
                        ) : (
                          <img
                            src={normalizeImageUrl(p.image)}
                            alt=""
                            className={`${imageClass} aspect-square rounded object-cover`}
                          />
                        ))}
                    </TableCell>
                    <TableCell className="font-medium max-w-xs">
                      <ProductTitlePreview title={p.title} content={p.content} url={p.url} />
                    </TableCell>
                    <TableCell><Badge variant="secondary">{p.category}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDateTime(p.listed_at || p.created_at)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatPrice(p.price)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {p.deal_price ? (
                        <span
                          className={
                            p.deal_price < p.price
                              ? "text-green-700 dark:text-green-400 font-semibold"
                              : undefined
                          }
                          title="Giá nên thương lượng mua vào (≤ giá Chợ Tốt)"
                        >
                          {formatPrice(p.deal_price)}
                        </span>
                      ) : needsAiPrice ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isChecking}
                          onClick={() => void handleCheckPrice(p.id)}
                        >
                          {isChecking ? "Đang tìm…" : "Tìm hiểu"}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {p.market_price ? (
                        formatPrice(p.market_price)
                      ) : needsAiPrice && p.deal_price ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isChecking}
                          onClick={() => void handleCheckPrice(p.id)}
                        >
                          {isChecking ? "Đang tìm…" : "Tìm hiểu"}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">{isChecking ? "…" : "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.profit_margin != null ? (
                        <Badge variant={p.profit_margin > 15 ? "default" : p.profit_margin > 0 ? "secondary" : "destructive"}>
                          {p.profit_margin > 0 ? "+" : ""}{p.profit_margin}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">{isChecking ? "…" : "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMoveToTrash(p.id)}
                        >
                          Xóa
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={productsPage <= 1}
              onClick={() => goToProductsPage(productsPage - 1)}
            >
              Trước
            </Button>
            <span className="text-sm text-muted-foreground">
              Trang {productsPage}/{productsTotalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={productsPage >= productsTotalPages}
              onClick={() => goToProductsPage(productsPage + 1)}
            >
              Sau
            </Button>
          </div>
        </TabsContent>

        {/* Trash Tab */}
        <TabsContent value="trash">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle>Thùng rác</CardTitle>
            <Button
              variant="destructive"
              size="sm"
              disabled={deletedTotal === 0}
              onClick={handleEmptyTrash}
            >
              Xóa hết
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Danh mục</TableHead>
                    <TableHead className="text-right">Giá Chợ Tốt</TableHead>
                    <TableHead>Đã xóa</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deletedProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        Thùng rác đang trống.
                      </TableCell>
                    </TableRow>
                  )}
                  {deletedProducts.map((p) => (
                    <TableRow key={p.id}>
                        <TableCell className="font-medium max-w-md">
                          <Tooltip>
                            <TooltipTrigger className="block w-full truncate text-left cursor-help">
                              {p.title}
                            </TooltipTrigger>
                            <TooltipContent
                              side="bottom"
                              align="start"
                              className="max-w-md whitespace-pre-wrap break-words text-left leading-relaxed"
                            >
                              {p.content?.trim()
                                ? p.content
                                : "Chưa có nội dung mô tả cho tin này."}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{p.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatPrice(p.price)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(p.deleted_at || p.created_at)}
                      </TableCell>
                      <TableCell className="space-x-2">
                        <Button variant="outline" size="sm" onClick={() => handleRestoreProduct(p.id)}>
                          Khôi phục
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleHardDeleteProduct(p.id)}>
                          Xóa vĩnh viễn
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={deletedPage <= 1}
                onClick={() => goToDeletedPage(deletedPage - 1)}
              >
                Trước
              </Button>
              <span className="text-sm text-muted-foreground">
                Trang {deletedPage}/{deletedTotalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={deletedPage >= deletedTotalPages}
                onClick={() => goToDeletedPage(deletedPage + 1)}
              >
                Sau
              </Button>
            </div>
          </CardContent>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle>Danh mục theo dõi</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground ml-2 text-sm">ID: {c.chotot_category_id}</span>
                    </div>
                    <Button
                      variant={c.enabled ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleToggleCategory(c.id, !c.enabled)}
                    >
                      {c.enabled ? "Đang bật" : "Đã tắt"}
                    </Button>
                  </div>
                ))}
              </div>

              <Dialog>
                <DialogTrigger>
                  <Button className="mt-4">Thêm danh mục</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Thêm danh mục mới</DialogTitle>
                  </DialogHeader>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      await fetch("/api/categories", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "add",
                          name: form.get("name"),
                          chotot_category_id: form.get("chotot_category_id"),
                        }),
                      });
                      fetchCategories();
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <Label>Tên danh mục</Label>
                      <Input name="name" placeholder="VD: Điện thoại" required />
                    </div>
                    <div>
                      <Label>Mã danh mục Chợ Tốt</Label>
                      <Input name="chotot_category_id" placeholder="VD: 5030" required />
                    </div>
                    <Button type="submit">Thêm</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Keys Tab */}
        <TabsContent value="api-keys">
          <Card>
            <CardHeader>
              <CardTitle>Quản lý API Keys</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Kéo thả để xếp thứ tự ưu tiên (trên → dưới = chạy trước → sau). Key inactive/hết quota bị bỏ qua.
                Cuối cùng vẫn fallback scrape thuần nếu mọi AI thất bại.
                {reorderingKeys ? " Đang lưu thứ tự…" : ""}
              </p>

              <form onSubmit={handleAddApiKey} className="flex gap-2 mb-6">
                <Select value={newProvider} onValueChange={(v) => setNewProvider(v || "gemini")}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Provider">
                      {newProvider === "groq"
                        ? "Groq"
                        : newProvider === "cloudflare"
                          ? "Cloudflare"
                          : newProvider === "qwen"
                            ? "Qwen"
                            : newProvider === "openrouter"
                              ? "OpenRouter"
                              : "Gemini"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini</SelectItem>
                    <SelectItem value="groq">Groq (Qwen3.6-27B)</SelectItem>
                    <SelectItem value="cloudflare">Cloudflare Workers AI</SelectItem>
                    <SelectItem value="qwen">Qwen</SelectItem>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  name="api_key"
                  placeholder={
                    newProvider === "cloudflare" ? "ACCOUNT_ID|API_TOKEN" : "API Key"
                  }
                  required
                  className="flex-1"
                />
                <Input name="label" placeholder="Nhãn (tùy chọn)" className="w-40" />
                <Button type="submit" disabled={addingKey}>
                  {addingKey ? "Đang thêm..." : "Thêm"}
                </Button>
              </form>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Nhãn</TableHead>
                    <TableHead>Hôm nay</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((k, index) => (
                    <TableRow
                      key={k.id}
                      onDragOver={(e) => handleKeyDragOver(e, index)}
                      onDrop={() => void handleKeyDrop()}
                      className={reorderingKeys ? "opacity-70" : undefined}
                    >
                      <TableCell className="text-muted-foreground">
                        <button
                          type="button"
                          draggable={!reorderingKeys}
                          onDragStart={() => handleKeyDragStart(index)}
                          onDragEnd={handleKeyDragEnd}
                          className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1 rounded hover:bg-muted"
                          aria-label="Kéo để đổi thứ tự"
                        >
                          <GripVertical className="size-4" aria-hidden />
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{k.provider}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{k.api_key}</TableCell>
                      <TableCell>{k.label || "—"}</TableCell>
                      <TableCell>{k.requests_today} req</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            k.status === "active"
                              ? "default"
                              : k.status === "exhausted_today"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {k.status === "exhausted_today" ? "hết quota hôm nay" : k.status}
                        </Badge>
                        {k.last_error && (
                          <p className="text-xs text-destructive mt-1 max-w-xs truncate">{k.last_error}</p>
                        )}
                      </TableCell>
                      <TableCell className="space-x-1">
                        {(k.status === "error" || k.status === "exhausted_today") && (
                          <Button variant="outline" size="sm" onClick={() => handleResetKey(k.id)}>
                            Reset
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteKey(k.id)}>
                          Xóa
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {apiKeys.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                        Chưa có API key nào. Thêm key để bắt đầu tra giá tự động.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
    </TooltipProvider>
  );
}

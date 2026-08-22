"use client";

import { useEffect, useState, useCallback } from "react";
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

interface Product {
  id: number;
  chotot_id: string;
  title: string;
  price: number;
  category: string;
  image: string;
  url: string;
  market_price: number | null;
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

function normalizeImageUrl(url?: string): string {
  if (!url) return "";
  // Backward-compat for old malformed records in local DB.
  return url.replace("https://cdn.chotot.com/unsafe/585x440/https://", "https://");
}

export default function Dashboard() {
  const PAGE_SIZE = 10;
  const [products, setProducts] = useState<Product[]>([]);
  const [deletedProducts, setDeletedProducts] = useState<Product[]>([]);
  const [productsPage, setProductsPage] = useState(1);
  const [productsTotalPages, setProductsTotalPages] = useState(1);
  const [deletedPage, setDeletedPage] = useState(1);
  const [deletedTotalPages, setDeletedTotalPages] = useState(1);
  const [deletedTotal, setDeletedTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [newProvider, setNewProvider] = useState("gemini");
  const [addingKey, setAddingKey] = useState(false);

  const fetchProducts = useCallback(async () => {
    const params = new URLSearchParams({
      sortBy,
      page: String(productsPage),
      pageSize: String(PAGE_SIZE),
    });
    if (filter) params.set("category", filter);
    if (search) params.set("q", search);
    const res = await fetch(`/api/products?${params}`);
    const data = await res.json();
    setProducts(data.items || []);
    setProductsTotalPages(data.totalPages || 1);
  }, [filter, sortBy, productsPage, search]);

  const fetchDeletedProducts = useCallback(async () => {
    const res = await fetch(`/api/products?trash=1&page=${deletedPage}&pageSize=${PAGE_SIZE}`);
    const data = await res.json();
    setDeletedProducts(data.items || []);
    setDeletedTotalPages(data.totalPages || 1);
    setDeletedTotal(data.total || 0);
  }, [deletedPage]);

  const fetchCategories = async () => {
    const res = await fetch("/api/categories");
    setCategories(await res.json());
  };

  const fetchApiKeys = async () => {
    const res = await fetch("/api/api-keys");
    setApiKeys(await res.json());
  };

  useEffect(() => {
    fetchProducts();
    fetchDeletedProducts();
    fetchCategories();
    fetchApiKeys();
  }, [fetchProducts, fetchDeletedProducts]);

  useEffect(() => {
    setProductsPage(1);
  }, [filter, sortBy, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleScrape = async () => {
    setScraping(true);
    try {
      await fetch("/api/scrape", { method: "POST" });
      await fetchProducts();
    } finally {
      setScraping(false);
    }
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
        throw new Error("Không thêm được API key");
      }
      formEl.reset();
      setNewProvider("gemini");
      await fetchApiKeys();
    } catch (err) {
      console.error(err);
      alert("Thêm API key thất bại. Thử lại.");
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

  const handleMoveToTrash = async (id: number) => {
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "soft-delete", id }),
    });
    await fetchProducts();
    await fetchDeletedProducts();
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
    setDeletedPage(1);
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
    <main className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Chotot Deal Finder</h1>
        <Button onClick={handleScrape} disabled={scraping}>
          {scraping ? "Đang quét..." : "Quét sản phẩm mới"}
        </Button>
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
          <div className="flex flex-wrap gap-4 mb-4">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm theo tên sản phẩm hoặc mã tin..."
              className="w-full sm:w-80"
            />

            <Select value={filter} onValueChange={(v) => setFilter(v || "")}>
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

            <Select value={sortBy} onValueChange={(v) => { setSortBy(v || "created_at"); }}>
              <SelectTrigger className="w-48">
                <SelectValue>
                  {sortBy === "profit_margin"
                    ? "% Lời cao nhất"
                    : sortBy === "price"
                      ? "Giá"
                      : "Mới nhất"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Mới nhất</SelectItem>
                <SelectItem value="profit_margin">% Lời cao nhất</SelectItem>
                <SelectItem value="price">Giá</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Ảnh</TableHead>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>Danh mục</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead className="text-right">Giá Chợ Tốt</TableHead>
                  <TableHead className="text-right">Giá thị trường</TableHead>
                  <TableHead className="text-right">Chênh lệch</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {search
                        ? `Không tìm thấy sản phẩm cho "${search}".`
                        : "Chưa có sản phẩm. Nhấn \"Quét sản phẩm mới\" để bắt đầu."}
                    </TableCell>
                  </TableRow>
                )}
                {products.map((p) => (
                  <TableRow key={p.id} className={p.profit_margin && p.profit_margin > 20 ? "bg-green-50 dark:bg-green-950" : ""}>
                    <TableCell>
                      {p.image && (
                        <img src={normalizeImageUrl(p.image)} alt="" className="w-12 h-12 object-cover rounded" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium max-w-xs truncate">{p.title}</TableCell>
                    <TableCell><Badge variant="secondary">{p.category}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDateTime(p.listed_at || p.created_at)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatPrice(p.price)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {p.market_price ? formatPrice(p.market_price) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.profit_margin != null ? (
                        <Badge variant={p.profit_margin > 15 ? "default" : p.profit_margin > 0 ? "secondary" : "destructive"}>
                          {p.profit_margin > 0 ? "+" : ""}{p.profit_margin}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <a href={p.url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm">Xem</Button>
                        </a>
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
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={productsPage <= 1}
              onClick={() => setProductsPage((p) => Math.max(1, p - 1))}
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
              onClick={() => setProductsPage((p) => Math.min(productsTotalPages, p + 1))}
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
                      <TableCell className="font-medium max-w-md truncate">{p.title}</TableCell>
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
                onClick={() => setDeletedPage((p) => Math.max(1, p - 1))}
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
                onClick={() => setDeletedPage((p) => Math.min(deletedTotalPages, p + 1))}
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
                      <Input name="chotot_category_id" placeholder="VD: 5010" required />
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
                Thứ tự ưu tiên: Gemini (grounding) → DeepSeek → Qwen → OpenRouter → Scrape thuần
              </p>

              <form onSubmit={handleAddApiKey} className="flex gap-2 mb-6">
                <Select value={newProvider} onValueChange={(v) => setNewProvider(v || "gemini")}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Provider">
                      {newProvider === "deepseek"
                        ? "DeepSeek"
                        : newProvider === "qwen"
                          ? "Qwen"
                          : newProvider === "openrouter"
                            ? "OpenRouter"
                            : "Gemini"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini</SelectItem>
                    <SelectItem value="deepseek">DeepSeek</SelectItem>
                    <SelectItem value="qwen">Qwen</SelectItem>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                  </SelectContent>
                </Select>
                <Input name="api_key" placeholder="API Key" required className="flex-1" />
                <Input name="label" placeholder="Nhãn (tùy chọn)" className="w-40" />
                <Button type="submit" disabled={addingKey}>
                  {addingKey ? "Đang thêm..." : "Thêm"}
                </Button>
              </form>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Nhãn</TableHead>
                    <TableHead>Hôm nay</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell>
                        <Badge variant="outline">{k.provider}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{k.api_key}</TableCell>
                      <TableCell>{k.label || "—"}</TableCell>
                      <TableCell>{k.requests_today} req</TableCell>
                      <TableCell>
                        <Badge variant={k.status === "active" ? "default" : "destructive"}>
                          {k.status}
                        </Badge>
                        {k.last_error && (
                          <p className="text-xs text-destructive mt-1 max-w-xs truncate">{k.last_error}</p>
                        )}
                      </TableCell>
                      <TableCell className="space-x-1">
                        {k.status === "error" && (
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
                      <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
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
  );
}

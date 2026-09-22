"use client";

import { memo } from "react";
import { LayoutGrid, LayoutList } from "lucide-react";
import { ProductCardView } from "@/components/product-card-view";
import { ProductTitlePreview } from "@/components/dashboard/product-title-preview";
import { SortableTableHead } from "@/components/dashboard/sortable-table-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatPrice, normalizeImageUrl } from "@/lib/dashboard/format";
import {
  productImageViewClasses,
  type Category,
  type Product,
  type ProductImageView,
  type ProductsViewMode,
  type SortOrder,
} from "@/lib/dashboard/types";

type ProductsPanelProps = {
  products: Product[];
  categories: Category[];
  productsPage: number;
  productsTotalPages: number;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  search: string;
  filter: string;
  onFilterChange: (value: string) => void;
  sortBy: string;
  sortOrder: SortOrder;
  onSort: (column: string) => void;
  productImageView: ProductImageView;
  onProductImageViewChange: (value: ProductImageView) => void;
  productsView: ProductsViewMode;
  onProductsViewChange: (mode: ProductsViewMode) => void;
  cardIndex: number;
  onCardIndexChange: (index: number) => void;
  checkingPriceIds: number[];
  onCheckPrice: (id: number) => void;
  onDelete: (id: number) => void;
  onPageChange: (page: number) => void;
  checkingListings: boolean;
  listingCheckMessage: string;
  scraping: boolean;
  onCheckListings: () => void;
};

function ProductsPanelInner({
  products,
  categories,
  productsPage,
  productsTotalPages,
  searchInput,
  onSearchInputChange,
  search,
  filter,
  onFilterChange,
  sortBy,
  sortOrder,
  onSort,
  productImageView,
  onProductImageViewChange,
  productsView,
  onProductsViewChange,
  cardIndex,
  onCardIndexChange,
  checkingPriceIds,
  onCheckPrice,
  onDelete,
  onPageChange,
  checkingListings,
  listingCheckMessage,
  scraping,
  onCheckListings,
}: ProductsPanelProps) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Input
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          placeholder="Tìm theo tên sản phẩm hoặc mã tin..."
          className="w-full sm:w-80"
        />

        <Select value={filter} onValueChange={(v) => onFilterChange(v || "")}>
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
          <div
            className="flex items-center rounded-lg border p-0.5"
            role="group"
            aria-label="Chế độ xem sản phẩm"
          >
            <Button
              type="button"
              variant={productsView === "list" ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
              onClick={() => onProductsViewChange("list")}
              aria-pressed={productsView === "list"}
            >
              <LayoutList className="size-3.5" />
              Danh sách
            </Button>
            <Button
              type="button"
              variant={productsView === "card" ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
              onClick={() => onProductsViewChange("card")}
              aria-pressed={productsView === "card"}
            >
              <LayoutGrid className="size-3.5" />
              Thẻ
            </Button>
          </div>
          {productsView === "list" && (
            <Select
              value={productImageView}
              onValueChange={(value) =>
                onProductImageViewChange(value as ProductImageView)
              }
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
          )}
          <Button
            variant="outline"
            onClick={() => void onCheckListings()}
            disabled={checkingListings || scraping}
            title={
              scraping
                ? "Vui lòng chờ quét sản phẩm mới hoàn tất"
                : "Kiểm tra detail link của toàn bộ tin đang có và chuyển tin không còn sống vào thùng rác"
            }
          >
            {checkingListings ? "Đang kiểm tra còn hàng..." : "Kiểm tra còn hàng"}
          </Button>
          {listingCheckMessage && (
            <span className="text-sm text-muted-foreground">{listingCheckMessage}</span>
          )}
        </div>
      </div>

      {productsView === "card" ? (
        <ProductCardView
          products={products}
          cardIndex={cardIndex}
          onCardIndexChange={onCardIndexChange}
          checkingPriceIds={checkingPriceIds}
          onCheckPrice={onCheckPrice}
          onDelete={onDelete}
          page={productsPage}
          totalPages={productsTotalPages}
          onPageChange={onPageChange}
          search={search}
        />
      ) : (
        <>
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
                    onSort={onSort}
                  />
                  <SortableTableHead
                    label="Danh mục"
                    column="category"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                  />
                  <SortableTableHead
                    label="Thời gian"
                    column="listed_at"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                  />
                  <SortableTableHead
                    label="Giá Chợ Tốt"
                    column="price"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="Giá deal mua (AI)"
                    column="deal_price"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="Giá thị trường (bán)(AI)"
                    column="market_price"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="Chênh lệch"
                    column="profit_margin"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    className="text-right"
                  />
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      {search
                        ? `Không tìm thấy sản phẩm cho "${search}".`
                        : 'Chưa có sản phẩm. Nhấn "Quét sản phẩm mới" để bắt đầu.'}
                    </TableCell>
                  </TableRow>
                )}
                {products.map((p) => {
                  const needsAiPrice = !p.market_price || !p.deal_price;
                  const isChecking = checkingPriceIds.includes(p.id);
                  const imageClass = productImageViewClasses[productImageView].image;
                  return (
                    <TableRow
                      key={p.id}
                      className={
                        p.profit_margin && p.profit_margin > 20
                          ? "bg-green-50 dark:bg-green-950"
                          : ""
                      }
                    >
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
                      <TableCell className="max-w-xs font-medium">
                        <ProductTitlePreview title={p.title} content={p.content} url={p.url} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{p.category}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(p.listed_at || p.created_at)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPrice(p.price)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {p.deal_price ? (
                          <span
                            className={
                              p.deal_price < p.price
                                ? "font-semibold text-green-700 dark:text-green-400"
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
                            onClick={() => void onCheckPrice(p.id)}
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
                            onClick={() => void onCheckPrice(p.id)}
                          >
                            {isChecking ? "Đang tìm…" : "Tìm hiểu"}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">
                            {isChecking ? "…" : "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.profit_margin != null ? (
                          <Badge
                            variant={
                              p.profit_margin > 15
                                ? "default"
                                : p.profit_margin > 0
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            {p.profit_margin > 0 ? "+" : ""}
                            {p.profit_margin}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            {isChecking ? "…" : "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onDelete(p.id)}
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
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={productsPage <= 1}
              onClick={() => onPageChange(productsPage - 1)}
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
              onClick={() => onPageChange(productsPage + 1)}
            >
              Sau
            </Button>
          </div>
        </>
      )}
    </>
  );
}

export const ProductsPanel = memo(ProductsPanelInner);

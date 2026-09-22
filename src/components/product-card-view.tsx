"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ProductCardItem = {
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
};

function formatPrice(price: number): string {
  return new Intl.NumberFormat("vi-VN").format(price) + "đ";
}

function parseDbDate(value: string | number): Date {
  if (typeof value === "number") return new Date(value);
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
  return url.replace("https://cdn.chotot.com/unsafe/585x440/https://", "https://");
}

function CardTitlePreview({
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
      className="block w-full text-left text-base font-semibold leading-snug cursor-pointer underline-offset-2 hover:underline"
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

const SWIPE_THRESHOLD_PX = 50;

type ProductCardViewProps = {
  products: ProductCardItem[];
  cardIndex: number;
  onCardIndexChange: (index: number) => void;
  checkingPriceIds: number[];
  onCheckPrice: (id: number) => void;
  onDelete: (id: number) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  search?: string;
};

export function ProductCardView({
  products,
  cardIndex,
  onCardIndexChange,
  checkingPriceIds,
  onCheckPrice,
  onDelete,
  page,
  totalPages,
  onPageChange,
  search = "",
}: ProductCardViewProps) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const safeIndex =
    products.length === 0 ? 0 : Math.min(Math.max(0, cardIndex), products.length - 1);
  const product = products[safeIndex];

  useEffect(() => {
    if (products.length === 0) return;
    if (cardIndex !== safeIndex) onCardIndexChange(safeIndex);
  }, [cardIndex, safeIndex, products.length, onCardIndexChange]);

  const goPrev = () => {
    if (safeIndex > 0) {
      onCardIndexChange(safeIndex - 1);
      return;
    }
    if (page > 1) onPageChange(page - 1);
  };

  const goNext = () => {
    if (safeIndex < products.length - 1) {
      onCardIndexChange(safeIndex + 1);
      return;
    }
    if (page < totalPages) onPageChange(page + 1);
  };

  const canGoPrev = safeIndex > 0 || page > 1;
  const canGoNext = safeIndex < products.length - 1 || page < totalPages;

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    setDragOffset(0);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (Math.abs(dy) > Math.abs(dx)) {
      setDragOffset(0);
      return;
    }
    setDragOffset(dx);
  };

  const onTouchEnd = () => {
    if (!touchStart.current) return;
    const dx = dragOffset;
    touchStart.current = null;
    setDragOffset(0);
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  if (products.length === 0) {
    return (
      <div className="rounded-xl border px-4 py-12 text-center text-muted-foreground">
        {search
          ? `Không tìm thấy sản phẩm cho "${search}".`
          : 'Chưa có sản phẩm. Nhấn "Quét sản phẩm mới" để bắt đầu.'}
      </div>
    );
  }

  const needsAiPrice = !product.market_price || !product.deal_price;
  const isChecking = checkingPriceIds.includes(product.id);
  const highlightDeal = product.profit_margin != null && product.profit_margin > 20;

  return (
    <div className="space-y-3">
      <div
        className={`touch-pan-y select-none overflow-hidden rounded-xl border ${
          highlightDeal ? "bg-green-50 dark:bg-green-950" : "bg-background"
        }`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          touchStart.current = null;
          setDragOffset(0);
        }}
      >
        <div
          className="transition-transform duration-150 ease-out"
          style={{ transform: `translateX(${dragOffset * 0.35}px)` }}
        >
          <div className="relative aspect-[4/3] w-full bg-muted">
            {product.image ? (
              product.url ? (
                <a
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Xem trên Chợ Tốt"
                  className="block size-full"
                >
                  <img
                    src={normalizeImageUrl(product.image)}
                    alt=""
                    className="size-full object-cover"
                    draggable={false}
                  />
                </a>
              ) : (
                <img
                  src={normalizeImageUrl(product.image)}
                  alt=""
                  className="size-full object-cover"
                  draggable={false}
                />
              )
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                Không có ảnh
              </div>
            )}
            {product.profit_margin != null && (
              <div className="absolute right-3 top-3">
                <Badge
                  variant={
                    product.profit_margin > 15
                      ? "default"
                      : product.profit_margin > 0
                        ? "secondary"
                        : "destructive"
                  }
                  className="text-sm shadow-sm"
                >
                  {product.profit_margin > 0 ? "+" : ""}
                  {product.profit_margin}%
                </Badge>
              </div>
            )}
          </div>

          <div className="space-y-4 p-4">
            <CardTitlePreview
              title={product.title}
              content={product.content}
              url={product.url}
            />

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{product.category}</Badge>
              <span>{formatDateTime(product.listed_at || product.created_at)}</span>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Giá Chợ Tốt</dt>
                <dd className="font-mono font-medium">{formatPrice(product.price)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Giá deal mua (AI)</dt>
                <dd className="font-mono font-medium">
                  {product.deal_price ? (
                    <span
                      className={
                        product.deal_price < product.price
                          ? "font-semibold text-green-700 dark:text-green-400"
                          : undefined
                      }
                    >
                      {formatPrice(product.deal_price)}
                    </span>
                  ) : needsAiPrice ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isChecking}
                      onClick={() => onCheckPrice(product.id)}
                    >
                      {isChecking ? "Đang tìm…" : "Tìm hiểu"}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Giá thị trường (bán)</dt>
                <dd className="font-mono font-medium">
                  {product.market_price ? (
                    formatPrice(product.market_price)
                  ) : needsAiPrice && product.deal_price ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isChecking}
                      onClick={() => onCheckPrice(product.id)}
                    >
                      {isChecking ? "Đang tìm…" : "Tìm hiểu"}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">{isChecking ? "…" : "—"}</span>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Chênh lệch</dt>
                <dd>
                  {product.profit_margin != null ? (
                    <Badge
                      variant={
                        product.profit_margin > 15
                          ? "default"
                          : product.profit_margin > 0
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {product.profit_margin > 0 ? "+" : ""}
                      {product.profit_margin}%
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">{isChecking ? "…" : "—"}</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => onDelete(product.id)}
              >
                Xóa
              </Button>
              {product.url && (
                <a
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
                >
                  <ExternalLink className="size-4" />
                  Chợ Tốt
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          disabled={!canGoPrev}
          onClick={goPrev}
          aria-label="Sản phẩm trước"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center text-sm text-muted-foreground">
          <div>
            {safeIndex + 1} / {products.length}
            {totalPages > 1 ? ` · trang ${page}/${totalPages}` : ""}
          </div>
          <div className="text-xs">Vuốt trái/phải để chuyển</div>
        </div>
        <Button
          variant="outline"
          size="icon"
          disabled={!canGoNext}
          onClick={goNext}
          aria-label="Sản phẩm tiếp"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

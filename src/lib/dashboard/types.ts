export type SortOrder = "asc" | "desc";
export type ProductImageView = "small" | "medium" | "large";
export type ProductsViewMode = "list" | "card";

export type ScrapeSettingsState = {
  personalOnly: boolean;
  minPrice: number;
  maxPrice: number;
  minMarginPercent: number;
  /** Case-insensitive substrings; skip ads if title/body contains any. */
  skipKeywords: string[];
};

export type ListingCheckStatus = {
  running: boolean;
  checked: number;
  total: number;
  deleted: number;
  lastError: string | null;
};

export interface Product {
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
  /** 1 = Bán chuyên, 0 = Cá nhân (từ Chợ Tốt company_ad) */
  company_ad?: number | null;
}

export interface Category {
  id: number;
  name: string;
  chotot_category_id: string;
  enabled: number;
}

export interface ApiKey {
  id: number;
  provider: string;
  api_key: string;
  label: string;
  priority: number;
  requests_today: number;
  last_error: string | null;
  status: string;
}

export const productImageViewClasses: Record<
  ProductImageView,
  { column: string; image: string }
> = {
  small: { column: "w-16", image: "size-12" },
  medium: { column: "w-24", image: "size-24" },
  large: { column: "w-36", image: "size-36" },
};

export const PAGE_SIZE = 10;

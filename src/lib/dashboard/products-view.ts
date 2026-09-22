import type { ProductsViewMode } from "@/lib/dashboard/types";

const PRODUCTS_VIEW_STORAGE_KEY_MOBILE = "deal-finder-products-view-mobile";
const PRODUCTS_VIEW_STORAGE_KEY_DESKTOP = "deal-finder-products-view-desktop";
/** Legacy single key — remove so mobile/desktop defaults are not crossed. */
const PRODUCTS_VIEW_STORAGE_KEY_LEGACY = "deal-finder-products-view";

export function isMobileProductsViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

function productsViewStorageKey(mobile: boolean): string {
  return mobile ? PRODUCTS_VIEW_STORAGE_KEY_MOBILE : PRODUCTS_VIEW_STORAGE_KEY_DESKTOP;
}

export function readProductsViewForViewport(mobile: boolean): ProductsViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(productsViewStorageKey(mobile));
    if (raw === "list" || raw === "card") return raw;
  } catch {
    // ignore
  }
  return null;
}

export function defaultProductsViewForViewport(
  mobile = isMobileProductsViewport(),
): ProductsViewMode {
  return mobile ? "card" : "list";
}

export function resolveProductsView(): ProductsViewMode {
  const mobile = isMobileProductsViewport();
  return readProductsViewForViewport(mobile) ?? defaultProductsViewForViewport(mobile);
}

export function persistProductsViewMode(mode: ProductsViewMode): void {
  try {
    window.localStorage.setItem(productsViewStorageKey(isMobileProductsViewport()), mode);
  } catch {
    // ignore
  }
}

export function clearLegacyProductsViewStorage(): void {
  try {
    window.localStorage.removeItem(PRODUCTS_VIEW_STORAGE_KEY_LEGACY);
  } catch {
    // ignore
  }
}

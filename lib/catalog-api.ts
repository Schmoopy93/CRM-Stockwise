import type { CatalogItem, ShopCatalogSettings } from "./types";

/** Cache tag that ties every cached Firestore read for one shop's public
 * catalog together, so a catalog write can invalidate all of them at once. */
export function catalogCacheTag(shopId: string) {
  return `catalog:${shopId}`;
}

export interface CatalogPageResponse {
  shop: ShopCatalogSettings | null;
  items: CatalogItem[];
  /** Items needed outside the current page: an open product link or a saved cart. */
  extras: CatalogItem[];
  total: number;
  /** Every visible product in the shop, before filters. */
  catalogTotal: number;
  /** Products matching search/stock/price, before the category filter. */
  baseTotal: number;
  categories: Array<[string, number]>;
  hasPrices: boolean;
  page: number;
  hasMore: boolean;
}

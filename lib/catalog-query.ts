import type { CatalogField, CatalogItem } from "./types";
import { matchesCatalogQuery, type CatalogSort } from "./catalog-filter.ts";

export function catalogStockForVariant(item: CatalogItem, index: number) {
  if (item.stockQuantity === undefined) return 0;
  if (item.variants.length === 0) return item.stockQuantity;
  const variantId = item.variantIds?.[index];
  return variantId ? item.variantStock?.[variantId] ?? 0 : 0;
}

export function catalogItemAvailable(item: CatalogItem) {
  return item.variants.length > 0
    ? item.variants.some((_, index) => catalogStockForVariant(item, index) > 0)
    : (item.stockQuantity ?? 0) > 0;
}

function fieldSearchText(field: CatalogField) {
  return [
    field.label,
    ...Object.values(field.labels ?? {}),
    typeof field.value === "boolean" ? (field.value ? "da yes true" : "ne no false") : String(field.value),
    ...Object.values(field.values ?? {}),
  ];
}

/** Every locale is indexed, not only the one on screen, so a shared link that
 * switches language still finds the same products on the server. */
export function catalogItemSearchText(item: CatalogItem) {
  return [
    item.name,
    item.category,
    ...item.variants,
    ...item.fields.flatMap(fieldSearchText),
  ].join(" ");
}

export interface CatalogFilterInput {
  search?: string;
  category?: string;
  inStockOnly?: boolean;
  /** Base-currency bounds; the client's price filter is quoted in its own currency. */
  priceMin?: number;
  priceMax?: number;
}

export interface CatalogFilterResult {
  base: CatalogItem[];
  matched: CatalogItem[];
  /** Counts after search, stock and price filters, before the category filter. */
  categories: Array<[string, number]>;
}

export function filterCatalogItems(
  items: CatalogItem[],
  { search = "", category = "all", inStockOnly = false, priceMin, priceMax }: CatalogFilterInput
): CatalogFilterResult {
  const pricedFilter = priceMin !== undefined || priceMax !== undefined;
  const query = search.trim();
  const base = items.filter((item) => {
    if (query && !matchesCatalogQuery(catalogItemSearchText(item), query)) return false;
    if (inStockOnly && !catalogItemAvailable(item)) return false;
    if (pricedFilter) {
      if (item.salePrice === undefined) return false;
      if (priceMin !== undefined && item.salePrice < priceMin) return false;
      if (priceMax !== undefined && item.salePrice > priceMax) return false;
    }
    return true;
  });

  const counts = new Map<string, number>();
  for (const item of base) {
    if (item.category) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  if (category !== "all" && !counts.has(category)) counts.set(category, 0);

  return {
    base,
    matched: category === "all" ? base : base.filter((item) => item.category === category),
    categories: Array.from(counts.entries()),
  };
}

export function sortCatalogItems(items: CatalogItem[], sort: CatalogSort) {
  if (sort === "name") return items;
  const direction = sort === "priceAsc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (a.salePrice === undefined) return b.salePrice === undefined ? 0 : 1;
    if (b.salePrice === undefined) return -1;
    return (a.salePrice - b.salePrice) * direction;
  });
}

export function paginateCatalogItems(items: CatalogItem[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    hasMore: start + pageSize < items.length,
  };
}

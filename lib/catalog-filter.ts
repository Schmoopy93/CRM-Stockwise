export type CatalogSort = "name" | "priceAsc" | "priceDesc";

export const CATALOG_PAGE_SIZE = 24;

export function parseSortParam(value: string | null): CatalogSort {
  return value === "priceAsc" || value === "priceDesc" ? value : "name";
}

/** Search should ignore case and diacritics, so "caj" finds "čaj" and "dacki"
 * finds "đački". NFD covers most letters; đ has no compatibility decomposition. */
export function foldCatalogText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

/** Every word has to be present somewhere in the item, in any order. */
export function matchesCatalogQuery(searchable: string, query: string): boolean {
  const tokens = foldCatalogText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = foldCatalogText(searchable);
  return tokens.every((token) => haystack.includes(token));
}

/** Empty or invalid input means "no bound", not a filter of 0. */
export function parsePriceInput(value: string): number | undefined {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function orderedPriceBounds(min?: number, max?: number) {
  if (min !== undefined && max !== undefined && min > max) return { min: max, max: min };
  return { min, max };
}

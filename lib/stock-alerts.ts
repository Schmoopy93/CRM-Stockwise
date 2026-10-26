import type { Product } from "./types";

/** A product with no threshold (minStock 0) is never "low", even at zero —
 * that is how a shop says it does not want to track a minimum for this item. */
export type StockLevel = "ok" | "low" | "out";

export interface LowStockProduct {
  product: Product;
  level: "low" | "out";
  /** Stock as a fraction of the threshold; used only for ordering, never shown. */
  ratio: number;
}

export function stockLevel(product: Pick<Product, "minStock" | "totalQuantity">): StockLevel {
  if (product.minStock <= 0) return "ok";
  if (product.totalQuantity <= 0) return "out";
  if (product.totalQuantity <= product.minStock) return "low";
  return "ok";
}

/** Products that need attention, emptiest first: an out-of-stock item is more
 * urgent than one that merely hit its threshold, and within each group the one
 * closest to zero comes first. */
export function lowStockProducts(products: Product[]): LowStockProduct[] {
  return products
    .flatMap((product) => {
      const level = stockLevel(product);
      if (level === "ok") return [];
      return [{
        product,
        level,
        ratio: product.totalQuantity / Math.max(product.minStock, 1),
      }];
    })
    .sort((a, b) => a.ratio - b.ratio || a.product.name.localeCompare(b.product.name));
}

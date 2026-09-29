export interface StockTotals {
  variantQuantity: number;
  productQuantity: number;
}

/** Calculate a stock change without permitting fractional or negative inventory. */
export function applyStockDelta(
  variantQuantity: number,
  productQuantity: number,
  delta: number
): StockTotals {
  if (!Number.isSafeInteger(variantQuantity) || variantQuantity < 0) {
    throw new Error("Current variant quantity must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(productQuantity) || productQuantity < 0) {
    throw new Error("Current product quantity must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(delta) || delta === 0) {
    throw new Error("Stock delta must be a non-zero safe integer");
  }

  const nextVariantQuantity = variantQuantity + delta;
  const nextProductQuantity = productQuantity + delta;
  if (nextVariantQuantity < 0) throw new Error("Insufficient variant stock");
  if (nextProductQuantity < 0) throw new Error("Insufficient product stock");
  if (!Number.isSafeInteger(nextVariantQuantity) || !Number.isSafeInteger(nextProductQuantity)) {
    throw new Error("Stock quantity exceeds the safe integer range");
  }

  return {
    variantQuantity: nextVariantQuantity,
    productQuantity: nextProductQuantity,
  };
}

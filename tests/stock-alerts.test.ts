import test from "node:test";
import assert from "node:assert/strict";
import { lowStockProducts, stockLevel } from "../lib/stock-alerts.ts";
import type { Product } from "../lib/types.ts";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Jacket",
    sku: "J-1",
    category: "",
    imageUrl: "",
    images: [],
    minStock: 3,
    totalQuantity: 10,
    customFieldDefinitions: [],
    customFieldValues: {},
    ...overrides,
  };
}

test("an item without a threshold is never treated as low, even at zero", () => {
  assert.equal(stockLevel({ minStock: 0, totalQuantity: 0 }), "ok");
  assert.equal(stockLevel({ minStock: 0, totalQuantity: 5 }), "ok");
});

test("the level distinguishes empty from merely low", () => {
  assert.equal(stockLevel({ minStock: 3, totalQuantity: 0 }), "out");
  assert.equal(stockLevel({ minStock: 3, totalQuantity: 1 }), "low");
  assert.equal(stockLevel({ minStock: 3, totalQuantity: 3 }), "low");
  assert.equal(stockLevel({ minStock: 3, totalQuantity: 4 }), "ok");
});

test("products that need attention are ordered emptiest first", () => {
  const rows = lowStockProducts([
    makeProduct({ id: "ok", name: "Scarf", totalQuantity: 9 }),
    makeProduct({ id: "half", name: "Boots", minStock: 4, totalQuantity: 2 }),
    makeProduct({ id: "empty-b", name: "Zipped Hoodie", totalQuantity: 0 }),
    makeProduct({ id: "empty-a", name: "Anorak", totalQuantity: 0 }),
    makeProduct({ id: "edge", name: "Cap", minStock: 2, totalQuantity: 2 }),
  ]);
  assert.deepEqual(rows.map((row) => row.product.id), ["empty-a", "empty-b", "half", "edge"]);
  assert.deepEqual(rows.map((row) => row.level), ["out", "out", "low", "low"]);
  assert.deepEqual(lowStockProducts([]), []);
});

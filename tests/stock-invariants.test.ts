import assert from "node:assert/strict";
import test from "node:test";
import { applyStockDelta } from "../lib/stock-invariants.ts";

test("increases a variant and product total together", () => {
  assert.deepEqual(applyStockDelta(4, 12, 3), {
    variantQuantity: 7,
    productQuantity: 15,
  });
});

test("decreases a variant and product total together", () => {
  assert.deepEqual(applyStockDelta(4, 12, -2), {
    variantQuantity: 2,
    productQuantity: 10,
  });
});

test("rejects reducing a variant below zero", () => {
  assert.throws(() => applyStockDelta(2, 12, -3), /Insufficient variant stock/);
});

test("rejects reducing product total below zero", () => {
  assert.throws(() => applyStockDelta(5, 1, -2), /Insufficient product stock/);
});

test("rejects zero and fractional movements", () => {
  assert.throws(() => applyStockDelta(2, 2, 0), /non-zero safe integer/);
  assert.throws(() => applyStockDelta(2, 2, 0.5), /non-zero safe integer/);
});

test("rejects invalid stored quantities and unsafe overflow", () => {
  assert.throws(() => applyStockDelta(-1, 2, 1), /variant quantity/);
  assert.throws(() => applyStockDelta(1, Number.MAX_SAFE_INTEGER, 1), /safe integer range/);
});

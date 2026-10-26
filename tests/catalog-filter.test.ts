import test from "node:test";
import assert from "node:assert/strict";
import {
  matchesCatalogQuery,
  orderedPriceBounds,
  parsePriceInput,
  parseSortParam,
} from "../app/catalog/[shopId]/catalog-filter.ts";

test("search ignores case, diacritics and word order", () => {
  assert.equal(matchesCatalogQuery("Čaj od nane", "caj"), true);
  assert.equal(matchesCatalogQuery("Đački ranac", "dacki"), true);
  assert.equal(matchesCatalogQuery("Crna pamučna majica", "majica crna"), true);
  assert.equal(matchesCatalogQuery("Crna pamučna majica", "majica plava"), false);
  assert.equal(matchesCatalogQuery("Bilo šta", "   "), true);
});

test("price input accepts decimal comma and rejects unusable values", () => {
  assert.equal(parsePriceInput("12,5"), 12.5);
  assert.equal(parsePriceInput(" 20 "), 20);
  assert.equal(parsePriceInput("0"), 0);
  assert.equal(parsePriceInput(""), undefined);
  assert.equal(parsePriceInput("-1"), undefined);
  assert.equal(parsePriceInput("abc"), undefined);
  assert.equal(parsePriceInput("Infinity"), undefined);
});

test("price bounds swap when the shopper types them backwards", () => {
  assert.deepEqual(orderedPriceBounds(50, 10), { min: 10, max: 50 });
  assert.deepEqual(orderedPriceBounds(10, undefined), { min: 10, max: undefined });
  assert.deepEqual(orderedPriceBounds(undefined, 10), { min: undefined, max: 10 });
  assert.deepEqual(orderedPriceBounds(undefined, undefined), { min: undefined, max: undefined });
});

test("unknown sort falls back to name order", () => {
  assert.equal(parseSortParam("priceAsc"), "priceAsc");
  assert.equal(parseSortParam("priceDesc"), "priceDesc");
  assert.equal(parseSortParam("name"), "name");
  assert.equal(parseSortParam("unknown"), "name");
  assert.equal(parseSortParam(null), "name");
});

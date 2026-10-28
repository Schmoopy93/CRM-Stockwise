import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogItemAvailable,
  catalogStockForVariant,
  filterCatalogItems,
  paginateCatalogItems,
  sortCatalogItems,
  type CatalogFilterInput,
} from "../lib/catalog-query.ts";
import type { CatalogItem } from "../lib/types.ts";

function item(overrides: Partial<CatalogItem> & { id: string }): CatalogItem {
  return {
    name: overrides.id,
    category: "",
    imageUrl: "",
    images: [],
    isNew: false,
    variants: [],
    fields: [],
    hidden: false,
    ...overrides,
  };
}

const majica = item({
  id: "majica",
  name: "Crna pamučna majica",
  category: "Odeća",
  salePrice: 2000,
  stockQuantity: 5,
  variants: ["S", "M"],
  variantIds: ["s", "m"],
  variantStock: { s: 0, m: 2 },
  fields: [{
    label: "Boja",
    labels: { en: "Color" },
    type: "text",
    value: "crna",
    values: { en: "black" },
  }],
});
const caj = item({ id: "caj", name: "Čaj od nane", category: "Hrana", salePrice: 300, stockQuantity: 0 });
const ranac = item({ id: "ranac", name: "Đački ranac", category: "Odeća", stockQuantity: 3 });
const patike = item({
  id: "patike",
  name: "Patike",
  category: "Obuća",
  salePrice: 5000,
  stockQuantity: 10,
  variants: ["42"],
  variantIds: ["42"],
  variantStock: { "42": 0 },
});
const catalog = [majica, caj, ranac, patike];

function filter(input: CatalogFilterInput = {}) {
  return filterCatalogItems(catalog, input);
}

test("stock is read per variant and a missing quantity means unavailable", () => {
  assert.equal(catalogStockForVariant(majica, 0), 0);
  assert.equal(catalogStockForVariant(majica, 1), 2);
  assert.equal(catalogItemAvailable(majica), true);
  assert.equal(catalogItemAvailable(caj), false);
  assert.equal(catalogItemAvailable(ranac), true);
  // The product-level quantity must not mask a sold-out variant.
  assert.equal(catalogItemAvailable(patike), false);
  assert.equal(catalogStockForVariant(item({ id: "no-stock" }), 0), 0);
  assert.equal(catalogItemAvailable(item({ id: "no-stock" })), false);
});

test("search matches folded text, variants and localized custom fields", () => {
  const names = (search: string) => filter({ search }).base.map((entry) => entry.id).sort();
  assert.deepEqual(names("caj"), ["caj"]);
  assert.deepEqual(names("MAJICA crna"), ["majica"]);
  assert.deepEqual(names("dacki"), ["ranac"]);
  assert.deepEqual(names("42"), ["patike"]);
  assert.deepEqual(names("color black"), ["majica"]);
  assert.deepEqual(names("odeca"), ["majica", "ranac"]);
  assert.deepEqual(names("nepostojece"), []);
});

test("category counts ignore the selected category but respect other filters", () => {
  const all = filter();
  assert.equal(all.base.length, 4);
  assert.deepEqual(Object.fromEntries(all.categories), { Odeća: 2, Hrana: 1, Obuća: 1 });
  assert.deepEqual(all.matched.map((entry) => entry.id), ["majica", "caj", "ranac", "patike"]);

  const clothing = filter({ category: "Odeća" });
  assert.equal(clothing.base.length, 4);
  assert.deepEqual(clothing.matched.map((entry) => entry.id), ["majica", "ranac"]);
  assert.deepEqual(Object.fromEntries(clothing.categories), { Odeća: 2, Hrana: 1, Obuća: 1 });

  const inStock = filter({ inStockOnly: true });
  assert.deepEqual(inStock.base.map((entry) => entry.id), ["majica", "ranac"]);
  assert.deepEqual(Object.fromEntries(inStock.categories), { Odeća: 2 });

  const emptyCategory = filter({ search: "majica", category: "Hrana" });
  assert.deepEqual(emptyCategory.matched, []);
  assert.deepEqual(Object.fromEntries(emptyCategory.categories), { Odeća: 1, Hrana: 0 });
});

test("price bounds exclude products without a price", () => {
  const cheap = filter({ priceMin: 100, priceMax: 1000 });
  assert.deepEqual(cheap.base.map((entry) => entry.id), ["caj"]);
  const expensive = filter({ priceMin: 2000 });
  assert.deepEqual(expensive.base.map((entry) => entry.id), ["majica", "patike"]);
  const free = filter({ priceMax: 0 });
  assert.deepEqual(free.base, []);
});

test("price sorting keeps unpriced products last in both directions", () => {
  assert.deepEqual(
    sortCatalogItems(catalog, "priceAsc").map((entry) => entry.id),
    ["caj", "majica", "patike", "ranac"]
  );
  assert.deepEqual(
    sortCatalogItems(catalog, "priceDesc").map((entry) => entry.id),
    ["patike", "majica", "caj", "ranac"]
  );
  assert.equal(sortCatalogItems(catalog, "name"), catalog);
});

test("pagination reports whether another page exists", () => {
  const first = paginateCatalogItems(catalog, 1, 2);
  assert.deepEqual(first.items.map((entry) => entry.id), ["majica", "caj"]);
  assert.equal(first.hasMore, true);

  const second = paginateCatalogItems(catalog, 2, 2);
  assert.deepEqual(second.items.map((entry) => entry.id), ["ranac", "patike"]);
  assert.equal(second.hasMore, false);

  const beyond = paginateCatalogItems(catalog, 3, 2);
  assert.deepEqual(beyond.items, []);
  assert.equal(beyond.hasMore, false);
});

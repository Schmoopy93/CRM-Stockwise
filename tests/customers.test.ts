import test from "node:test";
import assert from "node:assert/strict";
import {
  collectTags,
  contactKey,
  countNewCustomers,
  customerMatches,
  favoriteProducts,
  MAX_CUSTOMER_TAGS,
  MAX_TAG_LENGTH,
  normalizeCustomer,
  normalizeTag,
  orderCountsByCustomer,
  parseTags,
  sameContact,
  sortCustomers,
  spendingByCustomer,
  standingSales,
} from "../lib/customers.ts";
import type { CatalogOrder, Customer, Sale } from "../lib/types.ts";

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "c1",
    name: "Ana Petrović",
    contact: "+381 64 123-4567",
    email: "ana@example.com",
    note: "",
    tags: [],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeSale(lines: Sale["lines"], id = "s1"): Sale {
  return {
    id,
    lines,
    total: lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    channel: "store",
    buyerName: "Ana",
    buyerContact: "+381641234567",
    note: "",
    actorUid: "staff",
    actorName: "Staff",
    createdAt: null,
  };
}

function saleLine(productId: string, productName: string, quantity: number, unitPrice: number): Sale["lines"][number] {
  return { productId, productName, variantId: `${productId}-v`, variantLabel: "M", quantity, unitPrice };
}

function makeOrder(overrides: Partial<CatalogOrder> = {}): CatalogOrder {
  return {
    id: "o1",
    code: "ABC234",
    lines: [{ productId: "p1", productName: "Jacket", variantLabel: "M", quantity: 1, unitPrice: 10 }],
    total: 10,
    customerName: "Ana",
    customerContact: "+381641234567",
    note: "",
    channel: "catalog",
    status: "new",
    createdAt: null,
    ...overrides,
  };
}

test("a name is required and everything else is optional", () => {
  assert.throws(() => normalizeCustomer({ name: "   " }), /CUSTOMER_NAME_REQUIRED/);
  assert.deepEqual(normalizeCustomer({ name: "Ana" }), {
    name: "Ana",
    contact: "",
    email: "",
    note: "",
    tags: [],
  });
});

test("fields are trimmed, whitespace-collapsed and capped at the rule's length", () => {
  const result = normalizeCustomer({
    name: "  Ana   Petrović  ",
    contact: "  +381 64  123 4567 ",
    note: "first   line\n\nsecond",
  });
  assert.equal(result.name, "Ana Petrović");
  assert.equal(result.contact, "+381 64 123 4567");
  assert.equal(result.note, "first line second");
  assert.equal(result.name.length <= 100, true);
  assert.equal(result.contact.length <= 100, true);
});

test("a malformed email is rejected rather than stored", () => {
  for (const bad of ["ana@", "@example.com", "ana@example", "ana example.com", "a@b..com"]) {
    assert.throws(() => normalizeCustomer({ name: "Ana", email: bad }), /CUSTOMER_EMAIL_INVALID/, bad);
  }
  assert.equal(normalizeCustomer({ name: "Ana", email: "ana.b+tag@mail.example.co.uk" }).email, "ana.b+tag@mail.example.co.uk");
});

test("tags fold to lower case and lose the # a shop naturally types", () => {
  assert.equal(normalizeTag("  #VIP "), "vip");
  assert.equal(normalizeTag("Wholesale"), "wholesale");
  assert.equal(normalizeTag("   "), "");
  assert.equal(normalizeTag("##"), "");
  assert.equal(normalizeTag("x".repeat(80)).length, MAX_TAG_LENGTH);
});

test("a comma separated tag string and an array normalize to the same value", () => {
  assert.deepEqual(parseTags("vip, wholesale ,Regular"), ["vip", "wholesale", "regular"]);
  assert.deepEqual(parseTags(["vip", "wholesale", "regular"]), ["vip", "wholesale", "regular"]);
  assert.deepEqual(parseTags(undefined), []);
  assert.deepEqual(normalizeCustomer({ name: "Ana", tags: "vip, WholesaLE" }).tags, ["vip", "wholesale"]);
});

test("duplicate tags collapse instead of erroring, and the list is capped", () => {
  assert.deepEqual(parseTags("vip, VIP, vip"), ["vip"]);
  const many = Array.from({ length: 50 }, (_, i) => `tag${i}`).join(",");
  assert.equal(parseTags(many).length, MAX_CUSTOMER_TAGS);
});

test("contacts are compared on the characters that survive retyping", () => {
  assert.equal(contactKey("+381 64 123-4567"), "+381641234567");
  assert.equal(sameContact("+381 64 123-4567", "+381641234567"), true);
  assert.equal(sameContact("  Ana  ", "ana"), true);
  assert.equal(sameContact("", ""), false);
  assert.equal(sameContact("+381 64 123-4567", "@ana"), false);
  // A prefix match is deliberately not a match: a shop's phone and a customer's
  // can share a country code, and treating them as one person loses a record.
  assert.equal(sameContact("+381 64 123", "+381 64 123 4567"), false);
});

test("search covers name, contact, email and tags", () => {
  const customer = makeCustomer({ tags: ["vip", "wholesale"] });
  assert.equal(customerMatches(customer, ""), true);
  assert.equal(customerMatches(customer, "petro"), true);
  assert.equal(customerMatches(customer, "123-4567"), true);
  assert.equal(customerMatches(customer, "ana@example.com"), true);
  assert.equal(customerMatches(customer, "vip"), true);
  // Email is matched whole-field, so a one-letter query does not match everyone.
  assert.equal(customerMatches(customer, "ana"), true);
  // An alphabetic query strips to an empty contact needle. Every string
  // contains the empty string, so without the guard in customerMatches this
  // would match every customer in the shop instead of searching by name.
  assert.equal(customerMatches(makeCustomer({ name: "Zoe" }), "example"), false);
  assert.equal(customerMatches(customer, "zzz"), false);
});

test("search folds diacritics so a name and a tag can be typed plainly", () => {
  const dorde = makeCustomer({ name: "Đorđe Nikolić", tags: ["đački"] });
  assert.equal(customerMatches(dorde, "dorde"), true);
  assert.equal(customerMatches(dorde, "nikolic"), true);
  assert.equal(customerMatches(dorde, "dacki"), true);
  assert.equal(customerMatches(dorde, "đorđe"), true);
});

test("sorting by spending is descending, and name ties break on contact", () => {
  const ana = makeCustomer({ id: "a", name: "Ana", contact: "1" });
  const anaTwo = makeCustomer({ id: "b", name: "Ana", contact: "2" });
  const zoe = makeCustomer({ id: "c", name: "Zoe", contact: "3" });
  const spent = new Map([["a", 10], ["b", 50], ["c", 30]]);

  assert.deepEqual(sortCustomers([ana, anaTwo, zoe], "spent", spent).map((c) => c.id), ["b", "c", "a"]);
  // Without spend data everyone is zero, so the name order is what decides.
  assert.deepEqual(sortCustomers([zoe, anaTwo, ana], "spent").map((c) => c.id), ["a", "b", "c"]);
  assert.deepEqual(sortCustomers([ana, anaTwo, zoe], "name").map((c) => c.id), ["a", "b", "c"]);
  // Sorting must not reorder the array it was handed.
  const input = [zoe, ana];
  sortCustomers(input, "name");
  assert.deepEqual(input.map((c) => c.id), ["c", "a"]);
});

test("newest sorts undated records last", () => {
  const dated = makeCustomer({ id: "d", name: "Dora", createdAt: new Date("2026-01-02") });
  const older = makeCustomer({ id: "o", name: "Ola", createdAt: new Date("2025-05-05") });
  const undated = makeCustomer({ id: "u", name: "Una" });
  assert.deepEqual(sortCustomers([undated, older, dated], "newest").map((c) => c.id), ["d", "o", "u"]);
});

test("the tag filter row is built from the data, most used first", () => {
  const rows = collectTags([
    makeCustomer({ id: "a", tags: ["vip", "wholesale"] }),
    makeCustomer({ id: "b", tags: ["vip"] }),
    makeCustomer({ id: "c", tags: [] }),
  ]);
  assert.deepEqual(rows, [
    { tag: "vip", count: 2 },
    { tag: "wholesale", count: 1 },
  ]);
  assert.deepEqual(collectTags([]), []);
});

test("favorite products aggregate units and spending across standing sales", () => {
  const favorites = favoriteProducts([
    makeSale([saleLine("jacket", "Jacket", 2, 50), saleLine("scarf", "Scarf", 1, 20)], "s1"),
    makeSale([saleLine("jacket", "Jacket", 1, 45), saleLine("boots", "Boots", 1, 200)], "s2"),
  ]);
  // The jacket wins on units even though the boots earned more.
  assert.deepEqual(favorites.map((item) => item.productId), ["jacket", "boots", "scarf"]);
  assert.deepEqual(favorites[0], { productId: "jacket", name: "Jacket", units: 3, spent: 145 });
  assert.deepEqual(favorites[1], { productId: "boots", name: "Boots", units: 1, spent: 200 });
});

test("favorite products are capped and empty when nothing was sold", () => {
  const many = Array.from({ length: 8 }, (_, index) =>
    makeSale([saleLine(`p${index}`, `Product ${index}`, 1, 10)], `s${index}`)
  );
  assert.equal(favoriteProducts(many).length, 5);
  assert.deepEqual(favoriteProducts([]), []);
});

test("a storno removes both documents from every money figure", () => {
  const kept = { ...makeSale([saleLine("a", "A", 1, 100)], "kept"), customerId: "c1" };
  const reversed = { ...makeSale([saleLine("a", "A", 1, 50)], "reversed"), customerId: "c1" };
  const storno = { ...makeSale([saleLine("a", "A", 1, -50)], "storno"), customerId: "c1", stornoOf: "reversed" };

  assert.deepEqual(standingSales([kept, reversed, storno]).map((sale) => sale.id), ["kept"]);
  assert.deepEqual([...spendingByCustomer([kept, reversed, storno])], [["c1", 100]]);
  // A sale with no linked customer cannot be attributed to anyone.
  assert.deepEqual([...spendingByCustomer([kept, makeSale([saleLine("a", "A", 1, 20)], "guest")])], [["c1", 100]]);
});

test("order counts follow the customer link", () => {
  const counts = orderCountsByCustomer([
    makeOrder({ id: "o1", customerId: "c1" }),
    makeOrder({ id: "o2", customerId: "c1" }),
    makeOrder({ id: "o3" }),
    makeOrder({ id: "o4", customerId: "c2" }),
  ]);
  assert.deepEqual([...counts], [["c1", 2], ["c2", 1]]);
});

test("new customers are counted from a fixed moment, undated ones never", () => {
  const now = new Date("2026-10-28T12:00:00").getTime();
  const customers = [
    makeCustomer({ id: "fresh", createdAt: new Date("2026-10-20T12:00:00") }),
    makeCustomer({ id: "inside", createdAt: new Date("2026-09-29T12:00:00") }),
    makeCustomer({ id: "old", createdAt: new Date("2026-09-01T12:00:00") }),
    makeCustomer({ id: "undated" }),
  ];
  assert.equal(countNewCustomers(customers, now), 2);
  assert.equal(countNewCustomers(customers, now, 90), 3);
});

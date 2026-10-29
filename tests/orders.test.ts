import assert from "node:assert/strict";
import test from "node:test";
import {
  filterOrders,
  MAX_ORDER_LINES,
  MAX_ORDER_QUANTITY,
  newOrderCode,
  normalizeFulfillmentIndices,
  normalizeOrderInput,
  orderFulfillment,
  orderMatchesSearch,
  orderStatusCounts,
  orderTotal,
  outstandingLineIndices,
} from "../lib/orders.ts";
import type { CatalogOrder } from "../lib/types.ts";

const line = {
  productId: "product-a",
  variantId: "variant-a",
  productName: "Jacket",
  variantLabel: "M",
  quantity: 2,
  unitPrice: 24.5,
  baseUnitPrice: 20,
};

const input = {
  lines: [line],
  customerName: "Ana",
  customerContact: "@ana",
  customerEmail: "ana@example.com",
  customerAddress: "Knez Mihailova 1",
  customerCity: "Beograd",
  note: "",
  channel: "whatsapp",
};

test("normalizes and preserves quoted and base prices for the same catalog line", () => {
  assert.deepEqual(normalizeOrderInput(input), input);
  assert.equal(orderTotal(input.lines), 49);
});

test("catalog order codes are short and unambiguous", () => {
  assert.match(newOrderCode(), /^[A-HJ-NP-Z2-9]{6}$/);
});

test("rejects anonymous or unpriced orders before a Firestore write", () => {
  assert.throws(() => normalizeOrderInput({ ...input, customerName: "" }), /ORDER_NAME_REQUIRED/);
  assert.throws(() => normalizeOrderInput({ ...input, customerContact: " " }), /ORDER_CONTACT_REQUIRED/);
  assert.throws(() => normalizeOrderInput({ ...input, customerEmail: "not-an-email" }), /ORDER_EMAIL_INVALID/);
  assert.throws(() => normalizeOrderInput({ ...input, customerAddress: " " }), /ORDER_ADDRESS_REQUIRED/);
  assert.throws(() => normalizeOrderInput({ ...input, customerCity: " " }), /ORDER_CITY_REQUIRED/);
  assert.throws(() => normalizeOrderInput({ ...input, lines: [{ ...line, unitPrice: undefined }] }), /ORDER_PRICE_REQUIRED/);
});

test("rejects invalid line counts and quantities rather than silently changing an order", () => {
  const tooMany = Array.from({ length: MAX_ORDER_LINES + 1 }, () => line);
  assert.throws(() => normalizeOrderInput({ ...input, lines: tooMany }), /ORDER_TOO_MANY_LINES/);
  assert.throws(() => normalizeOrderInput({
    ...input,
    lines: [{ ...line, quantity: MAX_ORDER_QUANTITY + 1 }],
  }), /ORDER_QUANTITY_INVALID/);
});

test("a fulfillment pass names unique, in-range whole lines", () => {
  assert.deepEqual(normalizeFulfillmentIndices(3, [2, 0, 2]), [0, 2]);
  assert.deepEqual(normalizeFulfillmentIndices(1, [0]), [0]);
  assert.throws(() => normalizeFulfillmentIndices(3, []), /ORDER_NO_LINES_SELECTED/);
  assert.throws(() => normalizeFulfillmentIndices(3, [3]), /ORDER_LINE_INVALID/);
  assert.throws(() => normalizeFulfillmentIndices(3, [-1]), /ORDER_LINE_INVALID/);
  assert.throws(() => normalizeFulfillmentIndices(3, [0.5]), /ORDER_LINE_INVALID/);
  assert.throws(() => normalizeFulfillmentIndices(0, [0]), /ORDER_LINES_INVALID/);
});

test("outstanding lines drop what earlier passes already shipped", () => {
  const lines = [line, line, line];
  assert.deepEqual(outstandingLineIndices(lines), [0, 1, 2]);
  assert.deepEqual(outstandingLineIndices(lines, [0, 2]), [1]);
  assert.deepEqual(outstandingLineIndices(lines, [0, 1, 2]), []);
  // A corrupt marker must not hide a line that still needs to ship.
  assert.deepEqual(outstandingLineIndices(lines, [7, 1.5]), [0, 1, 2]);
});

function makeOrder(overrides: Partial<CatalogOrder> = {}): CatalogOrder {
  return {
    id: "o1",
    code: "ABC234",
    lines: [{ productId: "p1", productName: "Zeleni čaj", variantLabel: "100 g", quantity: 2, unitPrice: 5 }],
    total: 10,
    customerName: "Đorđe Nikolić",
    customerContact: "+381 64 123-4567",
    note: "",
    channel: "catalog",
    status: "new",
    createdAt: null,
    ...overrides,
  };
}

test("status counts include the unfinished union as open", () => {
  const counts = orderStatusCounts([
    makeOrder({ id: "a", status: "new" }),
    makeOrder({ id: "b", status: "confirmed" }),
    makeOrder({ id: "c", status: "fulfilling" }),
    makeOrder({ id: "d", status: "fulfilled" }),
    makeOrder({ id: "e", status: "cancelled" }),
  ]);
  assert.deepEqual(counts, { open: 3, new: 1, confirmed: 1, fulfilling: 1, fulfilled: 1, cancelled: 1, all: 5 });
});

test("order search folds diacritics and requires every word", () => {
  const order = makeOrder();
  assert.equal(orderMatchesSearch(order, "caj 100"), true);
  assert.equal(orderMatchesSearch(order, "dorde"), true);
  assert.equal(orderMatchesSearch(order, "djordje"), false);
  assert.equal(orderMatchesSearch(order, "abc234"), true);
  assert.equal(orderMatchesSearch(order, "caj espresso"), false);
  assert.equal(orderMatchesSearch(order, ""), true);
});

test("filtering combines the status chip and the search", () => {
  const orders = [
    makeOrder({ id: "new-1", status: "new" }),
    makeOrder({ id: "new-2", status: "new", customerName: "Ana" }),
    makeOrder({ id: "done-1", status: "fulfilled" }),
  ];
  assert.deepEqual(filterOrders(orders, "open", "").map((order) => order.id), ["new-1", "new-2"]);
  assert.deepEqual(filterOrders(orders, "fulfilled", "").map((order) => order.id), ["done-1"]);
  assert.deepEqual(filterOrders(orders, "all", "ana").map((order) => order.id), ["new-2"]);
  assert.deepEqual(filterOrders(orders, "new", "ana").map((order) => order.id), ["new-2"]);
  assert.deepEqual(filterOrders(orders, "new", "nikolic").map((order) => order.id), ["new-1"]);
});

test("fulfillment progress follows whole lines, never quantities", () => {
  const order = makeOrder({ lines: [line, line, line], fulfilledLineIndices: [0, 2] });
  assert.deepEqual(orderFulfillment(order), { completed: 2, outstanding: [1], percent: 67 });
  assert.deepEqual(orderFulfillment(makeOrder({ lines: [] })), { completed: 0, outstanding: [], percent: 0 });
});

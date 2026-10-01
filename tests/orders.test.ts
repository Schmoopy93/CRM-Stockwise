import assert from "node:assert/strict";
import test from "node:test";
import { MAX_ORDER_LINES, MAX_ORDER_QUANTITY, newOrderCode, normalizeOrderInput, orderTotal } from "../lib/orders.ts";

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

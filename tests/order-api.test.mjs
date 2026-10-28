/**
 * End-to-end checks for the public order API against the Firestore emulator.
 * The route module is imported directly, with `next-alias-register.mjs` teaching
 * Node the app's `@/` imports and `next/cache`.
 */
import assert from "node:assert/strict";
import { adminDb } from "../lib/firebase-admin.ts";
import { POST } from "../app/api/catalog/[shopId]/orders/route.ts";

const db = adminDb();
assert.ok(db, "the Admin SDK must connect to the emulator");

const shopId = "shop-emu";
const shopRef = db.collection("shops").doc(shopId);
await shopRef.set({ name: "Emulator Shop", catalogEnabled: true, currency: "EUR" });
await shopRef.collection("catalog").doc("shirt").set({
  name: "Shirt", salePrice: 20, stockQuantity: 5, variants: [], variantIds: [], hidden: false,
});
await shopRef.collection("catalog").doc("jacket").set({
  name: "Jacket", salePrice: 50, stockQuantity: 2,
  variants: ["M", "L"], variantIds: ["v-m", "v-l"], variantStock: { "v-m": 2, "v-l": 0 }, hidden: false,
});
await shopRef.collection("catalog").doc("hidden-item").set({
  name: "Hidden", salePrice: 10, stockQuantity: 50, hidden: true,
});
await shopRef.collection("catalog").doc("unpriced").set({ name: "Unpriced", stockQuantity: 50, hidden: false });
await db.collection("shops").doc("shop-off").set({ name: "Off", catalogEnabled: false, currency: "EUR" });

function payload(overrides = {}) {
  return {
    idempotencyKey: crypto.randomUUID(),
    currency: "EUR",
    lines: [{ productId: "shirt", quantity: 2, unitPrice: 20 }],
    customerName: "Ana",
    customerContact: "+381601234567",
    customerEmail: `ana-${crypto.randomUUID()}@example.com`,
    customerAddress: "Knez Mihailova 1",
    customerCity: "Beograd",
    note: "",
    ...overrides,
  };
}

let ip = 0;
async function call(body, { shop = shopId, from } = {}) {
  const request = new Request(`http://localhost/api/catalog/${shop}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": from ?? `10.1.0.${++ip}` },
    body: JSON.stringify(body),
  });
  const response = await POST(request, { params: Promise.resolve({ shopId: shop }) });
  return { status: response.status, body: await response.json() };
}

function expect(result, status, error) {
  assert.equal(result.status, status, `expected ${status}, got ${result.status} ${JSON.stringify(result.body)}`);
  if (error) assert.equal(result.body.error, error);
  return result.body;
}

// A valid order is priced and named from the catalog, not from the request.
const valid = payload();
const created = await call(valid);
assert.equal(created.status, 201, JSON.stringify(created.body));
assert.match(created.body.code, /^[A-Z0-9]{6}$/);
assert.equal(created.body.total, 40);
assert.equal(created.body.currency, "EUR");

const orders = await shopRef.collection("orders").get();
assert.equal(orders.size, 1);
const stored = orders.docs[0].data();
assert.equal(stored.code, created.body.code);
assert.equal(stored.lines[0].productName, "Shirt");
assert.equal(stored.lines[0].variantLabel, "");
assert.equal(stored.lines[0].unitPrice, 20);
assert.equal(stored.lines[0].baseUnitPrice, 20);
assert.equal(stored.total, 40);
assert.equal(stored.status, "new");
assert.ok(stored.createdAt?.toMillis, "createdAt is a server timestamp");

// Replaying the same key returns the first order instead of creating another.
const replayed = await call(valid);
assert.equal(replayed.status, 200);
assert.equal(replayed.body.code, created.body.code);
assert.equal((await shopRef.collection("orders").get()).size, 1);

// The same key from a different customer is refused.
expect(await call({ ...valid, customerEmail: "other@example.com" }), 409, "ORDER_INVALID");

expect(await call(payload({ lines: [{ productId: "shirt", quantity: 2, unitPrice: 19 }] })), 409, "ORDER_PRICE_CHANGED");
expect(await call(payload({ lines: [{ productId: "shirt", quantity: 6, unitPrice: 20 }] })), 409, "ORDER_STOCK_INSUFFICIENT");
expect(await call(payload({ lines: [{ productId: "jacket", variantId: "v-l", quantity: 1, unitPrice: 50 }] })), 409, "ORDER_STOCK_INSUFFICIENT");
expect(await call(payload({ lines: [{ productId: "jacket", variantId: "nope", quantity: 1, unitPrice: 50 }] })), 409, "ORDER_VARIANT_NOT_FOUND");
expect(await call(payload({ lines: [{ productId: "shirt", variantId: "v-m", quantity: 1, unitPrice: 20 }] })), 409, "ORDER_VARIANT_NOT_FOUND");
expect(await call(payload({ lines: [{ productId: "hidden-item", quantity: 1, unitPrice: 10 }] })), 409, "ORDER_VARIANT_NOT_FOUND");
expect(await call(payload({ lines: [{ productId: "unpriced", quantity: 1, unitPrice: 10 }] })), 409, "ORDER_PRICE_REQUIRED");
expect(await call(payload({
  lines: [
    { productId: "shirt", quantity: 1, unitPrice: 20 },
    { productId: "shirt", quantity: 1, unitPrice: 20 },
  ],
})), 400, "ORDER_LINE_INVALID");
expect(await call(payload({ customerEmail: "not-an-email" })), 400, "ORDER_EMAIL_INVALID");
expect(await call(payload({ customerCity: "" })), 400, "ORDER_CITY_REQUIRED");
expect(await call(payload(), { shop: "shop-off" }), 410, "CATALOG_DISABLED");

// A variant line is resolved to its label and stock.
const variantOrder = await call(payload({
  lines: [{ productId: "jacket", variantId: "v-m", quantity: 2, unitPrice: 50 }],
}));
assert.equal(variantOrder.status, 201, JSON.stringify(variantOrder.body));
assert.equal(variantOrder.body.total, 100);
const jacketOrder = (await shopRef.collection("orders").get()).docs
  .map((doc) => doc.data())
  .find((order) => order.code === variantOrder.body.code);
assert.equal(jacketOrder.lines[0].variantLabel, "M");

// Per-email budget: the sixth attempt in the window is refused.
const email = "limit@example.com";
const emailStatuses = [];
for (let index = 0; index < 6; index += 1) {
  emailStatuses.push((await call(payload({ customerEmail: email }))).status);
}
assert.deepEqual(emailStatuses, [201, 201, 201, 201, 201, 429]);

// Per-IP budget across different customers.
const ipStatuses = [];
for (let index = 0; index < 11; index += 1) {
  ipStatuses.push((await call(payload(), { from: "10.9.9.9" })).status);
}
assert.deepEqual(ipStatuses, [201, 201, 201, 201, 201, 201, 201, 201, 201, 201, 429]);

// The daily counter matches the number of stored orders.
const finalOrders = await shopRef.collection("orders").get();
const day = new Date().toISOString().slice(0, 10);
const stats = await shopRef.collection("catalogStats").doc(day).get();
assert.equal(stats.data()?.orders, finalOrders.size);

console.log(`Order API emulator checks passed (${finalOrders.size} orders stored).`);

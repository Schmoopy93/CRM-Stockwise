import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { consumeRateLimit } from "../lib/rate-limit.ts";

const projectId = "demo-inventory-crm";
const shopId = "shop-a";
const productId = "product-a";
const variantId = "variant-a";
let env: RulesTestEnvironment;
/** The limiter is driven through its own unauthenticated client, built from the
 * same SDK entry point the route handlers use, so the test covers the real path
 * instead of a stand-in. */
let limiterApp: FirebaseApp;
let limiterDb: Firestore;

function firestoreFor(uid?: string) {
  return uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
}

async function seedFixtures() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "shops", shopId), { name: "Shop A", createdBy: "owner-a" });
    await setDoc(doc(db, "users", "owner-a"), { shopId, displayName: "Owner", role: "owner" });
    await setDoc(doc(db, "users", "staff-a"), { shopId, displayName: "Staff", role: "staff" });
    await setDoc(doc(db, "users", "outsider"), { shopId: "shop-b", displayName: "Other", role: "owner" });
    await setDoc(doc(db, "shops", "shop-b"), { name: "Shop B", createdBy: "outsider" });
    await setDoc(doc(db, "shops", shopId, "products", productId), {
      name: "Jacket",
      sku: "J-1",
      category: "Clothing",
      minStock: 0,
      imageUrl: "",
      totalQuantity: 5,
      customFieldDefinitions: [],
      customFieldValues: {},
    });
    await setDoc(doc(db, "shops", shopId, "products", productId, "variants", variantId), {
      label: "M",
      sku: "J-1-M",
      quantity: 5,
    });
  });
}

async function updateStock(uid: string, delta: number, eventDelta = delta) {
  const db = firestoreFor(uid);
  const productRef = doc(db, "shops", shopId, "products", productId);
  const variantRef = doc(productRef, "variants", variantId);
  const eventRef = doc(collection(db, "shops", shopId, "stockEvents"));

  await runTransaction(db, async (transaction) => {
    const variantSnap = await transaction.get(variantRef);
    const productSnap = await transaction.get(productRef);
    const eventId = eventRef.id;
    transaction.update(variantRef, {
      quantity: variantSnap.data()!.quantity + delta,
      lastStockEventId: eventId,
    });
    transaction.update(productRef, {
      totalQuantity: productSnap.data()!.totalQuantity + delta,
      lastStockEventId: eventId,
      updatedAt: serverTimestamp(),
    });
    transaction.set(eventRef, {
      productId,
      variantId,
      variantLabel: "M",
      delta: eventDelta,
      reason: "receipt",
      actorUid: uid,
      actorName: "Test user",
      createdAt: serverTimestamp(),
    });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: await readFile("firestore.rules", "utf8"),
    },
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: await readFile("storage.rules", "utf8"),
    },
  });
  limiterApp = initializeApp({ projectId }, "rate-limiter-test");
  limiterDb = getFirestore(limiterApp);
  connectFirestoreEmulator(limiterDb, "127.0.0.1", 8080);
});

after(async () => {
  await deleteApp(limiterApp);
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await seedFixtures();
});

test("a shop member can read their shop and products", async () => {
  const db = firestoreFor("staff-a");
  await assertSucceeds(getDoc(doc(db, "shops", shopId)));
  await assertSucceeds(getDoc(doc(db, "shops", shopId, "products", productId)));
});

test("users cannot read another shop or access data while signed out", async () => {
  const otherDb = firestoreFor("outsider");
  const signedOutDb = firestoreFor();
  await assertFails(getDoc(doc(otherDb, "shops", shopId, "products", productId)));
  await assertFails(getDoc(doc(signedOutDb, "shops", shopId, "products", productId)));
});

test("an authenticated user can join a known shop by creating their own staff profile", async () => {
  const db = firestoreFor("new-staff");
  await assertSucceeds(setDoc(doc(db, "users", "new-staff"), {
    shopId,
    displayName: "New staff",
    role: "staff",
  }));
  await assertFails(setDoc(doc(db, "users", "new-staff"), {
    shopId: "shop-b",
    displayName: "New staff",
    role: "owner",
  }));
  const attackerDb = firestoreFor("attacker");
  await assertFails(setDoc(doc(attackerDb, "users", "attacker"), {
    shopId,
    displayName: "Attacker",
    role: "owner",
  }));
});

test("new shop and owner profile must be created atomically", async () => {
  const db = firestoreFor("new-owner");
  const batch = writeBatch(db);
  batch.set(doc(db, "shops", "new-shop"), { name: "New Shop", createdBy: "new-owner" });
  batch.set(doc(db, "users", "new-owner"), { shopId: "new-shop", displayName: "Owner", role: "owner" });
  await assertSucceeds(batch.commit());
});

test("members can import a new product with variants and optional pricing metadata", async () => {
  const db = firestoreFor("owner-a");
  const productRef = doc(db, "shops", shopId, "products", "imported-product");
  const variantRef = doc(productRef, "variants", "imported-variant");
  const batch = writeBatch(db);
  batch.set(productRef, {
    name: "Imported dress",
    sku: "DR-1",
    category: "Clothing",
    minStock: 2,
    imageUrl: "",
    totalQuantity: 4,
    costPrice: 12.5,
    salePrice: 39.99,
    supplier: { name: "Supplier A", contact: "" },
    customFieldDefinitions: [],
    customFieldValues: {},
  });
  batch.set(variantRef, { label: "Blue / S", sku: "DR-1-BS", quantity: 4 });
  await assertSucceeds(batch.commit());
});

test("new products may carry a server createdAt and a compare-at price, but createdAt is immutable", async () => {
  const db = firestoreFor("owner-a");
  const productRef = doc(db, "shops", shopId, "products", "sale-product");
  await assertSucceeds(setDoc(productRef, {
    name: "Sale dress",
    sku: "",
    category: "Clothing",
    minStock: 0,
    imageUrl: "",
    totalQuantity: 0,
    salePrice: 30,
    compareAtPrice: 40,
    customFieldDefinitions: [],
    customFieldValues: {},
    createdAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(productRef, { compareAtPrice: 45, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(productRef, { createdAt: serverTimestamp() }));
});

test("anonymous visitors can only bump one catalog counter by one while the catalog is enabled", async () => {
  const signedOutDb = firestoreFor();
  const statsRef = doc(signedOutDb, "shops", shopId, "catalogStats", "2026-09-29");
  await assertFails(setDoc(statsRef, { views: increment(1) }, { merge: true }));

  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "shops", shopId), { catalogEnabled: true });
  });
  await assertSucceeds(setDoc(statsRef, { views: increment(1) }, { merge: true }));
  await assertSucceeds(setDoc(statsRef, { whatsapp: increment(1) }, { merge: true }));
  await assertFails(setDoc(statsRef, { views: increment(5) }, { merge: true }));
  await assertFails(setDoc(statsRef, { views: increment(1), share: increment(1) }, { merge: true }));
  await assertSucceeds(setDoc(statsRef, { orders: increment(1) }, { merge: true }));
  await assertFails(setDoc(statsRef, { sales: increment(1) }, { merge: true }));
  await assertFails(setDoc(doc(signedOutDb, "shops", shopId, "catalogStats", "not-a-day"), { views: increment(1) }, { merge: true }));
  await assertFails(getDoc(statsRef));
  await assertSucceeds(getDoc(doc(firestoreFor("staff-a"), "shops", shopId, "catalogStats", "2026-09-29")));
});

test("customers can place catalog orders but members own the lifecycle", async () => {
  const visitorDb = firestoreFor();
  const staffDb = firestoreFor("staff-a");
  // `currency` is part of the order shape: an order keeps the currency it was
  // quoted in, so it is in the fixture rather than added per assertion.
  const order = { code: "K7M2QP", total: 25, currency: "EUR", customerName: "Ana", customerContact: "@ana", note: "", channel: "instagram", createdAt: serverTimestamp() };
  const line = { productId: "p", productName: "X", variantLabel: "", quantity: 1 };

  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o1"), { ...order, lines: [], status: "new" }));
  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o2"), { ...order, lines: [line], status: "confirmed" }));
  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o3"), { ...order, lines: [line], status: "new", costPrice: 3 }));
  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o4"), { ...order, code: "bad-code", lines: [line], status: "new" }));

  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "shops", shopId), { catalogEnabled: true });
  });
  await assertSucceeds(setDoc(doc(visitorDb, "shops", shopId, "orders", "o5"), { ...order, lines: [line], status: "new" }));

  // The currency must be a real three-letter code. The rule pins the *shape*,
  // which is all it can check — whether a code is one the shop can pick lives in
  // the picker, not here. It is required so every order says what it was quoted in.
  await assertSucceeds(setDoc(doc(visitorDb, "shops", shopId, "orders", "o6"), { ...order, currency: "RSD", lines: [line], status: "new" }));
  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o7"), { ...order, currency: "rsd", lines: [line], status: "new" }));
  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o8"), { ...order, currency: "RS", lines: [line], status: "new" }));
  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o9"), { ...order, currency: 117, lines: [line], status: "new" }));
  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o11"), { ...order, currency: "DINARS", lines: [line], status: "new" }));
  const withoutCurrency: Record<string, unknown> = { ...order };
  delete withoutCurrency.currency;
  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o10"), { ...withoutCurrency, lines: [line], status: "new" }));

  await assertFails(getDoc(doc(visitorDb, "shops", shopId, "orders", "o5")));
  await assertSucceeds(getDoc(doc(staffDb, "shops", shopId, "orders", "o5")));

  // Members may move the lifecycle and attach contact details, nothing else.
  await assertSucceeds(updateDoc(doc(staffDb, "shops", shopId, "orders", "o5"), { status: "confirmed" }));
  await assertFails(updateDoc(doc(staffDb, "shops", shopId, "orders", "o5"), { status: "shipped" }));
  await assertFails(updateDoc(doc(staffDb, "shops", shopId, "orders", "o5"), { total: 0 }));
  // Restating what the customer agreed to, or in what currency, is not allowed.
  await assertFails(updateDoc(doc(staffDb, "shops", shopId, "orders", "o5"), { currency: "RSD" }));
  await assertFails(deleteDoc(doc(staffDb, "shops", shopId, "orders", "o5")));
});

test("rate limit buckets advance by one and can never be listed or reset", async () => {
  const db = firestoreFor();
  const bucket = doc(db, "rateLimits", "assistant-hash");

  // The limiter counts a call by reading its bucket inside a transaction, so a
  // single bucket must be readable or every call falls back to a per-instance
  // counter. Buckets stay unlisted: ids are hashes, so nothing is findable.
  await assertSucceeds(getDoc(bucket));
  await assertFails(getDocs(collection(db, "rateLimits")));
  await assertSucceeds(setDoc(bucket, { windowStart: Timestamp.fromMillis(Date.now() - 1_000), count: 1 }));
  await assertFails(setDoc(bucket, { windowStart: Timestamp.now(), count: 999 }));
  await assertFails(updateDoc(bucket, { count: 500 }));
  await assertFails(updateDoc(bucket, { count: 1, windowStart: Timestamp.fromMillis(Date.now() + 600_000) }));
  await assertFails(updateDoc(bucket, { count: 1, owner: "attacker" }));
  await assertFails(deleteDoc(bucket));

  await assertSucceeds(updateDoc(bucket, { count: 2 }));
  await assertFails(updateDoc(bucket, { count: 1 }));
});

test("the shared limiter counts calls in Firestore rather than falling back", async () => {
  const key = "assistant:203.0.113.7";

  // Four calls against a budget of three: the fourth is refused. This drives the
  // real limiter, so it fails if the transaction cannot read its bucket — the
  // failure that used to push every request onto the in-process fallback.
  assert.equal(await consumeRateLimit(key, 3, limiterDb), true);
  assert.equal(await consumeRateLimit(key, 3, limiterDb), true);
  assert.equal(await consumeRateLimit(key, 3, limiterDb), true);
  assert.equal(await consumeRateLimit(key, 3, limiterDb), false);

  // The count lives in the store of record, not in the caller's process.
  await env.withSecurityRulesDisabled(async (context) => {
    const buckets = await getDocs(collection(context.firestore(), "rateLimits"));
    assert.equal(buckets.size, 1);
    assert.equal(buckets.docs[0].data().count, 3);
  });

  // A different caller gets its own budget.
  assert.equal(await consumeRateLimit("assistant:198.51.100.4", 3, limiterDb), true);
});

test("only shop owners can change shop configuration", async () => {
  const ownerDb = firestoreFor("owner-a");
  const staffDb = firestoreFor("staff-a");
  await assertSucceeds(updateDoc(doc(ownerDb, "shops", shopId), { name: "Renamed shop" }));
  await assertFails(updateDoc(doc(staffDb, "shops", shopId), { name: "Unauthorized rename" }));
  // The display currency is shop configuration, so it follows the same gate.
  await assertSucceeds(updateDoc(doc(ownerDb, "shops", shopId), { currency: "RSD" }));
  await assertFails(updateDoc(doc(staffDb, "shops", shopId), { currency: "USD" }));
});

test("products with positive stock cannot be deleted", async () => {
  const db = firestoreFor("owner-a");
  await assertFails(deleteDoc(doc(db, "shops", shopId, "products", productId)));
});

test("members cannot bypass the stock ledger with a direct quantity edit", async () => {
  const db = firestoreFor("staff-a");
  await assertFails(updateDoc(doc(db, "shops", shopId, "products", productId, "variants", variantId), { quantity: 6 }));
  await assertFails(updateDoc(doc(db, "shops", shopId, "products", productId), { totalQuantity: 6 }));
});

test("a valid stock transaction updates variant, product total, and event together", async () => {
  await assertSucceeds(updateStock("staff-a", 2));
  const db = firestoreFor("staff-a");
  const product = await getDoc(doc(db, "shops", shopId, "products", productId));
  const variant = await getDoc(doc(db, "shops", shopId, "products", productId, "variants", variantId));
  assert.equal(product.data()?.totalQuantity, 7);
  assert.equal(variant.data()?.quantity, 7);
});

test("a stock transaction with a mismatched event delta is rejected", async () => {
  await assertFails(updateStock("staff-a", 2, 1));
});

test("stock events cannot be edited or deleted", async () => {
  const db = firestoreFor("staff-a");
  await assertSucceeds(updateStock("staff-a", 1));
  const events = await getDocs(collection(db, "shops", shopId, "stockEvents"));
  const eventRef = events.docs[0].ref;
  await assertFails(updateDoc(eventRef, { delta: 100 }));
});

test("product images are private to members of that shop", async () => {
  const bucket = `gs://${projectId}.appspot.com`;
  const outsiderStorage = env.authenticatedContext("outsider").storage(bucket);
  const memberStorage = env.authenticatedContext("staff-a").storage(bucket);
  outsiderStorage.useEmulator("127.0.0.1", 9199);
  memberStorage.useEmulator("127.0.0.1", 9199);
  const image = new Uint8Array([1, 2, 3]);
  await assertFails(uploadBytes(ref(outsiderStorage, `shops/${shopId}/products/${productId}.jpg`), image, { contentType: "image/jpeg" }));
  await assertSucceeds(uploadBytes(ref(memberStorage, `shops/${shopId}/products/${productId}.jpg`), image, { contentType: "image/jpeg" }));
});

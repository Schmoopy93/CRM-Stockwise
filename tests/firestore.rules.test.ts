import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
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
    const catalogRef = doc(db, "shops", shopId, "catalog", productId);
    const catalogSnap = await transaction.get(catalogRef);
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
    if (catalogSnap.exists()) {
      transaction.update(catalogRef, {
        stockQuantity: catalogSnap.data()!.stockQuantity + delta,
        [`variantStock.${variantId}`]: catalogSnap.data()!.variantStock[variantId] + delta,
        updatedAt: serverTimestamp(),
      });
    }
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
  await assertSucceeds(getDocs(query(
    collection(firestoreFor("staff-a"), "shops", shopId, "catalogStats"),
    where(documentId(), ">=", "2026-09-01"),
    orderBy(documentId()),
    limit(30)
  )));
});

test("customers can place catalog orders but members own the lifecycle", async () => {
  const visitorDb = firestoreFor();
  const staffDb = firestoreFor("staff-a");
  // `currency` is part of the order shape: an order keeps the currency it was
  // quoted in, so it is in the fixture rather than added per assertion.
  const order = { code: "K7M2QP", total: 20, currency: "EUR", customerName: "Ana", customerContact: "@ana", customerEmail: "ana@example.com", customerAddress: "Knez Mihailova 1", customerCity: "Beograd", note: "", channel: "instagram", createdAt: serverTimestamp() };
  const line = { productId, variantId, productName: "Jacket", variantLabel: "M", quantity: 1, unitPrice: 20, baseUnitPrice: 20 };

  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o1"), { ...order, lines: [], status: "new" }));
  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o2"), { ...order, lines: [line], status: "confirmed" }));
  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o3"), { ...order, lines: [line], status: "new", costPrice: 3 }));
  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o4"), { ...order, code: "bad-code", lines: [line], status: "new" }));
  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o6"), { ...order, customerCity: "", lines: [line], status: "new" }));
  await assertFails(setDoc(doc(visitorDb, "shops", shopId, "orders", "o7"), { ...order, customerEmail: "invalid", lines: [line], status: "new" }));

  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "shops", shopId), { catalogEnabled: true });
  });
  await assertSucceeds(setDoc(doc(visitorDb, "shops", shopId, "orders", "o5"), { ...order, lines: [line], status: "new" }));

  // The currency must be a real three-letter code. The rule pins the *shape*,
  // which is all it can check — whether a code is one the shop can pick lives in
  // the picker, not here. It is required so every order says what it was quoted in.
  await assertSucceeds(setDoc(doc(visitorDb, "shops", shopId, "orders", "o6"), { ...order, currency: "RSD", lines: [line], status: "new" }));
  await assertSucceeds(setDoc(doc(visitorDb, "shops", shopId, "orders", "catalog-order"), {
    ...order,
    channel: "catalog",
    lines: [{ ...line, variantId: "variant-a", baseUnitPrice: 20 }],
    status: "new",
  }));
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
  const orderRef = doc(staffDb, "shops", shopId, "orders", "o5");
  await assertFails(updateDoc(orderRef, {
    status: "fulfilling",
    fulfilledLineIndices: [0],
    lastFulfilledLineIndex: 0,
    lastFulfillmentEventId: "missing-event",
  }));
  const productRef = doc(staffDb, "shops", shopId, "products", productId);
  const variantRef = doc(productRef, "variants", variantId);
  const eventRef = doc(collection(staffDb, "shops", shopId, "stockEvents"));
  await assertSucceeds(runTransaction(staffDb, async (transaction) => {
    const [currentOrder, productSnap, variantSnap] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(productRef),
      transaction.get(variantRef),
    ]);
    transaction.update(variantRef, { quantity: 4, lastStockEventId: eventRef.id });
    transaction.update(productRef, { totalQuantity: 4, lastStockEventId: eventRef.id });
    transaction.set(eventRef, {
      productId,
      variantId,
      variantLabel: "M",
      delta: -1,
      reason: "sale",
      actorUid: "staff-a",
      actorName: "Staff",
      createdAt: serverTimestamp(),
    });
    transaction.update(orderRef, {
      status: "fulfilling",
      fulfilledLineIndices: [0],
      lastFulfilledLineIndex: 0,
      lastFulfillmentEventId: eventRef.id,
    });
    assert.equal(currentOrder.data()?.status, "confirmed");
    assert.equal(productSnap.data()?.totalQuantity, 5);
    assert.equal(variantSnap.data()?.quantity, 5);
  }));
  const saleRef = doc(staffDb, "shops", shopId, "sales", "order-o5");
  await assertSucceeds(runTransaction(staffDb, async (transaction) => {
    const currentOrder = await transaction.get(orderRef);
    transaction.set(saleRef, {
      lines: [{ productId, productName: "Jacket", variantId, variantLabel: "M", quantity: 1, unitPrice: 20 }],
      total: 20,
      channel: "catalog",
      buyerName: "Ana",
      buyerContact: "@ana",
      sourceOrderId: "o5",
      sourceOrderCode: "K7M2QP",
      note: "",
      actorUid: "staff-a",
      actorName: "Staff",
      createdAt: serverTimestamp(),
    });
    transaction.update(orderRef, { status: "fulfilled", saleId: saleRef.id });
    assert.equal(currentOrder.data()?.status, "fulfilling");
  }));
  await assertFails(updateDoc(orderRef, { status: "shipped" }));
  await assertFails(updateDoc(orderRef, { total: 0 }));
  // Restating what the customer agreed to, or in what currency, is not allowed.
  await assertFails(updateDoc(orderRef, { currency: "RSD" }));
  await assertFails(deleteDoc(orderRef));
});

test("verified order customers and shop members can exchange immutable private messages", async () => {
  const customerDb = env.authenticatedContext("buyer-a", {
    email: "ana@example.com",
    email_verified: true,
  }).firestore();
  const unverifiedDb = env.authenticatedContext("buyer-unverified", {
    email: "ana@example.com",
    email_verified: false,
  }).firestore();
  const otherCustomerDb = env.authenticatedContext("buyer-b", {
    email: "other@example.com",
    email_verified: true,
  }).firestore();
  const staffDb = firestoreFor("staff-a");
  const orderId = "chat-order";
  const orderRef = doc(customerDb, "shops", shopId, "orders", orderId);
  const messagesRef = collection(orderRef, "messages");

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "shops", shopId, "orders", orderId), {
      code: "A2B3C4",
      customerEmail: "ana@example.com",
      status: "new",
    });
  });

  await assertSucceeds(getDoc(orderRef));
  await assertSucceeds(getDocs(query(
    collection(customerDb, "shops", shopId, "orders"),
    where("customerEmail", "==", "ana@example.com")
  )));
  await assertFails(getDoc(doc(unverifiedDb, "shops", shopId, "orders", orderId)));
  await assertFails(getDoc(doc(otherCustomerDb, "shops", shopId, "orders", orderId)));
  await assertFails(getDoc(doc(firestoreFor(), "shops", shopId, "orders", orderId)));

  const customerMessage = {
    authorUid: "buyer-a",
    authorRole: "customer",
    authorName: "Ana",
    text: "Da li je dostupna plava boja?",
    createdAt: serverTimestamp(),
  };
  await assertSucceeds(addDoc(messagesRef, customerMessage));
  await assertSucceeds(getDocs(messagesRef));
  await assertSucceeds(addDoc(collection(staffDb, "shops", shopId, "orders", orderId, "messages"), {
    authorUid: "staff-a",
    authorRole: "shop",
    authorName: "Staff",
    text: "Jeste, dostupna je.",
    createdAt: serverTimestamp(),
  }));
  await assertSucceeds(getDocs(collection(staffDb, "shops", shopId, "orders", orderId, "messages")));
  await assertFails(getDocs(collection(otherCustomerDb, "shops", shopId, "orders", orderId, "messages")));
  await assertFails(addDoc(collection(otherCustomerDb, "shops", shopId, "orders", orderId, "messages"), {
    ...customerMessage,
    authorUid: "buyer-b",
  }));
  await assertFails(addDoc(collection(customerDb, "shops", shopId, "orders", orderId, "messages"), {
    ...customerMessage,
    authorRole: "shop",
  }));
  await assertFails(addDoc(collection(customerDb, "shops", shopId, "orders", orderId, "messages"), {
    ...customerMessage,
    text: "x".repeat(2001),
  }));
  await assertFails(updateDoc(doc(messagesRef, "message-id"), { text: "edited" }));
  await assertFails(deleteDoc(doc(messagesRef, "message-id")));
});

test("verified customers can start private conversations with the shop before ordering", async () => {
  const customerDb = env.authenticatedContext("buyer-a", {
    email: "ana@example.com",
    email_verified: true,
  }).firestore();
  const unverifiedDb = env.authenticatedContext("buyer-unverified", {
    email: "ana@example.com",
    email_verified: false,
  }).firestore();
  const otherCustomerDb = env.authenticatedContext("buyer-b", {
    email: "other@example.com",
    email_verified: true,
  }).firestore();
  const staffDb = firestoreFor("staff-a");
  const conversationId = "pre-order-chat";
  const customerConversation = doc(customerDb, "shops", shopId, "conversations", conversationId);
  const customerMessages = collection(customerConversation, "messages");

  const conversationData = {
    customerUid: "buyer-a",
    customerEmail: "ana@example.com",
    customerName: "ana@example.com",
    createdAt: serverTimestamp(),
  };
  await assertFails(setDoc(doc(customerDb, "shops", shopId, "conversations", "catalog-disabled"), conversationData));
  await env.withSecurityRulesDisabled(async (context) => {
    const disabled = context.firestore();
    await updateDoc(doc(disabled, "shops", shopId), { catalogEnabled: true });
    await setDoc(doc(disabled, "shops", shopId, "catalog", "product-a"), { name: "Jacket", hidden: false });
    await setDoc(doc(disabled, "shops", shopId, "catalog", "hidden-product"), { name: "Hidden", hidden: true });
  });

  await assertSucceeds(setDoc(customerConversation, conversationData));
  await assertSucceeds(setDoc(doc(customerDb, "shops", shopId, "conversations", "tagged"), {
    ...conversationData,
    productId: "product-a",
    productName: "Jacket",
  }));
  await assertFails(setDoc(doc(customerDb, "shops", shopId, "conversations", "wrong-product-name"), {
    ...conversationData,
    productId: "product-a",
    productName: "Different product",
  }));
  await assertFails(setDoc(doc(customerDb, "shops", shopId, "conversations", "hidden-product"), {
    ...conversationData,
    productId: "hidden-product",
    productName: "Hidden",
  }));
  await assertSucceeds(getDoc(customerConversation));
  await assertSucceeds(getDocs(query(
    collection(customerDb, "shops", shopId, "conversations"),
    where("customerUid", "==", "buyer-a"),
    orderBy("createdAt", "desc")
  )));
  await assertFails(getDocs(query(
    collection(otherCustomerDb, "shops", shopId, "conversations"),
    where("customerUid", "==", "buyer-a")
  )));
  await assertSucceeds(getDocs(collection(staffDb, "shops", shopId, "conversations")));
  await assertFails(getDoc(doc(otherCustomerDb, "shops", shopId, "conversations", conversationId)));
  await assertFails(getDocs(collection(unverifiedDb, "shops", shopId, "conversations", conversationId, "messages")));
  await assertFails(setDoc(doc(unverifiedDb, "shops", shopId, "conversations", "unverified"), {
    customerUid: "buyer-unverified",
    customerEmail: "ana@example.com",
    customerName: "ana@example.com",
    createdAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(customerConversation, { customerEmail: "other@example.com" }));

  await assertSucceeds(addDoc(customerMessages, {
    authorUid: "buyer-a",
    authorRole: "customer",
    authorName: "ana@example.com",
    text: "Da li je dostupan ovaj artikal?",
    createdAt: serverTimestamp(),
  }));
  await assertSucceeds(getDocs(customerMessages));
  await assertSucceeds(addDoc(collection(staffDb, "shops", shopId, "conversations", conversationId, "messages"), {
    authorUid: "staff-a",
    authorRole: "shop",
    authorName: "Prodavnica",
    text: "Jeste, dostupan je.",
    createdAt: serverTimestamp(),
  }));
  await assertFails(addDoc(customerMessages, {
    authorUid: "buyer-a",
    authorRole: "shop",
    authorName: "ana@example.com",
    text: "Neispravna uloga.",
    createdAt: serverTimestamp(),
  }));
  await assertFails(addDoc(collection(otherCustomerDb, "shops", shopId, "conversations", conversationId, "messages"), {
    authorUid: "buyer-b",
    authorRole: "customer",
    authorName: "other@example.com",
    text: "Nedozvoljena poruka.",
    createdAt: serverTimestamp(),
  }));
});

test("customers and shop members can hide a conversation only from their own view", async () => {
  const customerDb = env.authenticatedContext("buyer-a", {
    email: "ana@example.com",
    email_verified: true,
  }).firestore();
  const staffDb = firestoreFor("staff-a");
  const conversationId = "hide-per-participant";
  const customerConversation = doc(customerDb, "shops", shopId, "conversations", conversationId);
  const staffConversation = doc(staffDb, "shops", shopId, "conversations", conversationId);

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "shops", shopId, "conversations", conversationId), {
      customerUid: "buyer-a",
      customerEmail: "ana@example.com",
      customerName: "ana@example.com",
      createdAt: Timestamp.now(),
    });
  });

  await assertSucceeds(updateDoc(customerConversation, { hiddenByCustomer: true }));
  await assertFails(updateDoc(customerConversation, { hiddenByShop: true }));
  await assertFails(updateDoc(customerConversation, { productName: "Changed content" }));
  await assertFails(updateDoc(customerConversation, { hiddenByCustomer: false }));
  assert.equal((await getDoc(staffConversation)).data()?.hiddenByCustomer, true);

  await assertSucceeds(updateDoc(staffConversation, { hiddenByShop: true }));
  await assertFails(updateDoc(staffConversation, { hiddenByCustomer: true }));
  await assertFails(updateDoc(staffConversation, { customerEmail: "changed@example.com" }));
  await assertFails(updateDoc(staffConversation, { hiddenByShop: false }));
  assert.equal((await getDoc(customerConversation)).data()?.hiddenByShop, true);
});

test("customer records are private to the shop and pinned to a validated shape", async () => {
  const staffDb = firestoreFor("staff-a");
  const outsiderDb = firestoreFor("outsider");
  const signedOutDb = firestoreFor();
  const customerRef = doc(staffDb, "shops", shopId, "customers", "c1");

  const valid = { name: "Ana", contact: "+381641234567", email: "", note: "", tags: ["vip"] };
  await assertSucceeds(setDoc(customerRef, { ...valid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));

  // A contact and a purchase history are not catalog material, so no customer
  // document is reachable without a session or from another shop.
  await assertFails(getDoc(doc(signedOutDb, "shops", shopId, "customers", "c1")));
  await assertFails(getDocs(collection(signedOutDb, "shops", shopId, "customers")));
  await assertFails(getDoc(doc(outsiderDb, "shops", shopId, "customers", "c1")));
  await assertFails(setDoc(doc(signedOutDb, "shops", shopId, "customers", "c2"), valid));
  await assertSucceeds(getDoc(doc(staffDb, "shops", shopId, "customers", "c1")));

  // The rules pin the shape so a member cannot smuggle in fields the catalog
  // or the export would then have to know about.
  await assertFails(setDoc(doc(staffDb, "shops", shopId, "customers", "c3"), { ...valid, costPrice: 0 }));
  await assertFails(setDoc(doc(staffDb, "shops", shopId, "customers", "c4"), { ...valid, name: "" }));
  await assertFails(setDoc(doc(staffDb, "shops", shopId, "customers", "c5"), { ...valid, email: 117 }));
  await assertFails(setDoc(doc(staffDb, "shops", shopId, "customers", "c6"), { ...valid, name: "x".repeat(101) }));
  await assertFails(setDoc(doc(staffDb, "shops", shopId, "customers", "c7"), { ...valid, note: "x".repeat(2001) }));
  await assertFails(setDoc(doc(staffDb, "shops", shopId, "customers", "c8"), { ...valid, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }));
  await assertFails(setDoc(doc(staffDb, "shops", shopId, "customers", "c9"), { ...valid, tags: ["x".repeat(31)] }));
  await assertFails(setDoc(doc(staffDb, "shops", shopId, "customers", "c10"), { ...valid, tags: "vip" }));

  // createdAt and updatedAt come from the server on create and cannot be faked.
  await assertFails(setDoc(doc(staffDb, "shops", shopId, "customers", "c11"), { ...valid, createdAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(staffDb, "shops", shopId, "customers", "c12"), { ...valid }));

  // An empty tag list is valid — most customers have no segment.
  await assertSucceeds(setDoc(doc(staffDb, "shops", shopId, "customers", "c13"), { ...valid, tags: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
});

test("a customer record is editable forever but never backdated", async () => {
  const db = firestoreFor("staff-a");
  const ref = doc(db, "shops", shopId, "customers", "c1");
  await setDoc(ref, { name: "Ana", contact: "", email: "", note: "", tags: ["vip"], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  await assertSucceeds(updateDoc(ref, { name: "Ana Petrović", note: "prefers mornings", tags: ["vip", "wholesale"], updatedAt: serverTimestamp() }));
  // Rewriting when the record was added would let a shop backdate its CRM to
  // make a customer look older than they are.
  await assertFails(updateDoc(ref, { createdAt: Timestamp.fromMillis(0) }));
  // The validated fields stay validated after the first good write.
  await assertFails(updateDoc(ref, { email: 117, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { tags: "vip", updatedAt: serverTimestamp() }));

  // Deleting the record is a member action; the sales that referenced it keep
  // their own copy of the name, so nothing about the history is lost.
  await assertFails(deleteDoc(doc(firestoreFor("outsider"), "shops", shopId, "customers", "c1")));
  await assertSucceeds(deleteDoc(ref));
});

test("sales can be attributed to a customer, but nothing else on them can change", async () => {
  const db = firestoreFor("staff-a");
  const sale = {
    lines: [{ productId: "p", productName: "X", variantId: "v", variantLabel: "", quantity: 1, unitPrice: 10 }],
    total: 10,
    channel: "store",
    buyerName: "Ana",
    note: "",
    actorUid: "staff-a",
    actorName: "Staff",
  };
  const newSale = { ...sale, buyerContact: "" };

  // An unattributed sale stays valid: a walk-in with no record is still a sale.
  await assertSucceeds(setDoc(doc(db, "shops", shopId, "sales", "s1"), { ...newSale, createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, "shops", shopId, "sales", "s2"), { ...newSale, customerId: "c1", createdAt: serverTimestamp() }));
  const legacySale = { ...sale, buyerInstagram: "" };
  await assertSucceeds(setDoc(doc(db, "shops", shopId, "sales", "legacy"), { ...legacySale, createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, "shops", shopId, "sales", "ambiguous"), {
    ...newSale,
    buyerInstagram: "",
    createdAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(db, "shops", shopId, "sales", "s3"), { ...newSale, customerId: "", createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, "shops", shopId, "sales", "s4"), { ...newSale, customerId: 42, createdAt: serverTimestamp() }));

  // A storno is a new compensating document, so the link must be a usable id.
  await assertSucceeds(setDoc(doc(db, "shops", shopId, "sales", "storno"), { ...newSale, stornoOf: "s1", createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, "shops", shopId, "sales", "storno-empty"), { ...newSale, stornoOf: "", createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, "shops", shopId, "sales", "storno-num"), { ...newSale, stornoOf: 42, createdAt: serverTimestamp() }));

  // The line shape is deliberately unpinned, so the cost snapshot rides along
  // inside each line without a rules change.
  await assertSucceeds(setDoc(doc(db, "shops", shopId, "sales", "costed"), {
    ...newSale,
    lines: [{ ...sale.lines[0], unitCost: 4 }],
    createdAt: serverTimestamp(),
  }));

  // Attributing a recorded sale is the one edit allowed after the fact, because
  // it records who it was to without touching what was sold or for how much.
  await assertSucceeds(updateDoc(doc(db, "shops", shopId, "sales", "s1"), { customerId: "c1" }));
  await assertSucceeds(updateDoc(doc(db, "shops", shopId, "sales", "s1"), { customerId: deleteField() }));
  await assertFails(updateDoc(doc(db, "shops", shopId, "sales", "s1"), { total: 1 }));
  await assertFails(updateDoc(doc(db, "shops", shopId, "sales", "s1"), { buyerName: "Someone else" }));
  await assertFails(deleteDoc(doc(db, "shops", shopId, "sales", "s1")));
});

test("a member can claim an order for a customer without restating what was ordered", async () => {
  const db = firestoreFor("staff-a");
  await env.withSecurityRulesDisabled(async (context) => {
    const disabled = context.firestore();
    await updateDoc(doc(disabled, "shops", shopId), { catalogEnabled: true });
    await setDoc(doc(disabled, "shops", shopId, "orders", "o1"), {
      code: "K7M2QP",
      lines: [{ productId: "p", productName: "X", variantLabel: "", quantity: 1 }],
      total: 25,
      currency: "EUR",
      customerName: "Ana",
      customerContact: "@ana",
      note: "",
      channel: "instagram",
      status: "new",
      createdAt: serverTimestamp(),
    });
  });

  await assertSucceeds(updateDoc(doc(db, "shops", shopId, "orders", "o1"), { customerId: "c1" }));
  await assertSucceeds(updateDoc(doc(db, "shops", shopId, "orders", "o1"), { customerId: deleteField() }));
  await assertFails(updateDoc(doc(db, "shops", shopId, "orders", "o1"), { customerId: "" }));
  await assertFails(updateDoc(doc(db, "shops", shopId, "orders", "o1"), { customerId: 7 }));
  // Linking a customer buys no new power over the order itself.
  await assertFails(updateDoc(doc(db, "shops", shopId, "orders", "o1"), { total: 0 }));
  await assertFails(updateDoc(doc(db, "shops", shopId, "orders", "o1"), { currency: "RSD" }));
  await assertFails(updateDoc(doc(db, "shops", shopId, "orders", "o1"), { lines: [] }));
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

test("owners can grant catalog access only to staff in their shop", async () => {
  const ownerDb = firestoreFor("owner-a");
  const staffDb = firestoreFor("staff-a");
  const outsiderDb = firestoreFor("outsider");
  const staffRef = doc(ownerDb, "users", "staff-a");

  const members = await assertSucceeds(getDocs(query(collection(ownerDb, "users"), where("shopId", "==", shopId))));
  assert.equal(members.size, 2);
  await assertFails(getDocs(query(collection(staffDb, "users"), where("shopId", "==", shopId))));

  await assertSucceeds(updateDoc(staffRef, { permissions: { manageCatalog: true } }));
  await assertSucceeds(updateDoc(staffRef, { permissions: { manageCatalog: false } }));
  await assertFails(updateDoc(doc(staffDb, "users", "staff-a"), { permissions: { manageCatalog: true } }));
  await assertFails(updateDoc(doc(outsiderDb, "users", "staff-a"), { permissions: { manageCatalog: true } }));
  await assertFails(updateDoc(staffRef, { role: "owner" }));
  await assertFails(updateDoc(staffRef, { permissions: { manageCatalog: true, manageCurrency: true } }));
});

test("catalog managers can edit settings while shop members retain product catalog sync", async () => {
  const ownerDb = firestoreFor("owner-a");
  const staffDb = firestoreFor("staff-a");
  const unprivilegedStaffDb = firestoreFor("staff-no-catalog");
  const shopRef = doc(staffDb, "shops", shopId);
  const catalogRef = doc(staffDb, "shops", shopId, "catalog", productId);
  const catalogItem = {
    name: "Jacket",
    category: "Clothing",
    imageUrl: "",
    images: [],
    salePrice: 20,
    variants: ["M"],
    variantIds: [variantId],
    stockQuantity: 5,
    variantStock: { [variantId]: 5 },
    fields: [],
    hidden: false,
    updatedAt: serverTimestamp(),
  };

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", "staff-no-catalog"), {
      shopId,
      displayName: "Unprivileged staff",
      role: "staff",
    });
  });
  await assertFails(updateDoc(shopRef, { catalogEnabled: true }));
  await assertSucceeds(setDoc(catalogRef, catalogItem));
  await assertSucceeds(updateDoc(doc(ownerDb, "users", "staff-a"), { permissions: { manageCatalog: true } }));

  await assertSucceeds(updateDoc(shopRef, { catalogEnabled: true, catalogWhatsapp: "+381601234567" }));
  await assertSucceeds(setDoc(catalogRef, catalogItem));
  await assertFails(updateDoc(shopRef, { currency: "USD" }));
  await assertFails(updateDoc(shopRef, { name: "Unauthorized rename" }));
  await assertFails(updateDoc(shopRef, { catalogEnabled: false, currency: "USD" }));
  await assertSucceeds(updateDoc(catalogRef, { name: "Managed jacket", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(unprivilegedStaffDb, "shops", shopId, "catalog", productId), {
    name: "Updated from product",
    updatedAt: serverTimestamp(),
  }));
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

test("a stock transaction keeps public catalog availability in sync atomically", async () => {
  const db = firestoreFor("owner-a");
  const catalogRef = doc(db, "shops", shopId, "catalog", productId);
  await assertSucceeds(setDoc(catalogRef, {
    name: "Jacket",
    category: "Clothing",
    imageUrl: "",
    images: [],
    salePrice: 20,
    variants: ["M"],
    variantIds: [variantId],
    stockQuantity: 5,
    variantStock: { [variantId]: 5 },
    fields: [],
    hidden: false,
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(updateStock("staff-a", -5));
  const catalog = await getDoc(doc(firestoreFor(), "shops", shopId, "catalog", productId));
  assert.equal(catalog.data()?.stockQuantity, 0);
  assert.equal(catalog.data()?.variantStock[variantId], 0);
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

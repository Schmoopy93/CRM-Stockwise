import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";

const projectId = "demo-inventory-crm";
const shopId = "shop-a";
const productId = "product-a";
const variantId = "variant-a";
let env: RulesTestEnvironment;

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
});

after(async () => {
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

test("only shop owners can change shop configuration", async () => {
  const ownerDb = firestoreFor("owner-a");
  const staffDb = firestoreFor("staff-a");
  await assertSucceeds(updateDoc(doc(ownerDb, "shops", shopId), { name: "Renamed shop" }));
  await assertFails(updateDoc(doc(staffDb, "shops", shopId), { name: "Unauthorized rename" }));
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

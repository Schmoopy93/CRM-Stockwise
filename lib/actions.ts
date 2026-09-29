import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { ProductCustomField, ProductVariant } from "@/lib/types";

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function signInWithGoogle(
  mode: "login" | "newShop" | "joinShop",
  shopName = "",
  shopId = ""
) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(auth, provider);
  const user = credential.user;
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) return;
  if (mode === "login") throw new Error("GOOGLE_PROFILE_REQUIRED");

  const displayName = user.displayName?.trim() || user.email?.split("@")[0] || "Google user";
  if (mode === "newShop") {
    const trimmedShopName = shopName.trim();
    if (!trimmedShopName) throw new Error("GOOGLE_SHOP_NAME_REQUIRED");

    const shopRef = doc(collection(db, "shops"));
    const batch = writeBatch(db);
    batch.set(shopRef, { name: trimmedShopName, createdBy: user.uid });
    batch.set(userRef, { shopId: shopRef.id, displayName, role: "owner" });
    await batch.commit();
    return;
  }

  const trimmedShopId = shopId.trim();
  if (!trimmedShopId) throw new Error("GOOGLE_SHOP_ID_REQUIRED");
  const shopSnap = await getDoc(doc(db, "shops", trimmedShopId));
  if (!shopSnap.exists()) throw new Error("GOOGLE_SHOP_NOT_FOUND");

  await setDoc(userRef, { shopId: trimmedShopId, displayName, role: "staff" });
}

export async function signOut() {
  await firebaseSignOut(auth);
}

// ─── Products ────────────────────────────────────────────────────────────────

export async function saveProduct(
  shopId: string,
  productId: string | null,
  name: string,
  sku: string,
  category: string,
  minStock: number,
  imageFile: File | null,
  existingImageUrl: string,
  variants: ProductVariant[],
  customFieldDefinitions: ProductCustomField[] = [],
  customFieldValues: Record<string, string | number | boolean> = {}
): Promise<string> {
  if (variants.length === 0) throw new Error("Dodaj bar jednu varijantu");

  const products = collection(db, "shops", shopId, "products");
  const docRef = productId ? doc(products, productId) : doc(products);
  const id = docRef.id;

  let imageUrl = existingImageUrl;
  if (imageFile) {
    const storageRef = ref(storage, `shops/${shopId}/products/${id}.jpg`);
    await uploadBytes(storageRef, imageFile);
    imageUrl = await getDownloadURL(storageRef);
  }

  const total = variants.reduce((sum, v) => sum + Math.max(0, v.quantity), 0);
  await setDoc(docRef, {
    name: name.trim(),
    sku: sku.trim(),
    category: category.trim(),
    minStock: Math.max(0, minStock),
    imageUrl,
    totalQuantity: total,
    customFieldDefinitions,
    customFieldValues,
    updatedAt: serverTimestamp(),
  });

  const variantsCol = collection(docRef, "variants");
  const existingSnap = await getDocs(variantsCol);
  const incomingIds = new Set(variants.map((v) => v.id).filter(Boolean));
  for (const d of existingSnap.docs) {
    if (!incomingIds.has(d.id)) await deleteDoc(d.ref);
  }
  for (const variant of variants) {
    const vRef = variant.id ? doc(variantsCol, variant.id) : doc(variantsCol);
    await setDoc(vRef, {
      label: variant.label.trim(),
      sku: variant.sku.trim(),
      quantity: Math.max(0, variant.quantity),
    });
  }
  return id;
}

export async function deleteProduct(shopId: string, productId: string) {
  const productRef = doc(db, "shops", shopId, "products", productId);
  const variants = await getDocs(collection(productRef, "variants"));
  for (const v of variants.docs) await deleteDoc(v.ref);
  await deleteDoc(productRef);
}

// ─── Stock ───────────────────────────────────────────────────────────────────

export async function adjustStock(
  shopId: string,
  productId: string,
  variant: ProductVariant,
  delta: number,
  actorUid: string,
  actorName: string
) {
  if (delta === 0) throw new Error("Promena mora biti različita od nule");

  const productRef = doc(db, "shops", shopId, "products", productId);
  const variantRef = doc(productRef, "variants", variant.id);
  const eventRef = doc(collection(db, "shops", shopId, "stockEvents"));

  await runTransaction(db, async (tx) => {
    const variantSnap = await tx.get(variantRef);
    if (!variantSnap.exists()) throw new Error("Varijanta više ne postoji");

    const current = variantSnap.data().quantity ?? 0;
    const next = current + delta;
    if (next < 0) throw new Error("Nedovoljno stanja");

    const productSnap = await tx.get(productRef);
    const total = Math.max(0, (productSnap.data()?.totalQuantity ?? 0) + delta);

    tx.update(variantRef, { quantity: next });
    tx.update(productRef, { totalQuantity: total, updatedAt: serverTimestamp() });
    tx.set(eventRef, {
      productId,
      variantId: variant.id,
      variantLabel: variant.label,
      delta,
      actorUid,
      actorName,
      createdAt: serverTimestamp(),
    });
  });
}

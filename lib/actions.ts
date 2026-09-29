import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
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
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { ProductVariant } from "@/lib/types";

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signOut() {
  await firebaseSignOut(auth);
}

export async function registerNewShop(
  email: string,
  password: string,
  displayName: string,
  shopName: string
) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const user = cred.user;
  try {
    await updateProfile(user, { displayName: displayName.trim() });
    const shopRef = doc(collection(db, "shops"));
    await setDoc(shopRef, { name: shopName.trim(), createdBy: user.uid });
    await setDoc(doc(db, "users", user.uid), {
      shopId: shopRef.id,
      displayName: displayName.trim(),
      role: "owner",
    });
  } catch (e) {
    await user.delete();
    throw e;
  }
}

export async function registerJoinShop(
  email: string,
  password: string,
  displayName: string,
  shopId: string
) {
  const trimmedShopId = shopId.trim();
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const user = cred.user;
  try {
    const shopSnap = await getDoc(doc(db, "shops", trimmedShopId));
    if (!shopSnap.exists()) throw new Error("Radnja sa tim kodom ne postoji");
    await updateProfile(user, { displayName: displayName.trim() });
    await setDoc(doc(db, "users", user.uid), {
      shopId: trimmedShopId,
      displayName: displayName.trim(),
      role: "staff",
    });
  } catch (e) {
    await user.delete();
    throw e;
  }
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
  variants: ProductVariant[]
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

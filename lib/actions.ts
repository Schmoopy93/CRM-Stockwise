import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  collection,
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
import { applyStockDelta } from "@/lib/stock-invariants";
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
  customFieldValues: Record<string, string | number | boolean> = {},
  costPrice?: number,
  salePrice?: number,
  supplier?: { name: string; contact?: string; notes?: string }
): Promise<string> {
  if (variants.length === 0) throw new Error("Dodaj bar jednu varijantu");
  if (variants.length > 200) throw new Error("Artikal može imati najviše 200 varijanti");
  if (variants.some((variant) => !Number.isSafeInteger(variant.quantity) || variant.quantity < 0)) {
    throw new Error("Količina varijante mora biti nenegativan ceo broj");
  }
  if (new Set(variants.map((variant) => variant.id).filter(Boolean)).size !== variants.filter((variant) => variant.id).length) {
    throw new Error("Varijanta ne može biti dodata više puta");
  }

  const products = collection(db, "shops", shopId, "products");
  const docRef = productId ? doc(products, productId) : doc(products);
  const id = docRef.id;

  let imageUrl = existingImageUrl;
  if (imageFile) {
    const storageRef = ref(storage, `shops/${shopId}/products/${id}.jpg`);
    await uploadBytes(storageRef, imageFile);
    imageUrl = await getDownloadURL(storageRef);
  }

  const variantsCol = collection(docRef, "variants");
  const total = variants.reduce((sum, variant) => sum + variant.quantity, 0);
  if (!Number.isSafeInteger(total)) throw new Error("Ukupna količina je van dozvoljenog opsega");
  const incomingIds = new Set(variants.map((variant) => variant.id).filter(Boolean));

  const existingSnap = await getDocs(variantsCol);
  const existingVariants = new Map(existingSnap.docs.map((variantDoc) => [variantDoc.id, variantDoc]));

  await runTransaction(db, async (tx) => {
    const productSnap = await tx.get(docRef);
    if (productSnap.exists()) {
      const existingTotal = productSnap.data().totalQuantity ?? 0;
      if (existingTotal !== total) {
        throw new Error("Količinu menjajte kroz korekciju stanja kako bi promena bila zabeležena u istoriji");
      }
      for (const variant of variants) {
        if (!variant.id) {
          if (variant.quantity !== 0) throw new Error("Nova varijanta mora početi sa nulom; koristite prijem robe za unos stanja");
          continue;
        }
        const previous = existingVariants.get(variant.id);
        if (!previous) throw new Error("Varijanta nije deo ovog artikla");
        if ((previous.data().quantity ?? 0) !== variant.quantity) {
          throw new Error("Količinu menjajte kroz korekciju stanja kako bi promena bila zabeležena u istoriji");
        }
      }
      for (const previous of existingSnap.docs) {
        if (!incomingIds.has(previous.id) && (previous.data().quantity ?? 0) !== 0) {
          throw new Error("Varijanta sa zalihom ne može biti uklonjena; prvo korigujte stanje na nulu");
        }
      }
    }

    tx.set(docRef, {
      name: name.trim(),
      sku: sku.trim(),
      category: category.trim(),
      minStock: Math.max(0, Math.floor(minStock)),
      imageUrl,
      totalQuantity: total,
      customFieldDefinitions,
      customFieldValues,
      ...(costPrice !== undefined ? { costPrice } : {}),
      ...(salePrice !== undefined ? { salePrice } : {}),
      ...(supplier?.name?.trim() ? { supplier: { name: supplier.name.trim(), contact: supplier.contact?.trim() ?? "", notes: supplier.notes?.trim() ?? "" } } : {}),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    for (const previous of existingSnap.docs) {
      if (!incomingIds.has(previous.id)) tx.delete(previous.ref);
    }
    for (const variant of variants) {
      const variantRef = variant.id ? doc(variantsCol, variant.id) : doc(variantsCol);
      tx.set(variantRef, {
        label: variant.label.trim(),
        sku: variant.sku.trim(),
        quantity: variant.quantity,
      }, { merge: true });
    }
  });
  return id;
}

export async function deleteProduct(shopId: string, productId: string) {
  const productRef = doc(db, "shops", shopId, "products", productId);
  const productSnap = await getDoc(productRef);
  if (!productSnap.exists()) throw new Error("Artikal nije pronađen");
  if ((productSnap.data().totalQuantity ?? 0) > 0) {
    throw new Error("Pre brisanja uklonite sve zalihe artikla kroz korekciju stanja");
  }
  const variants = await getDocs(collection(productRef, "variants"));
  if (variants.docs.some((variant) => (variant.data().quantity ?? 0) > 0)) {
    throw new Error("Pre brisanja uklonite sve zalihe artikla kroz korekciju stanja");
  }
  if (variants.size > 499) throw new Error("Artikal ima previše varijanti za bezbedno brisanje");
  const batch = writeBatch(db);
  for (const variant of variants.docs) batch.delete(variant.ref);
  batch.delete(productRef);
  await batch.commit();
}

// ─── Stock ───────────────────────────────────────────────────────────────────

export type StockMovementReason = "adjustment" | "receipt" | "sale" | "return" | "correction";

export interface StockReceiptLine {
  productId: string;
  variantId: string;
  quantity: number;
}

export class PartialReceiptError extends Error {
  constructor(readonly completedLineKeys: string[], options?: ErrorOptions) {
    super("RECEIPT_PARTIALLY_COMPLETED", options);
    this.name = "PartialReceiptError";
  }
}

export async function adjustStock(
  shopId: string,
  productId: string,
  variant: ProductVariant,
  delta: number,
  actorUid: string,
  actorName: string,
  reason: StockMovementReason = "adjustment"
) {
  if (!Number.isSafeInteger(delta) || delta === 0) throw new Error("Promena mora biti ceo broj različit od nule");

  const productRef = doc(db, "shops", shopId, "products", productId);
  const variantRef = doc(productRef, "variants", variant.id);
  const eventRef = doc(collection(db, "shops", shopId, "stockEvents"));

  await runTransaction(db, async (tx) => {
    const variantSnap = await tx.get(variantRef);
    if (!variantSnap.exists()) throw new Error("Varijanta više ne postoji");
    const productSnap = await tx.get(productRef);
    if (!productSnap.exists()) throw new Error("Artikal više ne postoji");
    const next = applyStockDelta(
      variantSnap.data().quantity ?? 0,
      productSnap.data().totalQuantity ?? 0,
      delta
    );

    tx.update(variantRef, { quantity: next.variantQuantity, lastStockEventId: eventRef.id });
    tx.update(productRef, { totalQuantity: next.productQuantity, lastStockEventId: eventRef.id, updatedAt: serverTimestamp() });
    tx.set(eventRef, {
      productId,
      variantId: variant.id,
      variantLabel: variantSnap.data().label ?? variant.label,
      delta,
      reason,
      actorUid,
      actorName,
      createdAt: serverTimestamp(),
    });
  });
}

/** Each receipt line is atomic. Completed lines are returned on partial
 * failure so the UI can retain only pending lines for a safe retry.
 */
export async function receiveStock(
  shopId: string,
  lines: StockReceiptLine[],
  actorUid: string,
  actorName: string
) {
  if (lines.length === 0) throw new Error("Dodajte bar jednu stavku prijema");
  if (lines.length > 100) throw new Error("Prijem može sadržati najviše 100 artikala");
  if (lines.some((line) => !Number.isSafeInteger(line.quantity) || line.quantity <= 0)) {
    throw new Error("Količina prijema mora biti pozitivan ceo broj");
  }
  if (new Set(lines.map((line) => `${line.productId}/${line.variantId}`)).size !== lines.length) {
    throw new Error("Ista varijanta ne može biti uneta dva puta u prijem");
  }

  const completedLineKeys: string[] = [];
  for (const line of lines) {
    try {
      await adjustStock(
        shopId,
        line.productId,
        { id: line.variantId, label: "", sku: "", quantity: 0 },
        line.quantity,
        actorUid,
        actorName,
        "receipt"
      );
      completedLineKeys.push(`${line.productId}/${line.variantId}`);
    } catch (error) {
      if (completedLineKeys.length > 0) throw new PartialReceiptError(completedLineKeys, { cause: error });
      throw error;
    }
  }
}

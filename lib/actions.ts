import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteField,
  doc,
  deleteDoc,
  FieldValue,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  WriteBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { uploadProductImage, uploadShopImage } from "@/lib/cloudinary";
import { applyStockDelta } from "@/lib/stock-invariants";
import { normalizeOrderInput, newOrderCode, orderTotal, ORDER_STATUSES, type OrderInput } from "@/lib/orders";
import { normalizeCustomer, type CustomerInput } from "@/lib/customers";
import { getLocalizedOptionValue } from "@/lib/product-field-options";
import { CatalogChannels } from "@/lib/catalog-channels";
import { BASE_CURRENCY, isSupportedCurrency, roundForCurrency } from "@/lib/currency";
import { AppLocale, CatalogStatEvent, OrderStatus, Product, ProductCustomField, ProductVariant, SaleChannel, SaleLine } from "@/lib/types";

const BATCH_LIMIT = 450;
const READ_CONCURRENCY = 24;
const CATALOG_LOCALES: AppLocale[] = ["sr", "en", "ru", "de", "es", "it"];

type BatchOperation = (batch: WriteBatch) => void;

async function commitInChunks(operations: BatchOperation[]) {
  for (let start = 0; start < operations.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(start, start + BATCH_LIMIT)) operation(batch);
    await batch.commit();
  }
}

/** Runs `worker` over every item with a bounded number of in-flight reads so a
 * wide fan-out does not become N sequential round-trips. Results keep input order. */
async function mapWithConcurrency<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(READ_CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function signInWithGoogle(
  mode: "login" | "newShop" | "joinShop",
  shopName = "",
  shopId = ""
) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(auth, provider);
  try {
    await ensureUserProfile(credential.user, mode, shopName, shopId);
  } catch (error) {
    await firebaseSignOut(auth).catch(() => undefined);
    throw error;
  }
}

async function ensureUserProfile(
  user: User,
  mode: "login" | "newShop" | "joinShop",
  shopName: string,
  shopId: string
) {
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

// ─── Catalog ─────────────────────────────────────────────────────────────────

/** Public catalog documents contain only customer-safe fields — never
 * costPrice, supplier or SKUs. */
function buildCatalogDoc(
  name: string,
  category: string,
  imageUrl: string,
  images: string[],
  salePrice: number | undefined,
  compareAtPrice: number | undefined,
  variantLabels: string[],
  definitions: ProductCustomField[],
  values: Record<string, string | number | boolean>,
  hidden: boolean,
  createdAt?: Timestamp | FieldValue
) {
  const fields = definitions
    .map((definition) => {
      const value = values[definition.key];
      return {
        label: definition.label,
        labels: definition.labels ?? {},
        type: definition.type,
        value,
        ...(definition.type === "select" && value !== undefined && value !== ""
          ? { values: Object.fromEntries(CATALOG_LOCALES.map((locale) => [locale, getLocalizedOptionValue(definition, String(value), locale)])) }
          : {}),
      };
    })
    .filter((field) => field.value !== undefined && field.value !== "");
  return {
    name: name.trim(),
    category: category.trim(),
    imageUrl,
    images: images.length > 0 ? images : (imageUrl ? [imageUrl] : []),
    salePrice: salePrice !== undefined ? salePrice : deleteField(),
    compareAtPrice: salePrice !== undefined && compareAtPrice !== undefined && compareAtPrice > salePrice ? compareAtPrice : deleteField(),
    variants: variantLabels,
    fields,
    hidden,
    ...(createdAt ? { createdAt } : {}),
    updatedAt: serverTimestamp(),
  };
}

async function isCatalogEnabled(shopId: string) {
  const shopSnap = await getDoc(doc(db, "shops", shopId));
  return shopSnap.data()?.catalogEnabled === true;
}

export interface CatalogSettings {
  enabled: boolean;
  channels: CatalogChannels;
}

/** Enables/disables the public catalog. Enabling publishes every product
 * (customer-safe fields only); disabling deletes all catalog documents. */
export async function updateCatalogSettings(shopId: string, settings: CatalogSettings) {
  const shopRef = doc(db, "shops", shopId);
  const contactFields = {
    catalogWhatsapp: settings.channels.whatsapp.trim().slice(0, 100),
    catalogTelegram: settings.channels.telegram.trim().slice(0, 100),
    catalogInstagram: settings.channels.instagram.trim().slice(0, 100),
    catalogContact: deleteField(),
  };

  if (!settings.enabled) {
    const catalogDocs = await getDocs(collection(db, "shops", shopId, "catalog"));
    await commitInChunks([
      (batch) => batch.update(shopRef, { catalogEnabled: false, ...contactFields }),
      ...catalogDocs.docs.map((catalogDoc): BatchOperation => (batch) => batch.delete(catalogDoc.ref)),
    ]);
    return;
  }

  const operations: BatchOperation[] = [];
  const productsSnap = await getDocs(collection(db, "shops", shopId, "products"));
  const variantLabelsByProduct = await mapWithConcurrency(productsSnap.docs, (productDoc) =>
    getDocs(collection(productDoc.ref, "variants")).then((variantsSnap) =>
      variantsSnap.docs
        .map((variantDoc) => (variantDoc.data().label ?? "").trim())
        .filter(Boolean)
    )
  );
  productsSnap.docs.forEach((productDoc, index) => {
    const data = productDoc.data();
    const catalogDoc = buildCatalogDoc(
      data.name ?? "",
      data.category ?? "",
      data.imageUrl ?? "",
      Array.isArray(data.images) ? data.images : [],
      typeof data.salePrice === "number" ? data.salePrice : undefined,
      typeof data.compareAtPrice === "number" ? data.compareAtPrice : undefined,
      variantLabelsByProduct[index],
      data.customFieldDefinitions ?? [],
      data.customFieldValues ?? {},
      data.catalogHidden === true,
      data.createdAt instanceof Timestamp ? data.createdAt : undefined
    );
    operations.push((batch) => batch.set(doc(db, "shops", shopId, "catalog", productDoc.id), catalogDoc, { merge: true }));
  });
  operations.push((batch) => batch.update(shopRef, { catalogEnabled: true, ...contactFields }));
  await commitInChunks(operations);
}

/** Uploads (or removes when `file` is null) the catalog logo or cover image. */
export async function setCatalogImage(shopId: string, kind: "logo" | "cover", file: File | null) {
  const field = kind === "logo" ? "catalogLogoUrl" : "catalogCoverUrl";
  const url = file ? await uploadShopImage(file, shopId, kind) : null;
  await updateDoc(doc(db, "shops", shopId), { [field]: url ?? deleteField() });
}

/** Sets the currency the shop trades in. This only changes how prices are read
 * — stored prices stay in the base currency, so switching back and forth never
 * loses precision and never restates what a product costs. */
export async function updateShopCurrency(shopId: string, currency: string) {
  if (!isSupportedCurrency(currency)) throw new Error("CURRENCY_INVALID");
  await updateDoc(doc(db, "shops", shopId), { currency });
}

/** Best-effort, anonymous daily counter for the public catalog. */
export function trackCatalogEvent(shopId: string, event: CatalogStatEvent) {
  const day = new Date().toISOString().slice(0, 10);
  setDoc(doc(db, "shops", shopId, "catalogStats", day), { [event]: increment(1) }, { merge: true }).catch(() => undefined);
}

/** Records a catalog order so the shop can see what was asked for. Anonymous by
 * design — customers have no account — so this never touches stock: the shop
 * still records the sale explicitly, which keeps the ledger the only way stock
 * moves. Returns the human-quotable order code.
 *
 * `input` carries the prices the customer actually saw, already converted into
 * the shop's chosen currency, so the order is stored in the currency it was
 * quoted in. Recording it that way means a later change of the shop currency
 * cannot restate what was agreed, and the unit prices still add up to the total
 * the shop reads back. */
export async function placeCatalogOrder(shopId: string, input: OrderInput, currency: string = BASE_CURRENCY) {
  if (!await isCatalogEnabled(shopId)) throw new Error("CATALOG_DISABLED");
  const order = normalizeOrderInput(input);
  if (order.lines.length === 0) throw new Error("ORDER_EMPTY");
  const quotedIn = isSupportedCurrency(currency) ? currency : BASE_CURRENCY;

  const total = roundForCurrency(orderTotal(order.lines), quotedIn);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newOrderCode();
    const ref = doc(collection(db, "shops", shopId, "orders"));
    try {
      await setDoc(ref, {
        code,
        lines: order.lines,
        total,
        currency: quotedIn,
        customerName: order.customerName,
        customerContact: order.customerContact,
        note: order.note,
        channel: order.channel,
        status: "new",
        createdAt: serverTimestamp(),
      });
      trackCatalogEvent(shopId, "orders");
      return code;
    } catch (cause) {
      if (attempt === 4) throw cause;
    }
  }
  throw new Error("ORDER_FAILED");
}

/** Moves an order through its lifecycle. Stock is deliberately untouched here —
 * fulfilling an order and recording the sale are separate, deliberate steps. */
export async function updateOrderStatus(shopId: string, orderId: string, status: OrderStatus) {
  if (!ORDER_STATUSES.includes(status)) throw new Error("ORDER_STATUS_INVALID");
  await updateDoc(doc(db, "shops", shopId, "orders", orderId), { status });
}

// ─── Customers ───────────────────────────────────────────────────────────────

/** Creates or updates a customer. Returns the document id so a form can jump
 * straight to the new record. Tags and lengths are normalized here as well as in
 * the rules: the rules are the gate, this keeps the stored value identical
 * between both paths. */
export async function saveCustomer(
  shopId: string,
  customerId: string | null,
  input: CustomerInput
): Promise<string> {
  const customer = normalizeCustomer(input);
  const ref = customerId
    ? doc(db, "shops", shopId, "customers", customerId)
    : doc(collection(db, "shops", shopId, "customers"));

  const payload = { ...customer, updatedAt: serverTimestamp() };
  if (customerId) {
    await updateDoc(ref, payload);
  } else {
    await setDoc(ref, { ...customer, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  return ref.id;
}

/** Deleting a customer never touches sales or orders that referenced it: those
 * documents keep the name and contact that were on them, so the sale history
 * stays readable after the CRM record is gone. */
export async function deleteCustomer(shopId: string, customerId: string) {
  await deleteDoc(doc(db, "shops", shopId, "customers", customerId));
}

/** Attaches a catalog order to a customer. Customers place orders anonymously,
 * so the link can only be made from inside the shop, and only to an order that
 * already exists — the order's lines, total and currency are untouched. */
export async function linkOrderToCustomer(shopId: string, orderId: string, customerId: string | null) {
  const ref = doc(db, "shops", shopId, "orders", orderId);
  await updateDoc(ref, { customerId: customerId || deleteField() });
}

/** Attributes a recorded sale to a customer. A sale is otherwise immutable, so
 * this is the one field the rules let a member change after the fact. */
export async function linkSaleToCustomer(shopId: string, saleId: string, customerId: string | null) {
  const ref = doc(db, "shops", shopId, "sales", saleId);
  await updateDoc(ref, { customerId: customerId || deleteField() });
}

// ─── Products ────────────────────────────────────────────────────────────────

export const MAX_PRODUCT_IMAGES = 6;

export interface ProductImageInput {
  file: File | null;
  url: string;
}

export async function saveProduct(
  shopId: string,
  productId: string | null,
  name: string,
  sku: string,
  category: string,
  minStock: number,
  images: ProductImageInput[],
  variants: ProductVariant[],
  customFieldDefinitions: ProductCustomField[] = [],
  customFieldValues: Record<string, string | number | boolean> = {},
  costPrice?: number,
  salePrice?: number,
  supplier?: { name: string; contact?: string; notes?: string },
  catalogHidden = false,
  compareAtPrice?: number
): Promise<string> {
  if (variants.length === 0) throw new Error("VARIANT_REQUIRED");
  if (variants.length > 200) throw new Error("TOO_MANY_VARIANTS");
  if (variants.some((variant) => !Number.isSafeInteger(variant.quantity) || variant.quantity < 0)) {
    throw new Error("VARIANT_QUANTITY_INVALID");
  }
  if (new Set(variants.map((variant) => variant.id).filter(Boolean)).size !== variants.filter((variant) => variant.id).length) {
    throw new Error("DUPLICATE_VARIANT");
  }
  if ([costPrice, salePrice, compareAtPrice].some((price) => price !== undefined && (!Number.isFinite(price) || price < 0))) {
    throw new Error("PRICE_INVALID");
  }
  if (compareAtPrice !== undefined && (salePrice === undefined || compareAtPrice <= salePrice)) {
    throw new Error("COMPARE_PRICE_INVALID");
  }

  const products = collection(db, "shops", shopId, "products");
  const docRef = productId ? doc(products, productId) : doc(products);
  const id = docRef.id;

  const trimmedImages = images.slice(0, MAX_PRODUCT_IMAGES);
  const imageUrls: string[] = [];
  for (const image of trimmedImages) {
    if (image.file) {
      imageUrls.push(await uploadProductImage(image.file, shopId, `${id}-${imageUrls.length}`));
    } else if (image.url) {
      imageUrls.push(image.url);
    }
  }
  const imageUrl = imageUrls[0] ?? "";

  const variantsCol = collection(docRef, "variants");
  const total = variants.reduce((sum, variant) => sum + variant.quantity, 0);
  if (!Number.isSafeInteger(total)) throw new Error("VALUE_OUT_OF_RANGE");
  const incomingIds = new Set(variants.map((variant) => variant.id).filter(Boolean));

  const existingSnap = await getDocs(variantsCol);
  const existingVariants = new Map(existingSnap.docs.map((variantDoc) => [variantDoc.id, variantDoc]));
  let isNewProduct = false;

  await runTransaction(db, async (tx) => {
    const productSnap = await tx.get(docRef);
    isNewProduct = !productSnap.exists();
    if (productSnap.exists()) {
      const existingTotal = productSnap.data().totalQuantity ?? 0;
      if (existingTotal !== total) {
        throw new Error("QUANTITY_CHANGE_NOT_ALLOWED");
      }
      for (const variant of variants) {
        if (!variant.id) {
          if (variant.quantity !== 0) throw new Error("NEW_VARIANT_NONZERO");
          continue;
        }
        const previous = existingVariants.get(variant.id);
        if (!previous) throw new Error("VARIANT_NOT_IN_PRODUCT");
        if ((previous.data().quantity ?? 0) !== variant.quantity) {
          throw new Error("QUANTITY_CHANGE_NOT_ALLOWED");
        }
      }
      for (const previous of existingSnap.docs) {
        if (!incomingIds.has(previous.id) && (previous.data().quantity ?? 0) !== 0) {
          throw new Error("VARIANT_REMOVE_WITH_STOCK");
        }
      }
    }

    tx.set(docRef, {
      name: name.trim(),
      sku: sku.trim(),
      category: category.trim(),
      minStock: Math.max(0, Math.floor(minStock)),
      imageUrl,
      images: imageUrls,
      totalQuantity: total,
      customFieldDefinitions,
      customFieldValues,
      catalogHidden,
      costPrice: costPrice !== undefined ? costPrice : deleteField(),
      salePrice: salePrice !== undefined ? salePrice : deleteField(),
      compareAtPrice: compareAtPrice !== undefined ? compareAtPrice : deleteField(),
      supplier: supplier?.name?.trim()
        ? { name: supplier.name.trim(), contact: supplier.contact?.trim() ?? "", notes: supplier.notes?.trim() ?? "" }
        : deleteField(),
      ...(productSnap.exists() ? {} : { createdAt: serverTimestamp() }),
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

  if (await isCatalogEnabled(shopId)) {
    await setDoc(
      doc(db, "shops", shopId, "catalog", id),
      buildCatalogDoc(name, category, imageUrl, imageUrls, salePrice, compareAtPrice, variants.map((variant) => variant.label.trim()).filter(Boolean), customFieldDefinitions, customFieldValues, catalogHidden, isNewProduct ? serverTimestamp() : undefined),
      { merge: true }
    );
  }
  return id;
}

export async function deleteProduct(shopId: string, productId: string) {
  const productRef = doc(db, "shops", shopId, "products", productId);
  const productSnap = await getDoc(productRef);
  if (!productSnap.exists()) throw new Error("PRODUCT_NOT_FOUND");
  if ((productSnap.data().totalQuantity ?? 0) > 0) {
    throw new Error("DELETE_WITH_STOCK");
  }
  const variants = await getDocs(collection(productRef, "variants"));
  if (variants.docs.some((variant) => (variant.data().quantity ?? 0) > 0)) {
    throw new Error("DELETE_WITH_STOCK");
  }
  if (variants.size > 499) throw new Error("TOO_MANY_VARIANTS_TO_DELETE");
  const batch = writeBatch(db);
  for (const variant of variants.docs) batch.delete(variant.ref);
  batch.delete(productRef);
  batch.delete(doc(db, "shops", shopId, "catalog", productId));
  await batch.commit();
}

// ─── Categories ──────────────────────────────────────────────────────────────

/** Renames a category across every product in the shop and refreshes
 * published catalog documents. Old and new name are compared trimmed and
 * case-insensitively. */
export async function renameCategory(shopId: string, oldName: string, newName: string) {
  const from = oldName.trim();
  const to = newName.trim();
  if (!from) throw new Error("CATEGORY_REQUIRED");
  if (!to) throw new Error("CATEGORY_NAME_REQUIRED");
  if (to.length > 100) throw new Error("CATEGORY_NAME_TOO_LONG");
  if (from.toLowerCase() === to.toLowerCase()) throw new Error("CATEGORY_NAME_UNCHANGED");

  const productsSnap = await getDocs(collection(db, "shops", shopId, "products"));
  const affected = productsSnap.docs.filter((productDoc) => (productDoc.data().category ?? "").trim().toLowerCase() === from.toLowerCase());
  if (affected.length === 0) throw new Error("CATEGORY_NOT_FOUND");

  const catalogEnabled = await isCatalogEnabled(shopId);
  const operations: BatchOperation[] = [];
  for (const productDoc of affected) {
    operations.push((batch) => batch.update(productDoc.ref, { category: to, updatedAt: serverTimestamp() }));
    if (catalogEnabled) {
      operations.push((batch) => batch.set(
        doc(db, "shops", shopId, "catalog", productDoc.id),
        { category: to, updatedAt: serverTimestamp() },
        { merge: true }
      ));
    }
  }
  await commitInChunks(operations);
}

// ─── Stock ───────────────────────────────────────────────────────────────────

export type StockMovementReason = "adjustment" | "receipt" | "sale" | "return" | "correction";

export interface StockReceiptLine {
  productId: string;
  variantId: string;
  quantity: number;
}

export async function findProductByCode(
  shopId: string,
  products: Product[],
  rawCode: string
): Promise<{ product: Product; variantId?: string } | null> {
  const code = rawCode.trim();
  if (!code) return null;
  const product = products.find((candidate) => candidate.sku === code || candidate.name === code);
  if (product) return { product };

  const matches = await Promise.all(products.map(async (candidate) => {
    const snap = await getDocs(query(
      collection(db, "shops", shopId, "products", candidate.id, "variants"),
      where("sku", "==", code),
      limit(1)
    ));
    return snap.empty ? null : { product: candidate, variantId: snap.docs[0].id };
  }));
  return matches.find((match) => match !== null) ?? null;
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
  if (!Number.isSafeInteger(delta) || delta === 0) throw new Error("DELTA_INVALID");

  const productRef = doc(db, "shops", shopId, "products", productId);
  const variantRef = doc(productRef, "variants", variant.id);
  const eventRef = doc(collection(db, "shops", shopId, "stockEvents"));

  await runTransaction(db, async (tx) => {
    const variantSnap = await tx.get(variantRef);
    if (!variantSnap.exists()) throw new Error("VARIANT_NOT_FOUND");
    const productSnap = await tx.get(productRef);
    if (!productSnap.exists()) throw new Error("PRODUCT_NOT_FOUND");
    const variantQuantity = variantSnap.data().quantity ?? 0;
    const productQuantity = productSnap.data().totalQuantity ?? 0;
    if (variantQuantity + delta < 0 || productQuantity + delta < 0) throw new Error("INSUFFICIENT_STOCK");
    const next = applyStockDelta(variantQuantity, productQuantity, delta);

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
  if (lines.length === 0) throw new Error("LINES_REQUIRED");
  if (lines.length > 100) throw new Error("TOO_MANY_LINES");
  if (lines.some((line) => !Number.isSafeInteger(line.quantity) || line.quantity <= 0)) {
    throw new Error("LINE_QUANTITY_INVALID");
  }
  if (new Set(lines.map((line) => `${line.productId}/${line.variantId}`)).size !== lines.length) {
    throw new Error("DUPLICATE_VARIANT");
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

export interface SaleBuyer {
  channel: SaleChannel;
  buyerName: string;
  buyerInstagram: string;
  /** Customer this sale is attributed to, when one was picked at the till. */
  customerId?: string;
  note?: string;
}

/** Each line is decremented atomically (reason "sale"). Completed lines are
 * returned on partial failure so the UI can retain only pending lines for a
 * safe retry. The sale document is written only after every line succeeded.
 */
export async function recordSale(
  shopId: string,
  lines: SaleLine[],
  buyer: SaleBuyer,
  actorUid: string,
  actorName: string
) {
  if (lines.length === 0) throw new Error("LINES_REQUIRED");
  if (lines.length > 100) throw new Error("TOO_MANY_LINES");
  if (lines.some((line) => !Number.isSafeInteger(line.quantity) || line.quantity <= 0)) {
    throw new Error("LINE_QUANTITY_INVALID");
  }
  if (lines.some((line) => !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
    throw new Error("PRICE_INVALID");
  }
  if (new Set(lines.map((line) => `${line.productId}/${line.variantId}`)).size !== lines.length) {
    throw new Error("DUPLICATE_VARIANT");
  }
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  if (!Number.isSafeInteger(Math.round(total * 100))) throw new Error("VALUE_OUT_OF_RANGE");

  const completedLineKeys: string[] = [];
  try {
    for (const line of lines) {
      await adjustStock(
        shopId,
        line.productId,
        { id: line.variantId, label: line.variantLabel, sku: "", quantity: 0 },
        -line.quantity,
        actorUid,
        actorName,
        "sale"
      );
      completedLineKeys.push(`${line.productId}/${line.variantId}`);
    }
  } catch (error) {
    if (completedLineKeys.length > 0) throw new PartialReceiptError(completedLineKeys, { cause: error });
    throw error;
  }

  try {
    await addDoc(collection(db, "shops", shopId, "sales"), {
      lines,
      total: Math.round(total * 100) / 100,
      channel: buyer.channel,
      buyerName: buyer.buyerName.trim().slice(0, 100),
      buyerInstagram: buyer.buyerInstagram.trim().replace(/^@/, "").slice(0, 100),
      ...(buyer.customerId ? { customerId: buyer.customerId.slice(0, 100) } : {}),
      note: (buyer.note ?? "").trim().slice(0, 500),
      actorUid,
      actorName,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    throw new PartialReceiptError(completedLineKeys, { cause: error });
  }
}

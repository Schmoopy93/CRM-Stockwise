import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase-admin";
import { catalogCacheTag } from "@/lib/catalog-api";
import { channelsFromShop } from "@/lib/catalog-channels";
import { BASE_CURRENCY, isSupportedCurrency } from "@/lib/currency";
import type { CatalogField, CatalogItem, ProductCustomFieldType, ShopCatalogSettings } from "@/lib/types";

/** Server-side reads of the public catalog. They go through the Admin SDK when
 * a service account is configured and fall back to the public REST API when it
 * is not. The Admin path is what lets Firestore App Check enforcement be turned
 * on without breaking the catalog, because App Check does not apply to admin
 * credentials.
 *
 * Both paths are cached per shop under `catalogCacheTag(shopId)`, so the
 * existing on-demand invalidation covers whichever backend produced the data. */

const REVALIDATE_SECONDS = 60;
const NEW_PRODUCT_DAYS = 14;
const MAX_LIST_PAGES = 20;
const REST_PAGE_SIZE = 1000;

// ─── REST plumbing ───────────────────────────────────────────────────────────

interface FirestoreValue {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  nullValue?: null;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
  referenceValue?: string;
}

type FirestoreFields = Record<string, FirestoreValue>;

interface FirestoreDocument {
  name?: string;
  fields?: FirestoreFields;
}

interface FirestoreList {
  documents?: FirestoreDocument[];
  nextPageToken?: string;
}

function decodeFields(fields?: FirestoreFields): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([key, value]) => [key, decodeValue(value)]));
}

function decodeValue(value: FirestoreValue): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue?.fields);
  if ("referenceValue" in value) return value.referenceValue;
  return undefined;
}

async function firestoreRequest<T>(path: string, search: URLSearchParams, tags: string[]): Promise<T | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_MISSING");
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (apiKey) search.set("key", apiKey);
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}?${search}`,
    { next: { revalidate: REVALIDATE_SECONDS, tags } }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`FIRESTORE_HTTP_${response.status}`);
  return (await response.json()) as T;
}

// ─── Decoding ────────────────────────────────────────────────────────────────

function textArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function variantStock(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const stock: Record<string, number> = {};
  for (const [id, quantity] of Object.entries(value)) {
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 0) return undefined;
    stock[id] = quantity;
  }
  return stock;
}

function catalogField(value: unknown): CatalogField | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = value as Record<string, unknown>;
  const label = typeof field.label === "string" ? field.label : "";
  const type = field.type === "number" || field.type === "boolean" ? field.type : "text";
  const rawValue = field.value;
  if (typeof rawValue !== "string" && typeof rawValue !== "number" && typeof rawValue !== "boolean") return null;
  const localized = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
    const entries = Object.entries(candidate).filter(([, entry]) => typeof entry === "string");
    return entries.length > 0 ? Object.fromEntries(entries) as CatalogField["labels"] : undefined;
  };
  return {
    label,
    labels: localized(field.labels),
    type: type as ProductCustomFieldType,
    value: rawValue,
    values: localized(field.values),
  };
}

/** REST decodes timestamps to ISO strings, the Admin SDK hands back Timestamp
 * objects; both are accepted so a catalog reads the same either way. */
function createdAtMillis(value: unknown) {
  if (typeof value === "string") return Date.parse(value);
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return Number.NaN;
}

function newSinceMillis() {
  return Date.now() - NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000;
}

export function catalogItemFromData(id: string, data: Record<string, unknown>, newSince: number): CatalogItem | null {
  if (!id) return null;
  if (data.hidden === true) return null;
  const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : "";
  const images = textArray(data.images);
  const createdAt = createdAtMillis(data.createdAt);
  const variantIds = textArray(data.variantIds);
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    category: typeof data.category === "string" ? data.category : "",
    description: typeof data.description === "string" ? data.description : "",
    imageUrl,
    images: images.length > 0 ? images : imageUrl ? [imageUrl] : [],
    salePrice: finiteNumber(data.salePrice),
    compareAtPrice: finiteNumber(data.compareAtPrice),
    isNew: Number.isFinite(createdAt) && createdAt >= newSince,
    variants: textArray(data.variants),
    variantIds: variantIds.length > 0 ? variantIds : undefined,
    stockQuantity: finiteNumber(data.stockQuantity),
    variantStock: variantStock(data.variantStock),
    fields: Array.isArray(data.fields)
      ? data.fields.map(catalogField).filter((field): field is CatalogField => field !== null)
      : [],
    hidden: false,
  };
}

export function catalogShopFromData(data: Record<string, unknown>): ShopCatalogSettings {
  return {
    name: typeof data.name === "string" ? data.name : "",
    catalogEnabled: data.catalogEnabled === true,
    channels: channelsFromShop(data),
    logoUrl: typeof data.catalogLogoUrl === "string" ? data.catalogLogoUrl : "",
    coverUrl: typeof data.catalogCoverUrl === "string" ? data.catalogCoverUrl : "",
    currency: isSupportedCurrency(data.currency) ? data.currency : BASE_CURRENCY,
  };
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

async function loadShopFromRest(shopId: string): Promise<ShopCatalogSettings | null> {
  let document: FirestoreDocument | null;
  try {
    document = await firestoreRequest<FirestoreDocument>(`shops/${shopId}`, new URLSearchParams(), [catalogCacheTag(shopId)]);
  } catch (cause) {
    // Rules only expose a shop while its catalog is public, so a denied read is
    // the same answer as a missing document: there is no public catalog.
    if (cause instanceof Error && cause.message === "FIRESTORE_HTTP_403") return null;
    throw cause;
  }
  const data = decodeFields(document?.fields);
  if (!data.name && data.catalogEnabled === undefined) return null;
  return catalogShopFromData(data);
}

async function loadItemsFromRest(shopId: string): Promise<CatalogItem[]> {
  const documents: FirestoreDocument[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const search = new URLSearchParams({ pageSize: String(REST_PAGE_SIZE), orderBy: "name" });
    if (pageToken) search.set("pageToken", pageToken);
    const result = await firestoreRequest<FirestoreList>(`shops/${shopId}/catalog`, search, [catalogCacheTag(shopId)]);
    if (!result) break;
    documents.push(...(result.documents ?? []));
    const nextToken = result.nextPageToken ?? "";
    if (!nextToken || nextToken === pageToken) break;
    pageToken = nextToken;
  }
  const newSince = newSinceMillis();
  return documents.flatMap((document) => {
    const id = document.name?.split("/").pop() ?? "";
    const item = catalogItemFromData(id, decodeFields(document.fields), newSince);
    return item ? [item] : [];
  });
}

async function loadShopFromAdmin(shopId: string): Promise<ShopCatalogSettings | null> {
  const db = adminDb();
  if (!db) throw new Error("ADMIN_UNAVAILABLE");
  const snapshot = await db.collection("shops").doc(shopId).get();
  if (!snapshot.exists) return null;
  const shop = catalogShopFromData(snapshot.data() ?? {});
  // Mirror the public rules: a shop whose catalog is off is invisible to
  // anonymous readers, so its name and logo must not leak through this path.
  return shop.catalogEnabled ? shop : null;
}

async function loadItemsFromAdmin(shopId: string): Promise<CatalogItem[]> {
  const db = adminDb();
  if (!db) throw new Error("ADMIN_UNAVAILABLE");
  const snapshot = await db.collection("shops").doc(shopId).collection("catalog").orderBy("name").get();
  const newSince = newSinceMillis();
  return snapshot.docs.flatMap((doc) => {
    const item = catalogItemFromData(doc.id, doc.data(), newSince);
    return item ? [item] : [];
  });
}

export async function loadCatalogShop(shopId: string): Promise<ShopCatalogSettings | null> {
  if (!adminDb()) return loadShopFromRest(shopId);
  return unstable_cache(
    () => loadShopFromAdmin(shopId),
    ["catalog-shop", shopId],
    { tags: [catalogCacheTag(shopId)], revalidate: REVALIDATE_SECONDS }
  )();
}

export async function loadCatalogItems(shopId: string): Promise<CatalogItem[]> {
  if (!adminDb()) return loadItemsFromRest(shopId);
  return unstable_cache(
    () => loadItemsFromAdmin(shopId),
    ["catalog-items", shopId],
    { tags: [catalogCacheTag(shopId)], revalidate: REVALIDATE_SECONDS }
  )();
}

/** Uncached reads for order validation: stock and price must reflect the shop
 * at the moment the order arrives, not a 60-second-old snapshot. */
export async function loadCatalogShopForOrder(shopId: string) {
  const db = adminDb();
  if (!db) return null;
  const snapshot = await db.collection("shops").doc(shopId).get();
  return snapshot.exists ? catalogShopFromData(snapshot.data() ?? {}) : null;
}

export async function loadCatalogItemForOrder(shopId: string, productId: string) {
  const db = adminDb();
  if (!db) return null;
  const snapshot = await db.collection("shops").doc(shopId).collection("catalog").doc(productId).get();
  return snapshot.exists ? catalogItemFromData(productId, snapshot.data() ?? {}, newSinceMillis()) : null;
}

import type { NextRequest } from "next/server";
import { BASE_CURRENCY, isSupportedCurrency } from "@/lib/currency";
import { fetchExchangeRates } from "@/lib/rates";
import { channelsFromShop } from "@/lib/catalog-channels";
import { CATALOG_PAGE_SIZE, type CatalogSort } from "@/lib/catalog-filter";
import { filterCatalogItems, paginateCatalogItems, sortCatalogItems } from "@/lib/catalog-query";
import { catalogCacheTag, type CatalogPageResponse } from "@/lib/catalog-api";
import type { CatalogField, CatalogItem, ProductCustomFieldType, ShopCatalogSettings } from "@/lib/types";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const NEW_PRODUCT_DAYS = 14;
const MAX_PAGE_SIZE = 60;
const MAX_PAGE = 10_000;
const MAX_LOOKUP_IDS = 60;
const MAX_LIST_PAGES = 20;
const REVALIDATE_SECONDS = 60;

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

async function firestoreRequest<T>(path: string, search = new URLSearchParams(), tags: string[]): Promise<T | null> {
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

async function loadCatalogDocuments(shopId: string) {
  const documents: FirestoreDocument[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const search = new URLSearchParams({ pageSize: "1000", orderBy: "name" });
    if (pageToken) search.set("pageToken", pageToken);
    const result = await firestoreRequest<FirestoreList>(`shops/${shopId}/catalog`, search, [catalogCacheTag(shopId)]);
    if (!result) break;
    documents.push(...(result.documents ?? []));
    const nextToken = result.nextPageToken ?? "";
    if (!nextToken || nextToken === pageToken) break;
    pageToken = nextToken;
  }
  return documents;
}

async function loadShop(shopId: string): Promise<ShopCatalogSettings | null> {
  let document: FirestoreDocument | null;
  try {
    document = await firestoreRequest<FirestoreDocument>(`shops/${shopId}`, new URLSearchParams(), [catalogCacheTag(shopId)]);
  } catch (cause) {
    // Rules hide unknown and disabled shops from anonymous readers, so a denied
    // read is the same answer as a missing document: there is no public catalog.
    if (cause instanceof Error && cause.message === "FIRESTORE_HTTP_403") return null;
    throw cause;
  }
  const data = decodeFields(document?.fields);
  if (!data.name && data.catalogEnabled === undefined) return null;
  return {
    name: typeof data.name === "string" ? data.name : "",
    catalogEnabled: data.catalogEnabled === true,
    channels: channelsFromShop(data),
    logoUrl: typeof data.catalogLogoUrl === "string" ? data.catalogLogoUrl : "",
    coverUrl: typeof data.catalogCoverUrl === "string" ? data.catalogCoverUrl : "",
    currency: isSupportedCurrency(data.currency) ? data.currency : BASE_CURRENCY,
  };
}

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

function mapCatalogItem(document: FirestoreDocument, newSince: number): CatalogItem | null {
  const id = document.name?.split("/").pop() ?? "";
  if (!id) return null;
  const data = decodeFields(document.fields);
  if (data.hidden === true) return null;
  const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : "";
  const images = textArray(data.images);
  const createdAt = typeof data.createdAt === "string" ? Date.parse(data.createdAt) : Number.NaN;
  const variantIds = textArray(data.variantIds);
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    category: typeof data.category === "string" ? data.category : "",
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

function parseAmount(raw: string | null) {
  const normalized = (raw ?? "").trim().replace(",", ".");
  if (!normalized) return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function integer(raw: string | null, fallback: number, min: number, max: number) {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function parseSort(raw: string | null): CatalogSort {
  return raw === "priceAsc" || raw === "priceDesc" ? raw : "name";
}

function json(body: CatalogPageResponse, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      // Writes invalidate the tagged Firestore cache, so the origin is fresh on
      // the next request. The edge copy stays short-lived as well: a merchant
      // who unpublishes the catalog must not keep serving it from a CDN cache
      // for minutes if that invalidation call never arrived.
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
    },
  });
}

function emptyPage(shop: ShopCatalogSettings | null, extras: CatalogItem[] = [], catalogTotal = 0): CatalogPageResponse {
  return {
    shop,
    items: [],
    extras,
    total: 0,
    catalogTotal,
    baseTotal: 0,
    categories: [],
    hasPrices: false,
    page: 1,
    hasMore: false,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  if (!ID_PATTERN.test(shopId)) {
    return Response.json({ error: "invalid-shop" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const searchParams = request.nextUrl.searchParams;
  const lookupOnly = searchParams.get("lookup") === "1";
  const ids = Array.from(new Set(
    (searchParams.get("ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => ID_PATTERN.test(id))
  )).slice(0, MAX_LOOKUP_IDS);
  const page = integer(searchParams.get("page"), 1, 1, MAX_PAGE);
  const pageSize = integer(searchParams.get("pageSize"), CATALOG_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const search = (searchParams.get("q") ?? "").trim().slice(0, 120);
  const category = (searchParams.get("cat") ?? "all").trim().slice(0, 120) || "all";
  const sort = parseSort(searchParams.get("sort"));
  const inStockOnly = searchParams.get("stock") === "1";
  const displayMin = parseAmount(searchParams.get("min"));
  const displayMax = parseAmount(searchParams.get("max"));

  try {
    const shop = await loadShop(shopId);
    if (!shop) return json(emptyPage(null));
    if (!shop.catalogEnabled) return json(emptyPage(shop));

    const newSince = Date.now() - NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000;
    const items = (await loadCatalogDocuments(shopId))
      .map((document) => mapCatalogItem(document, newSince))
      .filter((item): item is CatalogItem => item !== null);
    const byId = new Map(items.map((item) => [item.id, item]));
    const extras = ids.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
    const hasPrices = items.some((item) => item.salePrice !== undefined);

    if (lookupOnly) {
      return json({ ...emptyPage(shop, extras, items.length), hasPrices });
    }

    let priceMin: number | undefined;
    let priceMax: number | undefined;
    if (hasPrices && (displayMin !== undefined || displayMax !== undefined)) {
      const low = displayMin !== undefined && displayMax !== undefined && displayMin > displayMax ? displayMax : displayMin;
      const high = displayMin !== undefined && displayMax !== undefined && displayMin > displayMax ? displayMin : displayMax;
      const rates = await fetchExchangeRates();
      const rate = shop.currency === BASE_CURRENCY ? 1 : rates.rates[shop.currency];
      const divisor = typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : 1;
      priceMin = low !== undefined ? low / divisor : undefined;
      priceMax = high !== undefined ? high / divisor : undefined;
    }

    const filtered = filterCatalogItems(items, {
      search,
      category,
      inStockOnly,
      priceMin,
      priceMax,
    });
    const sorted = sortCatalogItems(filtered.matched, sort);
    const paged = paginateCatalogItems(sorted, page, pageSize);

    return json({
      shop,
      items: paged.items,
      extras,
      total: sorted.length,
      catalogTotal: items.length,
      baseTotal: filtered.base.length,
      categories: filtered.categories,
      hasPrices,
      page,
      hasMore: paged.hasMore,
    });
  } catch (cause) {
    console.error("Public catalog API failed", { shopId, cause });
    return Response.json(
      { error: "catalog-unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}

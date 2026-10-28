import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { convert, isSupportedCurrency, roundForCurrency } from "@/lib/currency";
import { fetchExchangeRates } from "@/lib/rates";
import { consumeRateLimit } from "@/lib/rate-limit";
import { catalogStockForVariant } from "@/lib/catalog-query";
import { loadCatalogItemForOrder, loadCatalogShopForOrder } from "@/lib/catalog-store";
import {
  MAX_ORDER_LINES,
  MAX_ORDER_QUANTITY,
  newOrderCode,
  normalizeOrderInput,
  orderTotal,
  type OrderInput,
} from "@/lib/orders";
import type { CatalogItem, OrderLine } from "@/lib/types";

/** Order creation is the one public write, so it happens here rather than in
 * the browser: the price and stock a visitor sends are only a claim, and the
 * shop needs the order it stores to match its own catalog. The Admin SDK
 * bypasses Firestore rules, which is why `orders` no longer accepts anonymous
 * client creates. */

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IP_LIMIT = 10;
const EMAIL_LIMIT = 5;
let unavailableLogged = false;

class OrderError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

interface IncomingLine {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function clientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function readLines(value: unknown): IncomingLine[] {
  if (!Array.isArray(value) || value.length === 0) throw new OrderError("ORDER_EMPTY", 400);
  if (value.length > MAX_ORDER_LINES) throw new OrderError("ORDER_TOO_MANY_LINES", 400);
  const lines = value.map((entry): IncomingLine => {
    if (!entry || typeof entry !== "object") throw new OrderError("ORDER_LINE_INVALID", 400);
    const line = entry as Record<string, unknown>;
    const productId = typeof line.productId === "string" ? line.productId.trim() : "";
    const variantId = typeof line.variantId === "string" ? line.variantId.trim() : undefined;
    if (!ID_PATTERN.test(productId)) throw new OrderError("ORDER_LINE_INVALID", 400);
    if (variantId !== undefined && !ID_PATTERN.test(variantId)) throw new OrderError("ORDER_LINE_INVALID", 400);
    if (typeof line.quantity !== "number" || !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 || line.quantity > MAX_ORDER_QUANTITY) {
      throw new OrderError("ORDER_QUANTITY_INVALID", 400);
    }
    if (typeof line.unitPrice !== "number" || !Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      throw new OrderError("ORDER_PRICE_REQUIRED", 400);
    }
    return { productId, ...(variantId ? { variantId } : {}), quantity: line.quantity, unitPrice: line.unitPrice };
  });
  if (new Set(lines.map((line) => `${line.productId}/${line.variantId ?? ""}`)).size !== lines.length) {
    throw new OrderError("ORDER_LINE_INVALID", 400);
  }
  return lines;
}

/** Rates are republished daily and the cart is formed against a cached copy, so
 * a small drift is expected. Anything larger means the customer saw an older
 * price than the shop now charges. */
function priceMatches(quoted: number, expected: number) {
  return Math.abs(quoted - expected) <= Math.max(0.01, expected * 0.005);
}

async function resolveLine(
  shopId: string,
  currency: string,
  rates: Awaited<ReturnType<typeof fetchExchangeRates>>,
  line: IncomingLine,
  cache: Map<string, CatalogItem | null>
) {
  if (!cache.has(line.productId)) cache.set(line.productId, await loadCatalogItemForOrder(shopId, line.productId));
  const item = cache.get(line.productId) ?? null;
  if (!item) throw new OrderError("ORDER_VARIANT_NOT_FOUND", 409);
  if (item.salePrice === undefined) throw new OrderError("ORDER_PRICE_REQUIRED", 409);
  const expected = convert(item.salePrice, currency, rates);
  if (!priceMatches(line.unitPrice, expected)) throw new OrderError("ORDER_PRICE_CHANGED", 409);

  let variantLabel = "";
  if (item.variants.length > 0) {
    const index = line.variantId ? item.variantIds?.indexOf(line.variantId) ?? -1 : -1;
    if (index < 0) throw new OrderError("ORDER_VARIANT_NOT_FOUND", 409);
    variantLabel = item.variants[index] ?? "";
    if (catalogStockForVariant(item, index) < line.quantity) throw new OrderError("ORDER_STOCK_INSUFFICIENT", 409);
  } else {
    if (line.variantId) throw new OrderError("ORDER_VARIANT_NOT_FOUND", 409);
    if ((item.stockQuantity ?? 0) < line.quantity) throw new OrderError("ORDER_STOCK_INSUFFICIENT", 409);
  }

  return {
    productId: item.id,
    ...(line.variantId ? { variantId: line.variantId } : {}),
    productName: item.name,
    variantLabel,
    quantity: line.quantity,
    unitPrice: expected,
    baseUnitPrice: item.salePrice,
  } satisfies OrderLine;
}

async function orderDocId(shopId: string, key: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`order:${shopId}:${key}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function alreadyExists(cause: unknown) {
  return typeof cause === "object" && cause !== null && (cause as { code?: unknown }).code === 6;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  if (!ID_PATTERN.test(shopId)) return json({ error: "ORDER_INVALID" }, 400);

  const db = adminDb();
  if (!db) {
    if (!unavailableLogged) {
      unavailableLogged = true;
      console.error("Order API needs Firebase Admin credentials: set FIREBASE_SERVICE_ACCOUNT (one-line JSON or base64) or FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.");
    }
    return json({ error: "ORDER_UNAVAILABLE" }, 503);
  }

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw new OrderError("ORDER_INVALID", 400);

    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) throw new OrderError("ORDER_INVALID", 400);

    const lines = readLines(body.lines);
    const customerEmail = typeof body.customerEmail === "string" ? body.customerEmail.trim().toLowerCase() : "";
    if (!EMAIL_PATTERN.test(customerEmail)) throw new OrderError("ORDER_EMAIL_INVALID", 400);

    if (!await consumeRateLimit(`catalog-order:ip:${clientIp(request)}`, IP_LIMIT) ||
      !await consumeRateLimit(`catalog-order:email:${customerEmail}`, EMAIL_LIMIT)) {
      return json({ error: "ORDER_RATE_LIMITED" }, 429);
    }

    const shop = await loadCatalogShopForOrder(shopId);
    if (!shop || !shop.catalogEnabled) throw new OrderError("CATALOG_DISABLED", 410);
    if (body.currency !== undefined && body.currency !== shop.currency) {
      throw new OrderError("ORDER_PRICE_CHANGED", 409);
    }
    const currency = isSupportedCurrency(shop.currency) ? shop.currency : "EUR";

    const rates = await fetchExchangeRates();
    const cache = new Map<string, CatalogItem | null>();
    const resolved: OrderLine[] = [];
    for (const line of lines) {
      resolved.push(await resolveLine(shopId, currency, rates, line, cache));
    }

    const order: OrderInput = normalizeOrderInput({
      lines: resolved,
      customerName: typeof body.customerName === "string" ? body.customerName : "",
      customerContact: typeof body.customerContact === "string" ? body.customerContact : "",
      customerEmail,
      customerAddress: typeof body.customerAddress === "string" ? body.customerAddress : "",
      customerCity: typeof body.customerCity === "string" ? body.customerCity : "",
      note: typeof body.note === "string" ? body.note : "",
      channel: "catalog",
    });

    const total = roundForCurrency(orderTotal(order.lines), currency);
    if (!Number.isFinite(total) || total > 100_000_000) throw new OrderError("VALUE_OUT_OF_RANGE", 400);

    const ref = db.collection("shops").doc(shopId).collection("orders").doc(await orderDocId(shopId, idempotencyKey));
    const existing = await ref.get();
    if (existing.exists) {
      const data = existing.data() ?? {};
      if (data.customerEmail !== order.customerEmail) throw new OrderError("ORDER_INVALID", 409);
      return json({ code: data.code, total: data.total, currency: data.currency });
    }

    const code = newOrderCode();
    const record = {
      code,
      lines: order.lines,
      total,
      currency,
      customerName: order.customerName,
      customerContact: order.customerContact,
      customerEmail: order.customerEmail,
      customerAddress: order.customerAddress,
      customerCity: order.customerCity,
      note: order.note,
      channel: order.channel,
      status: "new",
      createdAt: FieldValue.serverTimestamp(),
    };

    try {
      await ref.create(record);
    } catch (cause) {
      // A retry that raced the first request: the stored order is the answer.
      if (!alreadyExists(cause)) throw cause;
      const snapshot = await ref.get();
      const data = snapshot.data() ?? {};
      return json({ code: data.code, total: data.total, currency: data.currency });
    }

    const day = new Date().toISOString().slice(0, 10);
    await db.collection("shops").doc(shopId).collection("catalogStats").doc(day)
      .set({ orders: FieldValue.increment(1) }, { merge: true })
      .catch((cause) => console.error("Catalog order stat failed", { shopId, cause }));

    return json({ code, total, currency }, 201);
  } catch (cause) {
    if (cause instanceof OrderError) return json({ error: cause.code }, cause.status);
    if (cause instanceof Error && cause.message.startsWith("ORDER_")) return json({ error: cause.message }, 400);
    if (cause instanceof Error && cause.message === "VALUE_OUT_OF_RANGE") return json({ error: cause.message }, 400);
    console.error("Catalog order failed", { shopId, cause });
    return json({ error: "ORDER_FAILED" }, 502);
  }
}

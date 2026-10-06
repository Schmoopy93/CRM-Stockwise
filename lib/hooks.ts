"use client";

import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  documentId,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Product, ProductVariant, Sale, ShopCatalogSettings, StockEvent, Customer } from "@/lib/types";
import { CatalogItem, CatalogOrder, CatalogStatsDay } from "@/lib/types";
import { channelsFromShop, EMPTY_CHANNELS } from "@/lib/catalog-channels";
import {
  BASE_CURRENCY,
  convert,
  EMPTY_RATES,
  formatMoney,
  isSupportedCurrency,
  type ExchangeRates,
  type MoneyFormatOptions,
  type PriceTools,
} from "@/lib/currency";

/** One shared request for the whole tab. The route handler already caches, so
 * this only avoids duplicate round-trips when several components mount at once. */
let ratesRequest: Promise<ExchangeRates> | null = null;

function fetchExchangeRates(): Promise<ExchangeRates> {
  ratesRequest ??= fetch("/api/rates")
    .then((response) => (response.ok ? response.json() : EMPTY_RATES))
    .catch(() => EMPTY_RATES) as Promise<ExchangeRates>;
  return ratesRequest;
}

/** Starts at the base currency on both server and client so the first render
 * matches, then settles once the day's rates arrive. */
export function useExchangeRates() {
  const [rates, setRates] = useState<ExchangeRates>(EMPTY_RATES);

  useEffect(() => {
    let cancelled = false;
    fetchExchangeRates().then((result) => { if (!cancelled) setRates(result); });
    return () => { cancelled = true; };
  }, []);

  return rates;
}

/** The shop's chosen display currency plus formatters for it.
 *
 * `money` converts a stored base-currency amount and formats it, so a call site
 * reads one value from the database and prints it in whatever the shop trades
 * in. `toCurrency` does the conversion alone, for places that need the number
 * rather than a string — writing it onto a catalog order, for instance. */
export function useShopMoney(shopId: string | undefined, intlLocale: string): PriceTools {
  const [currency, setCurrency] = useState(BASE_CURRENCY);
  const rates = useExchangeRates();

  useEffect(() => {
    if (!shopId) return;
    const unsub = onSnapshot(
      doc(db, "shops", shopId),
      (snap) => {
        const value = snap.data()?.currency;
        setCurrency(isSupportedCurrency(value) ? value : BASE_CURRENCY);
      },
      () => setCurrency(BASE_CURRENCY)
    );
    return unsub;
  }, [shopId]);

  const toCurrency = useCallback((amount: number) => convert(amount, currency, rates), [currency, rates]);
  const money = useCallback(
    (amount: number, options?: MoneyFormatOptions) => formatMoney(toCurrency(amount), intlLocale, currency, options),
    [intlLocale, currency, toCurrency]
  );

  return { currency, money, toCurrency };
}

export function useShop(shopId: string | undefined): ShopCatalogSettings & { loading: boolean } {
  const [shop, setShop] = useState<ShopCatalogSettings>({ name: "", catalogEnabled: false, channels: EMPTY_CHANNELS, logoUrl: "", coverUrl: "", currency: BASE_CURRENCY });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopId) return;
    const unsub = onSnapshot(doc(db, "shops", shopId), (snap) => {
      const data = snap.data();
      const currency = data?.currency;
      setShop({
        name: data?.name ?? "",
        catalogEnabled: data?.catalogEnabled === true,
        channels: channelsFromShop(data),
        logoUrl: data?.catalogLogoUrl ?? "",
        coverUrl: data?.catalogCoverUrl ?? "",
        currency: isSupportedCurrency(currency) ? currency : BASE_CURRENCY,
      });
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [shopId]);

  return { ...shop, loading };
}

const NEW_PRODUCT_DAYS = 14;

function readCatalogVariantStock(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const stock: Record<string, number> = {};
  for (const [id, quantity] of Object.entries(value)) {
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 0) return undefined;
    stock[id] = quantity;
  }
  return stock;
}

export function useCatalog(shopId: string | undefined) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!shopId) return;
    const q = query(collection(db, "shops", shopId, "catalog"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) => {
      const newSince = Date.now() - NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000;
      setItems(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name ?? "",
          category: d.data().category ?? "",
          imageUrl: d.data().imageUrl ?? "",
          images: Array.isArray(d.data().images) && d.data().images.length > 0 ? d.data().images : (d.data().imageUrl ? [d.data().imageUrl] : []),
          salePrice: typeof d.data().salePrice === "number" ? d.data().salePrice : undefined,
          compareAtPrice: typeof d.data().compareAtPrice === "number" ? d.data().compareAtPrice : undefined,
          isNew: (d.data().createdAt?.toMillis?.() ?? 0) >= newSince,
          variants: Array.isArray(d.data().variants) ? d.data().variants : [],
          variantIds: Array.isArray(d.data().variantIds) ? d.data().variantIds : undefined,
          stockQuantity: typeof d.data().stockQuantity === "number" ? d.data().stockQuantity : undefined,
          variantStock: readCatalogVariantStock(d.data().variantStock),
          fields: Array.isArray(d.data().fields) ? d.data().fields : [],
          hidden: d.data().hidden === true,
        }))
      );
      setError(false);
      setLoading(false);
    }, (snapshotError) => {
      console.error("Failed to load public catalog", snapshotError);
      setError(true);
      setLoading(false);
    });
    return unsub;
  }, [shopId]);

  return { items, loading, error };
}

export function useProducts(shopId: string | undefined) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopId) return;
    const q = query(
      collection(db, "shops", shopId, "products"),
      orderBy("name")
    );
    const unsub = onSnapshot(q, (snap) => {
      setProducts(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name ?? "",
          sku: d.data().sku ?? "",
          category: d.data().category ?? "",
          imageUrl: d.data().imageUrl ?? "",
          images: Array.isArray(d.data().images) && d.data().images.length > 0 ? d.data().images : (d.data().imageUrl ? [d.data().imageUrl] : []),
          minStock: d.data().minStock ?? 0,
          totalQuantity: d.data().totalQuantity ?? 0,
          costPrice: d.data().costPrice ?? undefined,
          salePrice: d.data().salePrice ?? undefined,
          compareAtPrice: d.data().compareAtPrice ?? undefined,
          supplier: d.data().supplier ?? undefined,
          customFieldDefinitions: d.data().customFieldDefinitions ?? [],
          customFieldValues: d.data().customFieldValues ?? {},
          catalogHidden: d.data().catalogHidden === true,
        }))
      );
      setLoading(false);
    });
    return unsub;
  }, [shopId]);

  return { products, loading };
}

export function useProduct(shopId: string | undefined, productId: string | undefined) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopId || !productId) return;
    const unsub = onSnapshot(
      doc(db, "shops", shopId, "products", productId),
      (snap) => {
        if (snap.exists()) {
          setProduct({
            id: snap.id,
            name: snap.data().name ?? "",
            sku: snap.data().sku ?? "",
            category: snap.data().category ?? "",
            imageUrl: snap.data().imageUrl ?? "",
            images: Array.isArray(snap.data().images) && snap.data().images.length > 0 ? snap.data().images : (snap.data().imageUrl ? [snap.data().imageUrl] : []),
            minStock: snap.data().minStock ?? 0,
            totalQuantity: snap.data().totalQuantity ?? 0,
            costPrice: snap.data().costPrice ?? undefined,
            salePrice: snap.data().salePrice ?? undefined,
            compareAtPrice: snap.data().compareAtPrice ?? undefined,
            supplier: snap.data().supplier ?? undefined,
            customFieldDefinitions: snap.data().customFieldDefinitions ?? [],
            customFieldValues: snap.data().customFieldValues ?? {},
            catalogHidden: snap.data().catalogHidden === true,
          });
        } else {
          setProduct(null);
        }
        setLoading(false);
      }
    );
    return unsub;
  }, [shopId, productId]);

  return { product, loading };
}

export function useVariants(shopId: string | undefined, productId: string | undefined) {
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  useEffect(() => {
    if (!shopId || !productId) return;
    const q = query(
      collection(db, "shops", shopId, "products", productId, "variants"),
      orderBy("label")
    );
    const unsub = onSnapshot(q, (snap) => {
      setVariants(
        snap.docs.map((d) => ({
          id: d.id,
          label: d.data().label ?? "",
          sku: d.data().sku ?? "",
          quantity: d.data().quantity ?? 0,
        }))
      );
    });
    return unsub;
  }, [shopId, productId]);

  return variants;
}

export function useAllStockEvents(shopId: string | undefined, days = 30) {
  const [events, setEvents] = useState<StockEvent[]>([]);

  useEffect(() => {
    if (!shopId) return;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const q = query(
      collection(db, "shops", shopId, "stockEvents"),
      where("createdAt", ">=", since),
      orderBy("createdAt", "desc"),
      limit(500)
    );
    const unsub = onSnapshot(q, (snap) => {
      setEvents(
        snap.docs.map((d) => ({
          id: d.id,
          productId: d.data().productId ?? "",
          variantId: d.data().variantId ?? "",
          variantLabel: d.data().variantLabel ?? "",
          delta: d.data().delta ?? 0,
          reason: d.data().reason ?? "adjustment",
          actorUid: d.data().actorUid ?? "",
          actorName: d.data().actorName ?? "",
          createdAt: d.data().createdAt?.toDate() ?? null,
        }))
      );
    });
    return unsub;
  }, [shopId, days]);

  return events;
}

export function useStockEventsInRange(shopId: string | undefined, from: Date, to: Date) {
  const [events, setEvents] = useState<StockEvent[]>([]);
  const [loadedRange, setLoadedRange] = useState("");
  const [queryError, setQueryError] = useState<{ range: string; error: Error } | null>(null);
  const rangeKey = `${shopId ?? ""}:${from.getTime()}:${to.getTime()}`;

  useEffect(() => {
    if (!shopId) return;
    const q = query(
      collection(db, "shops", shopId, "stockEvents"),
      where("createdAt", ">=", from),
      where("createdAt", "<=", to),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map((d) => ({
        id: d.id,
        productId: d.data().productId ?? "",
        variantId: d.data().variantId ?? "",
        variantLabel: d.data().variantLabel ?? "",
        delta: d.data().delta ?? 0,
        reason: d.data().reason ?? "adjustment",
        actorUid: d.data().actorUid ?? "",
        actorName: d.data().actorName ?? "",
        createdAt: d.data().createdAt?.toDate() ?? null,
      })));
      setLoadedRange(rangeKey);
      setQueryError(null);
    }, (cause) => {
      setLoadedRange(rangeKey);
      setQueryError({ range: rangeKey, error: cause });
    });
    return unsub;
  }, [shopId, from, to, rangeKey]);

  return {
    events: loadedRange === rangeKey ? events : [],
    loading: loadedRange !== rangeKey,
    error: queryError?.range === rangeKey ? queryError.error : null,
  };
}

export function useCatalogStats(shopId: string | undefined, days = 30) {
  const [stats, setStats] = useState<CatalogStatsDay[]>([]);

  useEffect(() => {
    if (!shopId) return;
    const q = query(collection(db, "shops", shopId, "catalogStats"), orderBy(documentId(), "desc"), limit(days));
    const unsub = onSnapshot(q, (snap) => {
      setStats(
        snap.docs.map((d) => ({
          day: d.id,
          views: d.data().views ?? 0,
          whatsapp: d.data().whatsapp ?? 0,
          telegram: d.data().telegram ?? 0,
          instagram: d.data().instagram ?? 0,
          share: d.data().share ?? 0,
          orders: d.data().orders ?? 0,
        }))
      );
    }, () => setStats([]));
    return unsub;
  }, [shopId, days]);

  return stats;
}

export function useSales(shopId: string | undefined, count = 20) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopId) return;
    const q = query(
      collection(db, "shops", shopId, "sales"),
      orderBy("createdAt", "desc"),
      limit(count)
    );
    const unsub = onSnapshot(q, (snap) => {
      setSales(
        snap.docs.map((d) => ({
          id: d.id,
          lines: d.data().lines ?? [],
          total: d.data().total ?? 0,
          channel: d.data().channel ?? "other",
          buyerName: d.data().buyerName ?? "",
          buyerContact: d.data().buyerContact ?? d.data().buyerInstagram ?? "",
          sourceOrderId: d.data().sourceOrderId ?? "",
          sourceOrderCode: d.data().sourceOrderCode ?? "",
          customerId: d.data().customerId ?? "",
          note: d.data().note ?? "",
          actorUid: d.data().actorUid ?? "",
          actorName: d.data().actorName ?? "",
          createdAt: d.data().createdAt?.toDate() ?? null,
        }))
      );
      setLoading(false);
    });
    return unsub;
  }, [shopId, count]);

  return { sales, loading };
}

export function useOrders(shopId: string | undefined, count = 100) {
  const [orders, setOrders] = useState<CatalogOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!shopId) return;
    const q = query(
      collection(db, "shops", shopId, "orders"),
      orderBy("createdAt", "desc"),
      limit(count)
    );
    const unsub = onSnapshot(q, (snap) => {
      setOrders(
        snap.docs.map((d) => ({
          id: d.id,
          code: d.data().code ?? "",
          lines: Array.isArray(d.data().lines) ? d.data().lines : [],
          total: d.data().total ?? 0,
          currency: isSupportedCurrency(d.data().currency) ? d.data().currency : undefined,
          customerName: d.data().customerName ?? "",
          customerContact: d.data().customerContact ?? "",
          customerEmail: d.data().customerEmail ?? "",
          customerAddress: d.data().customerAddress ?? "",
          customerCity: d.data().customerCity ?? "",
          customerId: d.data().customerId ?? "",
          note: d.data().note ?? "",
          channel: d.data().channel ?? "other",
          status: d.data().status ?? "new",
          createdAt: d.data().createdAt?.toDate() ?? null,
        }))
      );
      setError(null);
      setLoading(false);
    }, (cause) => {
      setError(cause);
      setLoading(false);
    });
    return unsub;
  }, [shopId, count]);

  return { orders, loading, error };
}

export function useStockEvents(shopId: string | undefined, productId: string | undefined) {
  const [events, setEvents] = useState<StockEvent[]>([]);

  useEffect(() => {
    if (!shopId || !productId) return;
    const q = query(
      collection(db, "shops", shopId, "stockEvents"),
      where("productId", "==", productId),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      setEvents(
        snap.docs.map((d) => ({
          id: d.id,
          productId: d.data().productId ?? "",
          variantId: d.data().variantId ?? "",
          variantLabel: d.data().variantLabel ?? "",
          delta: d.data().delta ?? 0,
          reason: d.data().reason ?? "adjustment",
          actorUid: d.data().actorUid ?? "",
          actorName: d.data().actorName ?? "",
          createdAt: d.data().createdAt?.toDate() ?? null,
        }))
      );
    });
    return unsub;
  }, [shopId, productId]);

  return events;
}

// ─── Customers ───────────────────────────────────────────────────────────────

/** One mapper for the customer shape, shared by the list and the single-record
 * read so a field added here shows up in both at once. */
function toCustomer(id: string, data: Record<string, unknown>): Customer {
  return {
    id,
    name: (data.name as string) ?? "",
    contact: (data.contact as string) ?? "",
    email: (data.email as string) ?? "",
    note: (data.note as string) ?? "",
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    createdAt: (data.createdAt as Timestamp | undefined)?.toDate() ?? null,
    updatedAt: (data.updatedAt as Timestamp | undefined)?.toDate() ?? null,
  };
}

export function useCustomers(shopId: string | undefined) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopId) return;
    const q = query(collection(db, "shops", shopId, "customers"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) => {
      setCustomers(snap.docs.map((d) => toCustomer(d.id, d.data())));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [shopId]);

  return { customers, loading };
}

export function useCustomer(shopId: string | undefined, customerId: string | undefined) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopId || !customerId) return;
    const unsub = onSnapshot(doc(db, "shops", shopId, "customers", customerId), (snap) => {
      setCustomer(snap.exists() ? toCustomer(snap.id, snap.data()) : null);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [shopId, customerId]);

  return { customer, loading };
}

export interface CustomerActivity {
  sales: Sale[];
  orders: CatalogOrder[];
  loading: boolean;
}

/** Everything a customer actually did, by id rather than by name.
 *
 * The buyer name on a sale is a copy of what was typed at the till, so matching
 * on it would silently merge two people called Ana and miss anyone whose name
 * was misspelled. Only sales and orders that carry the id are returned, which
 * means history starts accruing from the moment a sale is attributed. */
export function useCustomerActivity(shopId: string | undefined, customerId: string | undefined): CustomerActivity {
  const [sales, setSales] = useState<Sale[]>([]);
  const [orders, setOrders] = useState<CatalogOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopId || !customerId) return;
    const salesQuery = query(
      collection(db, "shops", shopId, "sales"),
      where("customerId", "==", customerId),
      orderBy("createdAt", "desc")
    );
    const ordersQuery = query(
      collection(db, "shops", shopId, "orders"),
      where("customerId", "==", customerId),
      orderBy("createdAt", "desc")
    );
    const unsubSales = onSnapshot(salesQuery, (snap) => {
      setSales(snap.docs.map((d) => ({
        id: d.id,
        lines: d.data().lines ?? [],
        total: d.data().total ?? 0,
        channel: d.data().channel ?? "other",
        buyerName: d.data().buyerName ?? "",
        buyerContact: d.data().buyerContact ?? d.data().buyerInstagram ?? "",
        sourceOrderId: d.data().sourceOrderId ?? "",
        sourceOrderCode: d.data().sourceOrderCode ?? "",
        customerId: d.data().customerId ?? "",
        note: d.data().note ?? "",
        actorUid: d.data().actorUid ?? "",
        actorName: d.data().actorName ?? "",
        createdAt: d.data().createdAt?.toDate() ?? null,
      })));
    }, () => setSales([]));
    const unsubOrders = onSnapshot(ordersQuery, (snap) => {
      setOrders(snap.docs.map((d) => ({
        id: d.id,
        code: d.data().code ?? "",
        lines: Array.isArray(d.data().lines) ? d.data().lines : [],
        total: d.data().total ?? 0,
        currency: isSupportedCurrency(d.data().currency) ? d.data().currency : undefined,
        customerName: d.data().customerName ?? "",
        customerContact: d.data().customerContact ?? "",
        customerEmail: d.data().customerEmail ?? "",
        customerAddress: d.data().customerAddress ?? "",
        customerCity: d.data().customerCity ?? "",
        customerId: d.data().customerId ?? "",
        note: d.data().note ?? "",
        channel: d.data().channel ?? "other",
        status: d.data().status ?? "new",
        fulfilledLineIndices: Array.isArray(d.data().fulfilledLineIndices) ? d.data().fulfilledLineIndices : [],
        saleId: d.data().saleId ?? "",
        createdAt: d.data().createdAt?.toDate() ?? null,
      })));
    }, () => setOrders([]));
    const timer = setTimeout(() => setLoading(false), 0);
    return () => { clearTimeout(timer); unsubSales(); unsubOrders(); };
  }, [shopId, customerId]);

  return { sales, orders, loading };
}

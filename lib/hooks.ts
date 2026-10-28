"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Product, ProductVariant, Sale, ShopCatalogSettings, StockEvent, Customer } from "@/lib/types";
import { CatalogItem, CatalogOrder, CatalogStatsDay, ShopConversation } from "@/lib/types";
import { channelsFromShop, EMPTY_CHANNELS } from "@/lib/catalog-channels";
import type { CatalogSort } from "@/lib/catalog-filter";
import type { CatalogPageResponse } from "@/lib/catalog-api";
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
export function usePriceTools(currency: string, intlLocale: string): PriceTools {
  const rates = useExchangeRates();
  const toCurrency = useCallback((amount: number) => convert(amount, currency, rates), [currency, rates]);
  const money = useCallback(
    (amount: number, options?: MoneyFormatOptions) => formatMoney(toCurrency(amount), intlLocale, currency, options),
    [intlLocale, currency, toCurrency]
  );
  return { currency, money, toCurrency };
}

export function useShopMoney(shopId: string | undefined, intlLocale: string): PriceTools {
  const [currency, setCurrency] = useState(BASE_CURRENCY);

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

  return usePriceTools(currency, intlLocale);
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

export interface CatalogQueryParams {
  search?: string;
  category?: string;
  sort?: CatalogSort;
  inStockOnly?: boolean;
  minPrice?: string;
  maxPrice?: string;
}

interface CatalogState {
  /** Request key the data below belongs to; "" until the first page settles. */
  key: string;
  shop: ShopCatalogSettings | null;
  items: CatalogItem[];
  total: number;
  catalogTotal: number;
  baseTotal: number;
  categories: Array<[string, number]>;
  hasPrices: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  error: boolean;
}

const EMPTY_CATALOG_STATE: CatalogState = {
  key: "",
  shop: null,
  items: [],
  total: 0,
  catalogTotal: 0,
  baseTotal: 0,
  categories: [],
  hasPrices: false,
  hasMore: false,
  loadingMore: false,
  error: false,
};

function catalogApiUrl(shopId: string, params: CatalogQueryParams, page: number, pageSize: number) {
  const url = new URL(`/api/catalog/${encodeURIComponent(shopId)}`, window.location.origin);
  const search = params.search?.trim() ?? "";
  const category = params.category ?? "all";
  const sort = params.sort ?? "name";
  if (search) url.searchParams.set("q", search);
  if (category !== "all") url.searchParams.set("cat", category);
  if (sort !== "name") url.searchParams.set("sort", sort);
  if (params.inStockOnly) url.searchParams.set("stock", "1");
  const min = params.minPrice?.trim() ?? "";
  const max = params.maxPrice?.trim() ?? "";
  if (min) url.searchParams.set("min", min);
  if (max) url.searchParams.set("max", max);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));
  return url;
}

/** One cached page of the public catalog. The route handler reads Firestore at
 * most once per minute and does search, filtering and paging on that snapshot,
 * so a visit costs a small JSON payload instead of the whole collection. */
export function useCatalog(
  shopId: string | undefined,
  params: CatalogQueryParams,
  pageSize: number,
  enabled = true
) {
  const [state, setState] = useState<CatalogState>(EMPTY_CATALOG_STATE);
  const pageRef = useRef(0);
  const keyRef = useRef("");
  const loadController = useRef<AbortController | null>(null);
  const key = useMemo(
    () => JSON.stringify([
      params.search?.trim() ?? "",
      params.category ?? "all",
      params.sort ?? "name",
      params.inStockOnly === true,
      params.minPrice?.trim() ?? "",
      params.maxPrice?.trim() ?? "",
      pageSize,
    ]),
    [params.search, params.category, params.sort, params.inStockOnly, params.minPrice, params.maxPrice, pageSize]
  );

  useEffect(() => {
    if (!shopId || !enabled) return;
    keyRef.current = key;
    pageRef.current = 0;
    loadController.current?.abort();
    const controller = new AbortController();

    fetch(catalogApiUrl(shopId, params, 1, pageSize), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`CATALOG_HTTP_${response.status}`);
        return response.json() as Promise<CatalogPageResponse>;
      })
      .then((data) => {
        if (controller.signal.aborted || keyRef.current !== key) return;
        pageRef.current = 1;
        setState({
          key,
          shop: data.shop,
          items: data.items,
          total: data.total,
          catalogTotal: data.catalogTotal,
          baseTotal: data.baseTotal,
          categories: data.categories,
          hasPrices: data.hasPrices,
          hasMore: data.hasMore,
          loadingMore: false,
          error: false,
        });
      })
      .catch((cause) => {
        if (controller.signal.aborted || keyRef.current !== key) return;
        console.error("Failed to load public catalog", cause);
        setState((previous) => ({ ...previous, key, loadingMore: false, error: true }));
      });

    return () => {
      controller.abort();
      loadController.current?.abort();
    };
    // `params` is represented by `key`; using the object itself would restart
    // the request on every render even when no filter changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, key, enabled, pageSize]);

  const loading = !enabled || state.key !== key;

  const loadMore = useCallback(() => {
    if (!shopId || !enabled || loading || state.loadingMore || !state.hasMore) return;
    const keyAtStart = key;
    const nextPage = pageRef.current + 1;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setState((previous) => ({ ...previous, loadingMore: true }));

    fetch(catalogApiUrl(shopId, params, nextPage, pageSize), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`CATALOG_HTTP_${response.status}`);
        return response.json() as Promise<CatalogPageResponse>;
      })
      .then((data) => {
        if (controller.signal.aborted || keyRef.current !== keyAtStart) return;
        pageRef.current = nextPage;
        setState((previous) => {
          const seen = new Set(previous.items.map((item) => item.id));
          return {
            ...previous,
            items: [...previous.items, ...data.items.filter((item) => !seen.has(item.id))],
            total: data.total,
            catalogTotal: data.catalogTotal,
            baseTotal: data.baseTotal,
            categories: data.categories,
            hasPrices: data.hasPrices,
            hasMore: data.hasMore,
            loadingMore: false,
          };
        });
      })
      .catch((cause) => {
        if (controller.signal.aborted || keyRef.current !== keyAtStart) return;
        console.error("Failed to load the next catalog page", cause);
        setState((previous) => ({ ...previous, loadingMore: false }));
      });
  }, [shopId, enabled, loading, key, state.loadingMore, state.hasMore, params, pageSize]);

  return { ...state, loading, error: state.error && state.key === key, loadMore };
}

/** Resolves products that are not on the current catalog page: an item opened
 * from a shared link, or a cart saved before this visit. */
export function useCatalogLookup(shopId: string | undefined, ids: string[]) {
  const knownRef = useRef(new Map<string, CatalogItem>());
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [resolvedKey, setResolvedKey] = useState("");
  const idsKey = Array.from(new Set(ids.filter(Boolean))).sort().join(",");
  const knownIds = new Set(items.map((item) => item.id));
  const missingCount = shopId && idsKey
    ? idsKey.split(",").filter((id) => !knownIds.has(id)).length
    : 0;
  const loading = missingCount > 0 && resolvedKey !== idsKey;

  useEffect(() => {
    if (!shopId || !idsKey) return;
    const missingIds = idsKey.split(",").filter((id) => !knownRef.current.has(id));
    if (missingIds.length === 0) return;
    const controller = new AbortController();

    const chunks: string[][] = [];
    for (let index = 0; index < missingIds.length; index += 60) chunks.push(missingIds.slice(index, index + 60));
    Promise.all(chunks.map(async (chunk) => {
      const url = new URL(`/api/catalog/${encodeURIComponent(shopId)}`, window.location.origin);
      url.searchParams.set("lookup", "1");
      url.searchParams.set("ids", chunk.join(","));
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return [];
        return ((await response.json()) as CatalogPageResponse).extras;
      } catch {
        return [];
      }
    }))
      .then((groups) => {
        if (controller.signal.aborted) return;
        for (const group of groups) for (const item of group) knownRef.current.set(item.id, item);
        setItems(Array.from(knownRef.current.values()));
      })
      .finally(() => {
        if (!controller.signal.aborted) setResolvedKey(idsKey);
      });

    return () => controller.abort();
  }, [shopId, idsKey]);

  return { items, loading };
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
  const [loadedShopId, setLoadedShopId] = useState<string | null>(null);
  const [failedShopId, setFailedShopId] = useState<string | null>(null);

  useEffect(() => {
    if (!shopId) return;
    const today = new Date();
    const firstDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1)))
      .toISOString()
      .slice(0, 10);
    const q = query(
      collection(db, "shops", shopId, "catalogStats"),
      where(documentId(), ">=", firstDay),
      orderBy(documentId()),
      limit(days)
    );
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
      setLoadedShopId(shopId);
      setFailedShopId(null);
    }, () => {
      setStats([]);
      setLoadedShopId(shopId);
      setFailedShopId(shopId);
    });
    return unsub;
  }, [shopId, days]);

  return {
    stats: shopId && loadedShopId === shopId ? stats : [],
    loading: Boolean(shopId) && loadedShopId !== shopId,
    error: Boolean(shopId) && failedShopId === shopId,
  };
}

function mapSale(id: string, d: DocumentData): Sale {
  return {
    id,
    lines: d.lines ?? [],
    total: d.total ?? 0,
    channel: d.channel ?? "other",
    buyerName: d.buyerName ?? "",
    buyerContact: d.buyerContact ?? d.buyerInstagram ?? "",
    sourceOrderId: d.sourceOrderId ?? "",
    sourceOrderCode: d.sourceOrderCode ?? "",
    stornoOf: d.stornoOf ?? "",
    customerId: d.customerId ?? "",
    note: d.note ?? "",
    actorUid: d.actorUid ?? "",
    actorName: d.actorName ?? "",
    createdAt: d.createdAt?.toDate() ?? null,
  };
}

/** Latest sales, newest first. Each `loadMore` widens the server window by
 * `pageSize`; `hasMore` stays true while the window is full, which is the only
 * signal Firestore gives that older sales wait beyond it. */
export function useSales(shopId: string | undefined, pageSize = 20) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [count, setCount] = useState(pageSize);

  useEffect(() => {
    if (!shopId) return;
    const q = query(
      collection(db, "shops", shopId, "sales"),
      orderBy("createdAt", "desc"),
      limit(count)
    );
    const unsub = onSnapshot(q, (snap) => {
      setSales(snap.docs.map((d) => mapSale(d.id, d.data())));
      setHasMore(snap.size >= count);
      setLoading(false);
    });
    return unsub;
  }, [shopId, count]);

  const loadMore = useCallback(() => setCount((current) => current + pageSize), [pageSize]);

  return { sales, loading, hasMore, loadMore };
}

/** Analytics cannot work from a capped "latest N" window — an old sale inside
 * the selected range must be in the figures no matter how many newer sales
 * exist. This reads only sales created inside [from, to] and grows the window
 * itself while it is full, up to `RANGE_MAX_SALES`; `truncated` reports the
 * rare case where even that was not enough. */
const RANGE_PAGE_SIZE = 500;
const RANGE_MAX_SALES = 5000;

export function useSalesInRange(shopId: string | undefined, from: Date, to: Date) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [count, setCount] = useState(RANGE_PAGE_SIZE);
  const fromMs = from.getTime();
  const toMs = to.getTime();

  useEffect(() => {
    if (!shopId) return;
    const q = query(
      collection(db, "shops", shopId, "sales"),
      where("createdAt", ">=", Timestamp.fromMillis(fromMs)),
      where("createdAt", "<=", Timestamp.fromMillis(toMs)),
      orderBy("createdAt", "desc"),
      limit(count)
    );
    const unsub = onSnapshot(q, (snap) => {
      setSales(snap.docs.map((d) => mapSale(d.id, d.data())));
      setLoading(false);
      if (snap.size >= count) {
        if (count < RANGE_MAX_SALES) {
          setCount((current) => Math.min(current + RANGE_PAGE_SIZE, RANGE_MAX_SALES));
        } else {
          setTruncated(true);
        }
      } else {
        setTruncated(false);
      }
    }, (cause) => {
      console.error("Failed to load sales in range", { shopId, fromMs, toMs, cause });
      setLoading(false);
    });
    return unsub;
  }, [shopId, fromMs, toMs, count]);

  return { sales, loading, truncated };
}

/** Latest orders, newest first; grows by `pageSize` per `loadMore`. Same
 * windowing contract as `useSales`. */
export function useOrders(shopId: string | undefined, pageSize = 100) {
  const [orders, setOrders] = useState<CatalogOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [count, setCount] = useState(pageSize);

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
          fulfilledLineIndices: Array.isArray(d.data().fulfilledLineIndices) ? d.data().fulfilledLineIndices : [],
          saleId: d.data().saleId ?? "",
          createdAt: d.data().createdAt?.toDate() ?? null,
        }))
      );
      setHasMore(snap.size >= count);
      setError(null);
      setLoading(false);
    }, (cause) => {
      setError(cause);
      setLoading(false);
    });
    return unsub;
  }, [shopId, count]);

  const loadMore = useCallback(() => setCount((current) => current + pageSize), [pageSize]);

  return { orders, loading, error, hasMore, loadMore };
}

/** Ids of sales that were reversed by a storno. Ordering by `stornoOf` leaves
 * out documents without the field, so the query returns storno docs only.
 * The window grows itself so a shop with more stornos than one page still gets
 * every badge. */
export function useStornoedSaleIds(shopId: string | undefined) {
  const [stornoedIds, setStornoedIds] = useState<Set<string>>(() => new Set());
  const [count, setCount] = useState(200);

  useEffect(() => {
    if (!shopId) return;
    const q = query(
      collection(db, "shops", shopId, "sales"),
      orderBy("stornoOf"),
      limit(count)
    );
    const unsub = onSnapshot(q, (snap) => {
      setStornoedIds(new Set(snap.docs.map((d) => d.data().stornoOf as string).filter(Boolean)));
      if (snap.size >= count) setCount((current) => current + 200);
    }, () => setStornoedIds(new Set()));
    return unsub;
  }, [shopId, count]);

  return stornoedIds;
}

export function useShopConversations(shopId: string | undefined) {
  const [conversations, setConversations] = useState<ShopConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!shopId) return;
    const conversationsQuery = query(
      collection(db, "shops", shopId, "conversations"),
      orderBy("createdAt", "desc"),
      limit(100)
    );
    return onSnapshot(conversationsQuery, (snapshot) => {
      setConversations(snapshot.docs.map((conversation) => ({
        id: conversation.id,
        customerUid: conversation.data().customerUid ?? "",
        customerEmail: conversation.data().customerEmail ?? "",
        customerName: conversation.data().customerName ?? "",
        productId: conversation.data().productId,
        productName: conversation.data().productName,
        hiddenByShop: conversation.data().hiddenByShop === true,
        createdAt: conversation.data().createdAt?.toDate() ?? null,
      })));
      setLoading(false);
      setError(null);
    }, (cause) => {
      setError(cause);
      setLoading(false);
    });
  }, [shopId]);

  return { conversations, loading, error };
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
        stornoOf: d.data().stornoOf ?? "",
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

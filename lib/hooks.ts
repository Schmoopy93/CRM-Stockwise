"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  documentId,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Product, ProductVariant, Sale, ShopCatalogSettings, StockEvent } from "@/lib/types";
import { CatalogItem, CatalogOrder, CatalogStatsDay } from "@/lib/types";
import { channelsFromShop, EMPTY_CHANNELS } from "@/lib/catalog-channels";

export function useShop(shopId: string | undefined): ShopCatalogSettings & { loading: boolean } {
  const [shop, setShop] = useState<ShopCatalogSettings>({ name: "", catalogEnabled: false, channels: EMPTY_CHANNELS, logoUrl: "", coverUrl: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopId) return;
    const unsub = onSnapshot(doc(db, "shops", shopId), (snap) => {
      setShop({
        name: snap.data()?.name ?? "",
        catalogEnabled: snap.data()?.catalogEnabled === true,
        channels: channelsFromShop(snap.data()),
        logoUrl: snap.data()?.catalogLogoUrl ?? "",
        coverUrl: snap.data()?.catalogCoverUrl ?? "",
      });
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [shopId]);

  return { ...shop, loading };
}

const NEW_PRODUCT_DAYS = 14;

export function useCatalog(shopId: string | undefined) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

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
          fields: Array.isArray(d.data().fields) ? d.data().fields : [],
          hidden: d.data().hidden === true,
        }))
      );
      setLoading(false);
    });
    return unsub;
  }, [shopId]);

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
          buyerInstagram: d.data().buyerInstagram ?? "",
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
          customerName: d.data().customerName ?? "",
          customerContact: d.data().customerContact ?? "",
          note: d.data().note ?? "",
          channel: d.data().channel ?? "other",
          status: d.data().status ?? "new",
          createdAt: d.data().createdAt?.toDate() ?? null,
        }))
      );
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [shopId, count]);

  return { orders, loading };
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

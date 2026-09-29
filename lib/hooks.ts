"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Product, ProductVariant, StockEvent } from "@/lib/types";

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
          minStock: d.data().minStock ?? 0,
          totalQuantity: d.data().totalQuantity ?? 0,
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
            minStock: snap.data().minStock ?? 0,
            totalQuantity: snap.data().totalQuantity ?? 0,
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

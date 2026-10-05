"use client";

import { useEffect, useRef } from "react";
import { CatalogOrder, Product } from "./types";
import { useI18n } from "./i18n-context";

export function useLowStockNotifications(products: Product[]) {
  const notifiedRef = useRef<Set<string>>(new Set());
  const { t } = useI18n();

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "denied") return;

    const lowItems = products.filter(
      (p) => p.minStock > 0 && p.totalQuantity <= p.minStock
    );

    if (lowItems.length === 0) return;

    async function notify() {
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
      }

      for (const p of lowItems) {
        if (notifiedRef.current.has(p.id)) continue;
        notifiedRef.current.add(p.id);

        new Notification(t("notify.lowStockTitle", { name: p.name }), {
          body: t("notify.lowStockBody", { qty: p.totalQuantity, min: p.minStock }),
          icon: "/favicon.ico",
          tag: `low-stock-${p.id}`,
        });
      }
    }

    notify();
  }, [products, t]);
}

export function useNewOrderNotifications(orders: CatalogOrder[], loading: boolean) {
  const notifiedRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const { t } = useI18n();

  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "denied") return;

    // On first load, seed all existing orders so we only notify about truly new ones.
    if (!initializedRef.current) {
      for (const o of orders) notifiedRef.current.add(o.id);
      initializedRef.current = true;
      return;
    }

    const newOrders = orders.filter(
      (o) => o.status === "new" && !notifiedRef.current.has(o.id)
    );
    if (newOrders.length === 0) return;

    async function notify() {
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
      }
      for (const o of newOrders) {
        notifiedRef.current.add(o.id);
        new Notification(t("notify.newOrderTitle"), {
          body: t("notify.newOrderBody", { code: o.code, name: o.customerName }),
          icon: "/favicon.ico",
          tag: `new-order-${o.id}`,
        });
      }
    }

    notify();
  }, [orders, t]);
}

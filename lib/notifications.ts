"use client";

import { useEffect, useRef } from "react";
import { Product } from "./types";

export function useLowStockNotifications(products: Product[]) {
  const notifiedRef = useRef<Set<string>>(new Set());

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

        new Notification(`⚠️ Nisko stanje: ${p.name}`, {
          body: `Stanje: ${p.totalQuantity} kom (minimum: ${p.minStock})`,
          icon: "/favicon.ico",
          tag: `low-stock-${p.id}`,
        });
      }
    }

    notify();
  }, [products]);
}

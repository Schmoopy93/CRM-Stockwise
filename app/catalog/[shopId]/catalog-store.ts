"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n-context";

export interface CartLine {
  itemId: string;
  variant: string;
  variantId?: string;
  quantity: number;
}

export const MAX_QUANTITY = 99;

const CART_EVENT = "catalog-cart-change";
const PRODUCT_EVENT = "catalog-product-change";
const EMPTY_CART: CartLine[] = [];
const cartCache = new Map<string, { raw: string | null; lines: CartLine[] }>();

const cartKey = (shopId: string) => `catalog-cart-${shopId}`;

function isCartLine(value: unknown): value is CartLine {
  const line = value as CartLine | null;
  return typeof line?.itemId === "string" && typeof line.variant === "string" &&
    (line.variantId === undefined || typeof line.variantId === "string") &&
    Number.isInteger(line.quantity) && line.quantity > 0;
}

function parseCart(raw: string | null): CartLine[] {
  if (!raw) return EMPTY_CART;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_CART;
    return parsed.filter(isCartLine).map(({ itemId, variant, variantId, quantity }) => ({
      itemId,
      variant,
      ...(variantId ? { variantId } : {}),
      quantity: Math.min(quantity, MAX_QUANTITY),
    }));
  } catch {
    return EMPTY_CART;
  }
}

function subscribeCart(onChange: () => void) {
  window.addEventListener(CART_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CART_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readCart(shopId: string): CartLine[] {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(cartKey(shopId)); } catch { raw = null; }
  const cached = cartCache.get(shopId);
  if (cached && cached.raw === raw) return cached.lines;
  const lines = parseCart(raw);
  cartCache.set(shopId, { raw, lines });
  return lines;
}

function writeCart(shopId: string, lines: CartLine[]) {
  try {
    if (lines.length > 0) window.localStorage.setItem(cartKey(shopId), JSON.stringify(lines));
    else window.localStorage.removeItem(cartKey(shopId));
  } catch {
    cartCache.set(shopId, { raw: null, lines });
  }
  window.dispatchEvent(new Event(CART_EVENT));
}

export function useCart(shopId: string) {
  const lines = useSyncExternalStore(subscribeCart, () => readCart(shopId), () => EMPTY_CART);

  function setQuantity(itemId: string, variant: string, quantity: number, variantId?: string) {
    const current = readCart(shopId);
    const matches = (line: CartLine) => line.itemId === itemId &&
      (variantId ? line.variantId === variantId || (!line.variantId && line.variant === variant) : line.variant === variant);
    const next = quantity > 0
      ? current.some(matches)
        ? current.map((line) => matches(line) ? { ...line, variantId: variantId ?? line.variantId, quantity: Math.min(quantity, MAX_QUANTITY) } : line)
        : [...current, { itemId, variant, ...(variantId ? { variantId } : {}), quantity: Math.min(quantity, MAX_QUANTITY) }]
      : current.filter((line) => !matches(line));
    writeCart(shopId, next);
  }

  function add(itemId: string, variant: string, quantity: number, variantId?: string) {
    const existing = readCart(shopId).find((line) => line.itemId === itemId &&
      (variantId ? line.variantId === variantId || (!line.variantId && line.variant === variant) : line.variant === variant));
    setQuantity(itemId, variant, (existing?.quantity ?? 0) + quantity, variantId);
  }

  return { lines, add, setQuantity, clear: () => writeCart(shopId, []) };
}

function subscribeProduct(onChange: () => void) {
  window.addEventListener(PRODUCT_EVENT, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(PRODUCT_EVENT, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

export function useProductParam() {
  return useSyncExternalStore(subscribeProduct, () => new URLSearchParams(window.location.search).get("p"), () => null);
}

export function setProductParam(productId: string | null) {
  const url = new URL(window.location.href);
  if (productId) url.searchParams.set("p", productId);
  else url.searchParams.delete("p");
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(PRODUCT_EVENT));
}

export function catalogLink(shopId: string, locale: Locale, productId?: string) {
  const url = new URL(`/catalog/${shopId}`, window.location.origin);
  if (productId) url.searchParams.set("p", productId);
  url.searchParams.set("lang", locale);
  return url.toString();
}

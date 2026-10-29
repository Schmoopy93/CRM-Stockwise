import type { CatalogOrder, OrderLine, OrderStatus } from "@/lib/types";
import { matchesCatalogQuery } from "./catalog-filter.ts";

/** Orders are written by anonymous visitors, so the shape is validated here in
 * the same spirit as `firestore.rules` — the rules are the real gate, this is
 * the fast local guard that keeps obviously bad input from becoming a write. */

export const MAX_ORDER_LINES = 50;
export const MAX_ORDER_QUANTITY = 999;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const ORDER_STATUSES: OrderStatus[] = ["new", "confirmed", "fulfilling", "fulfilled", "cancelled"];

/** Human-quotable order reference. Skips I/O/0/1 so it survives being read
 * aloud or copied from a chat message. */
export function newOrderCode(length = 6) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
}

const clamp = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);

export interface OrderInput {
  lines: OrderLine[];
  customerName: string;
  customerContact: string;
  customerEmail: string;
  customerAddress: string;
  customerCity: string;
  note: string;
  channel: string;
}

export function normalizeOrderInput(input: OrderInput): OrderInput {
  if (input.lines.length === 0) throw new Error("ORDER_EMPTY");
  if (input.lines.length > MAX_ORDER_LINES) throw new Error("ORDER_TOO_MANY_LINES");
  if (!clamp(input.customerName, 100)) throw new Error("ORDER_NAME_REQUIRED");
  if (!clamp(input.customerContact, 100)) throw new Error("ORDER_CONTACT_REQUIRED");
  const customerEmail = clamp(input.customerEmail, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("ORDER_EMAIL_INVALID");
  if (!clamp(input.customerAddress, 200)) throw new Error("ORDER_ADDRESS_REQUIRED");
  if (!clamp(input.customerCity, 100)) throw new Error("ORDER_CITY_REQUIRED");
  if (input.lines.some((line) => !/^[A-Za-z0-9_-]{1,128}$/.test(line.productId.trim()) ||
    !clamp(line.productName, 100))) {
    throw new Error("ORDER_LINE_INVALID");
  }
  if (input.lines.some((line) => line.variantId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(line.variantId))) {
    throw new Error("ORDER_LINE_INVALID");
  }
  if (input.lines.some((line) => !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || line.quantity > MAX_ORDER_QUANTITY)) {
    throw new Error("ORDER_QUANTITY_INVALID");
  }
  if (!["catalog", "whatsapp", "telegram", "instagram", "other"].includes(input.channel)) {
    throw new Error("ORDER_CHANNEL_INVALID");
  }

  const lines = input.lines.map((line) => {
    const unitPrice = line.unitPrice;
    if (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error("ORDER_PRICE_REQUIRED");
    }
    if (line.baseUnitPrice !== undefined &&
      (!Number.isFinite(line.baseUnitPrice) || line.baseUnitPrice < 0)) {
      throw new Error("ORDER_PRICE_INVALID");
    }
    return {
      productId: line.productId.trim().slice(0, 128),
      ...(line.variantId ? { variantId: line.variantId.slice(0, 128) } : {}),
      productName: clamp(line.productName, 100),
      variantLabel: clamp(line.variantLabel, 100),
      quantity: line.quantity,
      unitPrice: Math.round(unitPrice * 100) / 100,
      ...(line.baseUnitPrice !== undefined
        ? { baseUnitPrice: Math.round(line.baseUnitPrice * 100) / 100 }
        : {}),
    };
  });
  if (orderTotal(lines) > 100_000_000) throw new Error("VALUE_OUT_OF_RANGE");

  return {
    lines,
    customerName: clamp(input.customerName, 100),
    customerContact: clamp(input.customerContact, 100),
    customerEmail,
    customerAddress: clamp(input.customerAddress, 200),
    customerCity: clamp(input.customerCity, 100),
    note: clamp(input.note, 500),
    channel: input.channel,
  };
}

export function orderTotal(lines: OrderLine[]) {
  return Math.round(lines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.quantity, 0) * 100) / 100;
}

/** The shop may ship an order in several passes. Each pass names whole lines —
 * a line is one product variant, so a partial quantity would need a different
 * ledger shape — and this keeps the selection valid before any stock moves. */
export function normalizeFulfillmentIndices(lineCount: number, indices: number[]): number[] {
  if (!Number.isSafeInteger(lineCount) || lineCount <= 0) throw new Error("ORDER_LINES_INVALID");
  if (!Array.isArray(indices) || indices.length === 0) throw new Error("ORDER_NO_LINES_SELECTED");
  const unique = [...new Set(indices)];
  if (unique.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= lineCount)) {
    throw new Error("ORDER_LINE_INVALID");
  }
  return unique.sort((a, b) => a - b);
}

export function outstandingLineIndices(lines: OrderLine[], fulfilledLineIndices: number[] = []): number[] {
  const completed = new Set(fulfilledLineIndices.filter((index) => Number.isSafeInteger(index)));
  return lines.map((_, index) => index).filter((index) => !completed.has(index));
}

export type OrderFilter = "open" | OrderStatus | "all";

export const ORDER_FILTERS: OrderFilter[] = ["open", "new", "confirmed", "fulfilling", "fulfilled", "cancelled", "all"];

const OPEN_STATUSES: OrderStatus[] = ["new", "confirmed", "fulfilling"];

export function isOpenOrder(status: OrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Chip counts for every filter; "open" is the union of the unfinished states,
 * so it is counted separately from the per-status numbers. */
export function orderStatusCounts(orders: CatalogOrder[]): Record<OrderFilter, number> {
  const counts: Record<OrderFilter, number> = {
    open: 0,
    new: 0,
    confirmed: 0,
    fulfilling: 0,
    fulfilled: 0,
    cancelled: 0,
    all: orders.length,
  };
  for (const order of orders) {
    counts[order.status] += 1;
    if (isOpenOrder(order.status)) counts.open += 1;
  }
  return counts;
}

/** Search folds diacritics and requires every word to appear somewhere in the
 * order, matching how the catalog and audit log search already behave. */
export function orderMatchesSearch(order: CatalogOrder, query: string): boolean {
  const haystack = [
    order.code,
    order.customerName,
    order.customerContact,
    order.note,
    ...order.lines.flatMap((line) => [line.productName, line.variantLabel]),
  ].join("\n");
  return matchesCatalogQuery(haystack, query);
}

export function filterOrders(orders: CatalogOrder[], filter: OrderFilter, query: string): CatalogOrder[] {
  return orders.filter((order) => {
    if (filter === "open" ? !isOpenOrder(order.status) : filter !== "all" && order.status !== filter) {
      return false;
    }
    return orderMatchesSearch(order, query);
  });
}

export function orderFulfillment(order: CatalogOrder) {
  const completed = Math.min(order.fulfilledLineIndices?.length ?? 0, order.lines.length);
  return {
    completed,
    outstanding: outstandingLineIndices(order.lines, order.fulfilledLineIndices ?? []),
    percent: order.lines.length > 0 ? Math.round((completed / order.lines.length) * 100) : 0,
  };
}

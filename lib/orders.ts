import type { OrderLine, OrderStatus } from "@/lib/types";

/** Orders are written by anonymous visitors, so the shape is validated here in
 * the same spirit as `firestore.rules` — the rules are the real gate, this is
 * the fast local guard that keeps obviously bad input from becoming a write. */

export const MAX_ORDER_LINES = 50;
export const MAX_ORDER_QUANTITY = 999;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const ORDER_STATUSES: OrderStatus[] = ["new", "confirmed", "fulfilled", "cancelled"];

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
  note: string;
  channel: string;
}

export function normalizeOrderInput(input: OrderInput): OrderInput {
  const lines = input.lines
    .slice(0, MAX_ORDER_LINES)
    .map((line) => ({
      productId: line.productId.slice(0, 128),
      productName: clamp(line.productName, 100),
      variantLabel: clamp(line.variantLabel, 100),
      quantity: Math.max(1, Math.min(MAX_ORDER_QUANTITY, Math.floor(line.quantity) || 1)),
      ...(typeof line.unitPrice === "number" && Number.isFinite(line.unitPrice)
        ? { unitPrice: Math.max(0, Math.round(line.unitPrice * 100) / 100) }
        : {}),
    }))
    .filter((line) => line.productId && line.productName);

  return {
    lines,
    customerName: clamp(input.customerName, 100),
    customerContact: clamp(input.customerContact, 100),
    note: clamp(input.note, 500),
    channel: input.channel,
  };
}

export function orderTotal(lines: OrderLine[]) {
  return Math.round(lines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.quantity, 0) * 100) / 100;
}

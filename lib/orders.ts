import type { OrderLine, OrderStatus } from "@/lib/types";

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
  note: string;
  channel: string;
}

export function normalizeOrderInput(input: OrderInput): OrderInput {
  if (input.lines.length === 0) throw new Error("ORDER_EMPTY");
  if (input.lines.length > MAX_ORDER_LINES) throw new Error("ORDER_TOO_MANY_LINES");
  if (!clamp(input.customerName, 100)) throw new Error("ORDER_NAME_REQUIRED");
  if (!clamp(input.customerContact, 100)) throw new Error("ORDER_CONTACT_REQUIRED");
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
    note: clamp(input.note, 500),
    channel: input.channel,
  };
}

export function orderTotal(lines: OrderLine[]) {
  return Math.round(lines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.quantity, 0) * 100) / 100;
}

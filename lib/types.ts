import type { CatalogChannels } from "@/lib/catalog-channels";

export interface UserProfile {
  uid: string;
  shopId: string;
  displayName: string;
  role: "owner" | "staff";
  permissions?: {
    manageCatalog?: boolean;
  };
}

export interface Supplier {
  name: string;
  contact?: string;   // phone or email
  notes?: string;
}

/** Someone the shop sells to. Contact is the identifier a shop actually reaches
 * them by — a phone number or a handle — and is the only field besides the name
 * that a shop is expected to fill in. `tags` carry the segment ("vip",
 * "wholesale") so the list can be filtered into groups.
 *
 * Sales and orders link here by `customerId`; the buyer name written on the sale
 * is a copy of what was typed at the till and is not a reliable join key. */
export interface Customer {
  id: string;
  name: string;
  contact: string;
  email: string;
  note: string;
  tags: string[];
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  imageUrl: string;
  images: string[];
  minStock: number;
  totalQuantity: number;
  costPrice?: number;   // purchase price per unit
  salePrice?: number;   // selling price per unit
  compareAtPrice?: number;
  supplier?: Supplier;
  customFieldDefinitions: ProductCustomField[];
  customFieldValues: Record<string, string | number | boolean>;
  catalogHidden?: boolean;
}

export type ProductCustomFieldType = "text" | "number" | "date" | "boolean" | "select";
export type AppLocale = "sr" | "en" | "ru" | "de" | "es" | "it";

export interface ProductCustomField {
  key: string;
  label: string;
  labels?: Partial<Record<AppLocale, string>>;
  type: ProductCustomFieldType;
  required: boolean;
  options?: string[];
  optionValues?: string[];
  optionsByLocale?: Partial<Record<AppLocale, string[]>>;
}

export interface ProductVariant {
  id: string;
  label: string;
  sku: string;
  quantity: number;
}

export type SaleChannel = "instagram" | "facebook" | "store" | "phone" | "catalog" | "other";

export interface CatalogField {
  label: string;
  labels?: Partial<Record<AppLocale, string>>;
  type: ProductCustomFieldType;
  value: string | number | boolean;
  values?: Partial<Record<AppLocale, string>>;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  images: string[];
  salePrice?: number;
  compareAtPrice?: number;
  isNew: boolean;
  variants: string[];
  variantIds?: string[];
  stockQuantity?: number;
  variantStock?: Record<string, number>;
  fields: CatalogField[];
  hidden: boolean;
}

export interface ShopCatalogSettings {
  name: string;
  catalogEnabled: boolean;
  channels: CatalogChannels;
  logoUrl: string;
  coverUrl: string;
  /** Currency the shop trades in. Prices are stored in the base currency and
   * converted for display; absent on shops created before this existed. */
  currency: string;
}

export type CatalogStatEvent = "views" | "whatsapp" | "telegram" | "instagram" | "share" | "orders";

export type CatalogStatsDay = { day: string } & Record<CatalogStatEvent, number>;

/** Lifecycle of a catalog order. Fulfillment may be resumed after a partial
 * stock update; its progress markers make every stock event idempotent. */
export type OrderStatus = "new" | "confirmed" | "fulfilling" | "fulfilled" | "cancelled";

export interface OrderLine {
  productId: string;
  variantId?: string;
  productName: string;
  variantLabel: string;
  quantity: number;
  unitPrice?: number;
  /** Price in the shop's base currency, preserved separately from the quote. */
  baseUnitPrice?: number;
}

export interface CatalogOrder {
  id: string;
  code: string;
  lines: OrderLine[];
  total: number;
  /** Currency the customer was quoted in. Stored per order so a later change of
   * the shop currency cannot restate what was agreed. */
  currency?: string;
  customerName: string;
  customerContact: string;
  customerEmail?: string;
  customerAddress?: string;
  customerCity?: string;
  /** Set by the shop when it links the order to a customer record. Visitors
   * never supply it — they have no account and no way to claim an identity. */
  customerId?: string;
  note: string;
  channel: string;
  status: OrderStatus;
  fulfilledLineIndices?: number[];
  lastFulfilledLineIndex?: number;
  lastFulfillmentEventId?: string;
  saleId?: string;
  createdAt: Date | null;
}

export interface ShopConversation {
  id: string;
  customerUid: string;
  customerEmail: string;
  customerName: string;
  productId?: string;
  productName?: string;
  hiddenByShop?: boolean;
  createdAt: Date | null;
}

export interface SaleLine {
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  quantity: number;
  unitPrice: number;
  /** Purchase price per unit at the moment of sale, snapshotted so profit stays
   * what it was even after the product's cost changes. Absent on sales recorded
   * before this existed, where analytics falls back to the current cost. */
  unitCost?: number;
}

export interface Sale {
  id: string;
  lines: SaleLine[];
  total: number;
  channel: SaleChannel;
  buyerName: string;
  buyerContact: string;
  sourceOrderId?: string;
  sourceOrderCode?: string;
  /** Set on a compensating document that reverses another sale. The reversed
   * sale itself is never modified — reports subtract stornos by this link. */
  stornoOf?: string;
  /** The customer this sale was attributed to, when one was picked. */
  customerId?: string;
  note: string;
  actorUid: string;
  actorName: string;
  createdAt: Date | null;
}

export interface StockEvent {
  id: string;
  productId: string;
  variantId: string;
  variantLabel: string;
  delta: number;
  reason?: "adjustment" | "receipt" | "sale" | "return" | "correction";
  actorUid: string;
  actorName: string;
  createdAt: Date | null;
}

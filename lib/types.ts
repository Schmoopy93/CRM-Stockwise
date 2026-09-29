import type { CatalogChannels } from "@/lib/catalog-channels";

export interface UserProfile {
  uid: string;
  shopId: string;
  displayName: string;
  role: "owner" | "staff";
}

export interface Supplier {
  name: string;
  contact?: string;   // phone or email
  notes?: string;
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

export type SaleChannel = "instagram" | "facebook" | "store" | "phone" | "other";

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
  fields: CatalogField[];
  hidden: boolean;
}

export interface ShopCatalogSettings {
  name: string;
  catalogEnabled: boolean;
  channels: CatalogChannels;
  logoUrl: string;
  coverUrl: string;
}

export type CatalogStatEvent = "views" | "whatsapp" | "telegram" | "instagram" | "share";

export type CatalogStatsDay = { day: string } & Record<CatalogStatEvent, number>;

export interface SaleLine {
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  quantity: number;
  unitPrice: number;
}

export interface Sale {
  id: string;
  lines: SaleLine[];
  total: number;
  channel: SaleChannel;
  buyerName: string;
  buyerInstagram: string;
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

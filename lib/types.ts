export interface UserProfile {
  uid: string;
  shopId: string;
  displayName: string;
  role: "owner" | "staff";
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  imageUrl: string;
  minStock: number;
  totalQuantity: number;
  customFieldDefinitions: ProductCustomField[];
  customFieldValues: Record<string, string | number | boolean>;
}

export type ProductCustomFieldType = "text" | "number" | "date" | "boolean" | "select";
export type AppLocale = "sr" | "en" | "ru";

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

export interface StockEvent {
  id: string;
  productId: string;
  variantId: string;
  variantLabel: string;
  delta: number;
  actorUid: string;
  actorName: string;
  createdAt: Date | null;
}

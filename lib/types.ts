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

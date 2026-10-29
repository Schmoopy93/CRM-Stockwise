"use client";

import { useAuth } from "@/lib/auth-context";
import { useAllStockEvents, useProducts } from "@/lib/hooks";
import AuditView from "./audit-view";

export default function AuditPage() {
  const { profile } = useAuth();
  const { products } = useProducts(profile?.shopId);
  const events = useAllStockEvents(profile?.shopId, 90);

  return <AuditView events={events} products={products} />;
}

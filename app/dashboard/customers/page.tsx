"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCustomers, useOrders, useSales, useShopMoney } from "@/lib/hooks";
import { INTL_LOCALES, useI18n } from "@/lib/i18n-context";
import { orderCountsByCustomer, spendingByCustomer } from "@/lib/customers";
import CustomersView from "./customers-view";

export default function CustomersPage() {
  const { profile } = useAuth();
  const { locale } = useI18n();
  const shopId = profile?.shopId;
  const { customers, loading } = useCustomers(shopId);
  const { sales } = useSales(shopId, 200);
  const { orders } = useOrders(shopId, 200);
  const { money } = useShopMoney(shopId, INTL_LOCALES[locale]);

  const spending = useMemo(() => spendingByCustomer(sales), [sales]);
  const orderCounts = useMemo(() => orderCountsByCustomer(orders), [orders]);

  if (!shopId) return null;

  return (
    <CustomersView
      shopId={shopId}
      customers={customers}
      loading={loading}
      spending={spending}
      orderCounts={orderCounts}
      money={money}
    />
  );
}

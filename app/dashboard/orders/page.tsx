"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { useCustomers, useOrders, useShopConversations, useStornoedSaleIds } from "@/lib/hooks";
import { translateError, useI18n } from "@/lib/i18n-context";
import { fulfillCatalogOrder, fulfillOrderLines, linkOrderToCustomer, updateOrderStatus } from "@/lib/actions";
import { outstandingLineIndices } from "@/lib/orders";
import { useNewOrderNotifications } from "@/lib/notifications";
import { db } from "@/lib/firebase";
import type { CatalogOrder, OrderStatus } from "@/lib/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import OrdersView from "./orders-view";

export default function OrdersPage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const shopId = profile?.shopId;
  const { orders, loading, error: ordersError, hasMore, loadMore } = useOrders(shopId);
  const stornoedSaleIds = useStornoedSaleIds(shopId);
  const { conversations, loading: conversationsLoading, error: conversationsError } = useShopConversations(shopId);
  const { customers, loading: customersLoading } = useCustomers(shopId);
  useNewOrderNotifications(orders, loading);

  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [confirmCancelOrder, setConfirmCancelOrder] = useState<string | null>(null);
  const [confirmHideConversation, setConfirmHideConversation] = useState<string | null>(null);
  const [selectedLines, setSelectedLines] = useState<Record<string, number[]>>({});
  const [hidingConversation, setHidingConversation] = useState(false);
  const [conversationActionError, setConversationActionError] = useState("");

  function markBusy(orderId: string, busy: boolean) {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }

  function clearActionError(orderId: string) {
    setActionErrors((current) => {
      if (!(orderId in current)) return current;
      const next = { ...current };
      delete next[orderId];
      return next;
    });
  }

  function failOrder(orderId: string, cause: unknown) {
    setActionErrors((current) => ({
      ...current,
      [orderId]: translateError(cause, t, "orders.updateFailed"),
    }));
  }

  async function executeStatusChange(orderId: string, status: OrderStatus) {
    if (!profile) return;
    markBusy(orderId, true);
    clearActionError(orderId);
    try {
      await updateOrderStatus(profile.shopId, orderId, status);
    } catch (cause) {
      failOrder(orderId, cause);
    } finally {
      markBusy(orderId, false);
    }
  }

  function selectionFor(order: CatalogOrder): number[] {
    const outstanding = outstandingLineIndices(order.lines, order.fulfilledLineIndices ?? []);
    const stored = selectedLines[order.id];
    if (!stored) return outstanding;
    const selectable = new Set(outstanding);
    return stored.filter((index) => selectable.has(index));
  }

  function toggleLine(order: CatalogOrder, index: number) {
    const selection = selectionFor(order);
    const next = selection.includes(index)
      ? selection.filter((value) => value !== index)
      : [...selection, index].sort((a, b) => a - b);
    setSelectedLines((current) => ({ ...current, [order.id]: next }));
  }

  async function fulfillSelected(order: CatalogOrder) {
    if (!profile) return;
    const outstanding = outstandingLineIndices(order.lines, order.fulfilledLineIndices ?? []);
    const selection = selectionFor(order);
    if (outstanding.length > 0 && selection.length === 0) {
      setActionErrors((current) => ({ ...current, [order.id]: t("errors.ORDER_NO_LINES_SELECTED") }));
      return;
    }

    markBusy(order.id, true);
    clearActionError(order.id);
    try {
      if (outstanding.length === 0) {
        await fulfillCatalogOrder(profile.shopId, order.id, profile.uid, profile.displayName);
      } else {
        await fulfillOrderLines(profile.shopId, order.id, selection, profile.uid, profile.displayName);
      }
      setSelectedLines((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
    } catch (cause) {
      failOrder(order.id, cause);
    } finally {
      markBusy(order.id, false);
    }
  }

  async function hideShopConversation() {
    if (!shopId || !confirmHideConversation || hidingConversation) return;
    setHidingConversation(true);
    setConversationActionError("");
    try {
      await updateDoc(doc(db, "shops", shopId, "conversations", confirmHideConversation), {
        hiddenByShop: true,
      });
      setConfirmHideConversation(null);
    } catch (cause) {
      console.error("Failed to hide shop conversation", { shopId, conversationId: confirmHideConversation, cause });
      setConversationActionError(translateError(cause, t, "chat.hideConversationFailed"));
      setConfirmHideConversation(null);
    } finally {
      setHidingConversation(false);
    }
  }

  function changeStatus(orderId: string, status: OrderStatus) {
    if (status === "cancelled") {
      setConfirmCancelOrder(orderId);
      return;
    }
    void executeStatusChange(orderId, status);
  }

  async function changeCustomer(orderId: string, customerId: string) {
    if (!profile) return;
    markBusy(orderId, true);
    clearActionError(orderId);
    try {
      await linkOrderToCustomer(profile.shopId, orderId, customerId || null);
    } catch (cause) {
      failOrder(orderId, cause);
    } finally {
      markBusy(orderId, false);
    }
  }

  if (!shopId) return null;

  return (
    <>
      <ConfirmDialog
        open={confirmCancelOrder !== null}
        title={t("orders.cancelTitle")}
        description={t("orders.cancelConfirmation")}
        confirmText={t("orders.cancelAction")}
        cancelText={t("cancel")}
        destructive
        onConfirm={async () => {
          if (!confirmCancelOrder) return;
          setConfirmCancelOrder(null);
          await executeStatusChange(confirmCancelOrder, "cancelled");
        }}
        onCancel={() => setConfirmCancelOrder(null)}
      />
      <ConfirmDialog
        open={confirmHideConversation !== null}
        title={t("chat.hideConversationTitle")}
        description={t("chat.hideConversationDescription")}
        confirmText={t("chat.deleteConversation")}
        cancelText={t("cancel")}
        destructive
        confirmDisabled={hidingConversation}
        onConfirm={() => void hideShopConversation()}
        onCancel={() => setConfirmHideConversation(null)}
      />

      <OrdersView
        shopId={shopId}
        orders={orders}
        loading={loading}
        ordersError={ordersError}
        hasMore={hasMore}
        loadMore={loadMore}
        stornoedSaleIds={stornoedSaleIds}
        conversations={conversations}
        conversationsLoading={conversationsLoading}
        conversationsError={conversationsError}
        conversationActionError={conversationActionError}
        customers={customers}
        customersLoading={customersLoading}
        busyIds={busyIds}
        actionErrors={actionErrors}
        selectedLines={selectedLines}
        authorName={profile?.displayName ?? ""}
        onStatusChange={changeStatus}
        onRequestCancel={setConfirmCancelOrder}
        onFulfill={(order) => void fulfillSelected(order)}
        onCustomerChange={(orderId, customerId) => void changeCustomer(orderId, customerId)}
        onRequestHideConversation={setConfirmHideConversation}
        onToggleLine={toggleLine}
      />
    </>
  );
}

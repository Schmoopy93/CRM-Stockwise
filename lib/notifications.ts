"use client";

import { useEffect, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import { CatalogOrder, Product } from "./types";
import { useI18n } from "./i18n-context";

const MESSAGE_READ_EVENT = "stockwise-order-message-read";
const CONVERSATION_READ_EVENT = "stockwise-shop-conversation-read";

function readMessageMarker(shopId: string, orderId: string) {
  try {
    return window.localStorage.getItem(`order-message-read:${shopId}:${orderId}`) ?? "";
  } catch {
    return "";
  }
}

export function markOrderMessagesRead(shopId: string, orderId: string, messageId: string) {
  try {
    window.localStorage.setItem(`order-message-read:${shopId}:${orderId}`, messageId);
  } catch (cause) {
    console.error("Could not persist read message marker", cause);
  }
  window.dispatchEvent(new Event(MESSAGE_READ_EVENT));
}

export function markShopConversationRead(shopId: string, conversationId: string, messageId: string) {
  try {
    window.localStorage.setItem(`shop-conversation-read:${shopId}:${conversationId}`, messageId);
  } catch (cause) {
    console.error("Could not persist read conversation marker", cause);
  }
  window.dispatchEvent(new Event(CONVERSATION_READ_EVENT));
}

export function readShopConversationMarker(shopId: string, conversationId: string) {
  try {
    return window.localStorage.getItem(`shop-conversation-read:${shopId}:${conversationId}`) ?? "";
  } catch {
    return "";
  }
}

function notifyAndOpen(title: string, body: string, tag: string, destination: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const notification = new Notification(title, { body, icon: "/favicon.ico", tag });
  notification.onclick = () => {
    window.focus();
    window.location.assign(destination);
    notification.close();
  };
}

export function useCustomerMessageNotifications(
  shopId: string,
  orders: CatalogOrder[],
  loading: boolean
) {
  const { t } = useI18n();
  const [unreadOrderIds, setUnreadOrderIds] = useState<Set<string>>(() => new Set());
  const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(() => new Set());
  const [toasts, setToasts] = useState<{
    id: string;
    code: string;
    name: string;
    conversationId?: string;
    orderId?: string;
  }[]>([]);
  const seenLatestRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (loading) return;
    const catalogOrders = orders.filter((order) => order.channel === "catalog");
    const latestByOrder = new Map<string, { id: string; authorRole: string }>();
    const initialized = new Set<string>();
    const latestByConversation = new Map<string, { id: string; authorRole: string; email: string }>();
    const initializedConversations = new Set<string>();
    const conversationMessageUnsubscribes: (() => void)[] = [];
    seenLatestRef.current = new Map();

    const refreshUnread = () => {
      const unread = new Set<string>();
      for (const [orderId, message] of latestByOrder) {
        if (message.authorRole === "customer" && readMessageMarker(shopId, orderId) !== message.id) {
          unread.add(orderId);
        }
      }
      setUnreadOrderIds(unread);
    };

    const refreshConversationUnread = () => {
      const unread = new Set<string>();
      for (const [conversationId, message] of latestByConversation) {
        if (message.authorRole === "customer" && readShopConversationMarker(shopId, conversationId) !== message.id) {
          unread.add(conversationId);
        }
      }
      setUnreadConversationIds(unread);
    };

    const unsubscribes = catalogOrders.map((order) => {
      const latestMessageQuery = query(
        collection(db, "shops", shopId, "orders", order.id, "messages"),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      return onSnapshot(latestMessageQuery, (snapshot) => {
        const latestDoc = snapshot.docs[0];
        const latest = latestDoc
          ? { id: latestDoc.id, authorRole: latestDoc.data().authorRole ?? "" }
          : null;
        const previousId = seenLatestRef.current.get(order.id);
        if (initialized.has(order.id) && latest?.id && latest.id !== previousId && latest.authorRole === "customer") {
          setToasts((current) => [
            ...current.filter((toast) => toast.id !== order.id),
            { id: order.id, code: order.code, name: order.customerName, orderId: order.id },
          ]);
          notifyAndOpen(
            t("notify.newCustomerMessageTitle"),
            t("notify.newCustomerMessageBody", { code: order.code, name: order.customerName }),
            `customer-message-${order.id}`,
            `/dashboard/orders#order-chat-${order.id}`
          );
        }
        initialized.add(order.id);
        if (latest) {
          latestByOrder.set(order.id, latest);
          seenLatestRef.current.set(order.id, latest.id);
        } else {
          latestByOrder.delete(order.id);
          seenLatestRef.current.delete(order.id);
        }
        refreshUnread();
      }, (cause) => {
        console.error("Failed to subscribe to customer messages", { shopId, orderId: order.id, cause });
      });
    });

    const conversationsQuery = query(
      collection(db, "shops", shopId, "conversations"),
      orderBy("createdAt", "desc"),
      limit(100)
    );
    const unsubscribeConversations = onSnapshot(conversationsQuery, (snapshot) => {
      conversationMessageUnsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
      latestByConversation.clear();
      initializedConversations.clear();
      const visibleConversations = snapshot.docs.filter((conversation) => conversation.data().hiddenByShop !== true);
      const conversationIds = new Set(visibleConversations.map((conversation) => conversation.id));
      setUnreadConversationIds((current) => new Set([...current].filter((id) => conversationIds.has(id))));
      setToasts((current) => current.filter((toast) =>
        !toast.conversationId || conversationIds.has(toast.conversationId)
      ));
      for (const conversation of visibleConversations) {
        const conversationId = conversation.id;
        const latestMessageQuery = query(
          collection(db, "shops", shopId, "conversations", conversationId, "messages"),
          orderBy("createdAt", "desc"),
          limit(1)
        );
        conversationMessageUnsubscribes.push(onSnapshot(latestMessageQuery, (messages) => {
          const latestDoc = messages.docs[0];
          if (!latestDoc) {
            latestByConversation.delete(conversationId);
            initializedConversations.add(conversationId);
            refreshConversationUnread();
            return;
          }
          const latest = {
            id: latestDoc.id,
            authorRole: latestDoc.data().authorRole ?? "",
            email: conversation.data().customerEmail ?? "",
          };
          const previous = latestByConversation.get(conversationId);
          if (initializedConversations.has(conversationId)
            && previous?.id !== latest.id
            && latest.authorRole === "customer") {
            setToasts((current) => [
              ...current.filter((toast) => toast.id !== `conversation-${conversationId}`),
              { id: `conversation-${conversationId}`, code: "", name: latest.email, conversationId },
            ]);
            notifyAndOpen(
              t("notify.newShopConversationTitle"),
              t("notify.newShopConversationBody", { email: latest.email }),
              `shop-conversation-${conversationId}`,
              `/dashboard/orders#conversation-${conversationId}`
            );
          }
          latestByConversation.set(conversationId, latest);
          initializedConversations.add(conversationId);
          refreshConversationUnread();
        }, (cause) => {
          console.error("Failed to subscribe to shop conversation messages", { shopId, conversationId, cause });
        }));
      }
    }, (cause) => {
      console.error("Failed to subscribe to shop conversations", { shopId, cause });
    });

    const onRead = () => refreshUnread();
    const onConversationRead = () => refreshConversationUnread();
    window.addEventListener(MESSAGE_READ_EVENT, onRead);
    window.addEventListener(CONVERSATION_READ_EVENT, onConversationRead);
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      unsubscribeConversations();
      conversationMessageUnsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
      window.removeEventListener(MESSAGE_READ_EVENT, onRead);
      window.removeEventListener(CONVERSATION_READ_EVENT, onConversationRead);
    };
  }, [shopId, orders, loading, t]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts((current) => current.slice(1)), 6000);
    return () => clearTimeout(timer);
  }, [toasts]);

  function dismissToast(id: string) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  return { unreadOrderIds, unreadConversationIds, toasts, dismissToast };
}

export function useLowStockNotifications(products: Product[]) {
  const notifiedRef = useRef<Set<string>>(new Set());
  const { t } = useI18n();

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "denied") return;

    const lowItems = products.filter(
      (p) => p.minStock > 0 && p.totalQuantity <= p.minStock
    );

    if (lowItems.length === 0) return;

    async function notify() {
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
      }

      for (const p of lowItems) {
        if (notifiedRef.current.has(p.id)) continue;
        notifiedRef.current.add(p.id);

        new Notification(t("notify.lowStockTitle", { name: p.name }), {
          body: t("notify.lowStockBody", { qty: p.totalQuantity, min: p.minStock }),
          icon: "/favicon.ico",
          tag: `low-stock-${p.id}`,
        });
      }
    }

    notify();
  }, [products, t]);
}

export function useNewOrderNotifications(orders: CatalogOrder[], loading: boolean) {
  const notifiedRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const { t } = useI18n();

  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "denied") return;

    // On first load, seed all existing orders so we only notify about truly new ones.
    if (!initializedRef.current) {
      for (const o of orders) notifiedRef.current.add(o.id);
      initializedRef.current = true;
      return;
    }

    const newOrders = orders.filter(
      (o) => o.status === "new" && !notifiedRef.current.has(o.id)
    );
    if (newOrders.length === 0) return;

    async function notify() {
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
      }
      for (const o of newOrders) {
        notifiedRef.current.add(o.id);
        new Notification(t("notify.newOrderTitle"), {
          body: t("notify.newOrderBody", { code: o.code, name: o.customerName }),
          icon: "/favicon.ico",
          tag: `new-order-${o.id}`,
        });
      }
    }

    notify();
  }, [orders, loading, t]);
}

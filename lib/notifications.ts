"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import { CatalogOrder, Product } from "./types";
import { stockLevel } from "./stock-alerts";
import { useI18n } from "./i18n-context";

const MESSAGE_READ_EVENT = "logixia-order-message-read";
const CONVERSATION_READ_EVENT = "logixia-shop-conversation-read";

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

type AlertLevels = Record<string, "low" | "out">;

const alertStorageKey = (shopId: string) => `low-stock-levels:${shopId}`;

/** The last level the shop was alerted about, per product. It lives in the
 * browser rather than Firestore so the alert cannot depend on a schema change
 * or a rules deploy: a reload keeps it, and a second tab shares it. */
function readAlertLevels(shopId: string): AlertLevels {
  try {
    const raw = window.localStorage.getItem(alertStorageKey(shopId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const levels: AlertLevels = {};
    for (const [productId, level] of Object.entries(parsed as Record<string, unknown>)) {
      if (level === "low" || level === "out") levels[productId] = level;
    }
    return levels;
  } catch {
    return {};
  }
}

function writeAlertLevels(shopId: string, levels: AlertLevels) {
  try {
    window.localStorage.setItem(alertStorageKey(shopId), JSON.stringify(levels));
  } catch (cause) {
    console.error("Could not persist low-stock levels", cause);
  }
}

export interface LowStockToast {
  id: string;
  productId: string;
  level: "low" | "out";
  title: string;
  body: string;
}

interface ToastQueue<T> {
  get: () => readonly T[];
  enqueue: (entries: T[], keyOf: (entry: T) => string) => void;
  remove: (predicate: (entry: T) => boolean) => void;
  dropOldest: () => void;
  subscribe: (listener: () => void) => () => void;
}

/** Alerts are raised while comparing a fresh Firestore snapshot with the last
 * one, so the queue lives outside React and the hook only subscribes to it —
 * `useSyncExternalStore` keeps the state update out of the effect body. */
function createToastQueue<T>(): ToastQueue<T> {
  let items: readonly T[] = [];
  const listeners = new Set<() => void>();
  const update = (next: readonly T[]) => {
    items = next;
    for (const listener of listeners) listener();
  };
  return {
    get: () => items,
    enqueue: (entries, keyOf) => {
      const keys = new Set(entries.map(keyOf));
      update([...items.filter((item) => !keys.has(keyOf(item))), ...entries]);
    },
    remove: (predicate) => update(items.filter((item) => !predicate(item))),
    dropOldest: () => update(items.slice(1)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useLowStockNotifications(
  shopId: string | undefined,
  products: Product[],
  loading: boolean
) {
  const { t } = useI18n();
  const levelsRef = useRef<AlertLevels>({});
  const seededRef = useRef(false);
  const [toastQueue] = useState(() => createToastQueue<LowStockToast>());
  const toasts = useSyncExternalStore(toastQueue.subscribe, toastQueue.get, toastQueue.get);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () => (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported")
  );

  useEffect(() => {
    if (!shopId) return;
    levelsRef.current = readAlertLevels(shopId);
    seededRef.current = false;
  }, [shopId]);

  useEffect(() => {
    if (!shopId || loading) return;

    const next: AlertLevels = {};
    for (const product of products) {
      const level = stockLevel(product);
      if (level !== "ok") next[product.id] = level;
    }

    const previous = levelsRef.current;
    const alerts: { product: Product; level: "low" | "out" }[] = [];

    // The first snapshot after opening the app describes the shop as it already
    // is — nobody wants an inbox full of notifications for history. Later
    // snapshots compare against what this browser last saw.
    if (seededRef.current) {
      for (const product of products) {
        const level = stockLevel(product);
        if (level === "ok") continue;
        const prior = previous[product.id];
        // Restocking an empty item up to "low" is an improvement, not a new alert.
        if (prior === level || (prior === "out" && level === "low")) continue;
        alerts.push({ product, level });
      }
    }
    seededRef.current = true;
    levelsRef.current = next;
    writeAlertLevels(shopId, next);

    const newToasts: LowStockToast[] = [];
    for (const { product, level } of alerts) {
      const title = level === "out"
        ? t("notify.outOfStockTitle", { name: product.name })
        : t("notify.lowStockTitle", { name: product.name });
      const body = level === "out"
        ? t("notify.outOfStockBody")
        : t("notify.lowStockBody", { qty: product.totalQuantity, min: product.minStock });

      newToasts.push({ id: `${product.id}-${level}-${Date.now()}`, productId: product.id, level, title, body });
      notifyAndOpen(title, body, `low-stock-${product.id}-${level}`, `/dashboard/products/${product.id}`);
    }
    if (newToasts.length > 0) toastQueue.enqueue(newToasts, (toast) => toast.productId);
  }, [shopId, products, loading, t, toastQueue]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(toastQueue.dropOldest, 8000);
    return () => clearTimeout(timer);
  }, [toasts, toastQueue]);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      setPermission(await Notification.requestPermission());
    } catch (cause) {
      console.error("Could not request notification permission", cause);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    toastQueue.remove((toast) => toast.id === id);
  }, [toastQueue]);

  return { toasts, dismissToast, permission, requestPermission };
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

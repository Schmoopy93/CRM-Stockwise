"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCustomers, useOrders, useShopConversations, useStornoedSaleIds } from "@/lib/hooks";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { fulfillCatalogOrder, updateOrderStatus, linkOrderToCustomer } from "@/lib/actions";
import { formatCatalogPrice } from "@/lib/catalog-channels";
import { BASE_CURRENCY } from "@/lib/currency";
import { OrderStatus } from "@/lib/types";
import { useNewOrderNotifications } from "@/lib/notifications";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  ChevronDown,
  Clock3,
  MessageCircle,
  PackageCheck,
  Search,
  ShoppingBag,
  Trash2,
  XCircle,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import OrderConversation from "@/components/OrderConversation";

type Filter = "open" | OrderStatus | "all";

const FILTERS: Filter[] = ["open", "new", "confirmed", "fulfilling", "fulfilled", "cancelled", "all"];
const OPEN_STATUSES = new Set<OrderStatus>(["new", "confirmed", "fulfilling"]);

const NEXT_STATUS: Record<OrderStatus, { status: OrderStatus; key: string } | null> = {
  new: { status: "confirmed", key: "orders.confirm" },
  confirmed: { status: "fulfilled", key: "orders.fulfill" },
  fulfilling: { status: "fulfilled", key: "orders.resumeFulfill" },
  fulfilled: null,
  cancelled: null,
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  new: "var(--accent-2)",
  confirmed: "var(--amber)",
  fulfilling: "var(--amber)",
  fulfilled: "var(--green)",
  cancelled: "var(--text-3)",
};

export default function OrdersPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const intl = INTL_LOCALES[locale];
  const shopId = profile?.shopId;
  const { orders, loading, error: ordersError } = useOrders(shopId);
  const stornoedSaleIds = useStornoedSaleIds(shopId);
  const { conversations, loading: conversationsLoading, error: conversationsError } = useShopConversations(shopId);
  const { customers, loading: customersLoading } = useCustomers(shopId);
  useNewOrderNotifications(orders, loading);
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [openConversations, setOpenConversations] = useState<Set<string>>(() => new Set());
  const [confirmCancelOrder, setConfirmCancelOrder] = useState<string | null>(null);
  const [confirmHideConversation, setConfirmHideConversation] = useState<string | null>(null);
  const [hidingConversation, setHidingConversation] = useState(false);
  const [conversationActionError, setConversationActionError] = useState("");
  const visibleConversations = conversations.filter((conversation) => !conversation.hiddenByShop);

  useEffect(() => {
    const openConversationFromHash = () => {
      const conversationMatch = window.location.hash.match(/^#conversation-(.+)$/);
      const orderMatch = window.location.hash.match(/^#order-chat-(.+)$/);
      if (!conversationMatch && !orderMatch) return;
      setFilter("all");
      setSearch("");
      const threadKey = conversationMatch
        ? `conversation-${conversationMatch[1]}`
        : orderMatch?.[1];
      if (threadKey) {
        setOpenConversations((current) => new Set(current).add(threadKey));
      }
    };
    openConversationFromHash();
    window.addEventListener("hashchange", openConversationFromHash);
    return () => window.removeEventListener("hashchange", openConversationFromHash);
  }, []);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = {
      open: 0,
      new: 0,
      confirmed: 0,
      fulfilling: 0,
      fulfilled: 0,
      cancelled: 0,
      all: orders.length,
    };
    for (const order of orders) {
      result[order.status] += 1;
      if (OPEN_STATUSES.has(order.status)) result.open += 1;
    }
    return result;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    return orders.filter((order) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "open" ? OPEN_STATUSES.has(order.status) : order.status === filter);
      if (!matchesFilter) return false;
      if (!query) return true;
      return [
        order.code,
        order.customerName,
        order.customerContact,
        order.note,
        ...order.lines.flatMap((line) => [line.productName, line.variantLabel]),
      ].some((value) => value.toLocaleLowerCase(locale).includes(query));
    });
  }, [orders, filter, search, locale]);

  useEffect(() => {
    const hash = window.location.hash;
    const conversationId = hash.startsWith("#conversation-") ? hash.slice("#conversation-".length) : "";
    const orderId = hash.startsWith("#order-chat-") ? hash.slice("#order-chat-".length) : "";
    const targetId = conversationId
      ? conversations.some((conversation) => conversation.id === conversationId) ? hash.slice(1) : ""
      : orderId && filteredOrders.some((order) => order.id === orderId) ? hash.slice(1) : "";
    if (!targetId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversations, filteredOrders, openConversations]);

  async function executeStatusChange(orderId: string, status: OrderStatus) {
    if (!profile) return;

    setBusyIds((current) => new Set(current).add(orderId));
    setActionErrors((current) => {
      const next = { ...current };
      delete next[orderId];
      return next;
    });
    try {
      if (status === "fulfilled") {
        await fulfillCatalogOrder(profile.shopId, orderId, profile.uid, profile.displayName);
      } else {
        await updateOrderStatus(profile.shopId, orderId, status);
      }
    } catch (cause) {
      setActionErrors((current) => ({
        ...current,
        [orderId]: translateError(cause, t, "orders.updateFailed"),
      }));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(orderId);
        return next;
      });
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
      setOpenConversations((current) => {
        const next = new Set(current);
        next.delete(`conversation-${confirmHideConversation}`);
        return next;
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

  async function changeStatus(orderId: string, status: OrderStatus) {
    if (status === "cancelled") {
      setConfirmCancelOrder(orderId);
      return;
    }

    await executeStatusChange(orderId, status);
  }

  async function changeCustomer(orderId: string, customerId: string) {
    if (!profile) return;
    setBusyIds((current) => new Set(current).add(orderId));
    setActionErrors((current) => {
      const next = { ...current };
      delete next[orderId];
      return next;
    });
    try {
      await linkOrderToCustomer(profile.shopId, orderId, customerId || null);
    } catch (cause) {
      setActionErrors((current) => ({
        ...current,
        [orderId]: translateError(cause, t, "orders.updateFailed"),
      }));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(orderId);
        return next;
      });
    }
  }

  function toggleConversation(orderId: string) {
    setOpenConversations((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  if (!shopId) return null;

  const summary = [
    { key: "orders.filterOpen", count: counts.open, icon: <ShoppingBag size={16} />, tone: "var(--accent-2)" },
    { key: "orders.status.new", count: counts.new, icon: <Clock3 size={16} />, tone: "var(--accent-2)" },
    { key: "orders.status.fulfilling", count: counts.fulfilling, icon: <PackageCheck size={16} />, tone: "var(--amber)" },
    { key: "orders.status.fulfilled", count: counts.fulfilled, icon: <CheckCircle2 size={16} />, tone: "var(--green)" },
  ];

  return (
    <main className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", minWidth: 0 }}>
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

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 750, margin: 0, color: "var(--text-1)", letterSpacing: "-0.025em" }}>
            {t("orders.title")}
          </h1>
          <p style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "var(--text-2)", margin: "0.35rem 0 0", maxWidth: 620 }}>
            {t("orders.subtitle")}
          </p>
        </div>
      </header>

      <section aria-label={t("orders.title")} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: "0.75rem" }}>
        {summary.map((tile) => (
          <div key={tile.key} className="glass" style={{ padding: "0.85rem 1rem", borderRadius: 13, minWidth: 0 }}>
            <p style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.72rem", fontWeight: 650, color: "var(--text-3)", margin: 0 }}>
              <span style={{ display: "inline-flex", color: tile.tone }}>{tile.icon}</span>
              {t(tile.key)}
            </p>
            <p style={{ fontSize: "1.45rem", fontWeight: 750, lineHeight: 1.15, color: "var(--text-1)", margin: "0.45rem 0 0" }}>
              {loading ? "—" : tile.count.toLocaleString(intl)}
            </p>
          </div>
        ))}
      </section>

      <section aria-label={t("chat.shopConversations")} className="glass" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "1rem", borderRadius: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, color: "var(--text-1)", fontSize: "0.96rem", fontWeight: 750 }}>
              <MessageCircle size={17} color="var(--accent-2)" /> {t("chat.shopConversations")}
            </h2>
            <p style={{ margin: "0.3rem 0 0", color: "var(--text-3)", fontSize: "0.76rem" }}>{t("chat.shopConversationsDescription")}</p>
          </div>
          <span style={{ borderRadius: 999, padding: "0.25rem 0.55rem", background: "var(--bg-3)", color: "var(--text-2)", fontSize: "0.72rem", fontWeight: 700 }}>
            {conversationsLoading ? "—" : visibleConversations.length.toLocaleString(intl)}
          </span>
        </div>
        {conversationsError && <p role="alert" style={{ margin: 0, color: "var(--red)", fontSize: "0.78rem" }}>{translateError(conversationsError, t, "orders.loadFailed")}</p>}
        {conversationActionError && <p role="alert" style={{ margin: 0, color: "var(--red)", fontSize: "0.78rem" }}>{conversationActionError}</p>}
        {!conversationsLoading && visibleConversations.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-3)", fontSize: "0.78rem" }}>{t("chat.noShopConversations")}</p>
        ) : visibleConversations.map((conversation) => {
          const isOpen = openConversations.has(`conversation-${conversation.id}`);
          return (
            <article key={conversation.id} id={`conversation-${conversation.id}`} style={{ display: "flex", flexDirection: "column", gap: "0.65rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, color: "var(--text-1)", fontSize: "0.8rem", fontWeight: 700, overflowWrap: "anywhere" }}>{conversation.customerEmail}</p>
                  {conversation.productName && (
                    <p style={{ display: "flex", alignItems: "center", gap: 5, margin: "0.25rem 0 0", color: "var(--text-2)", fontSize: "0.72rem" }}>
                      <PackageCheck size={13} /> {t("chat.productInQuestion")}: {conversation.productName}
                    </p>
                  )}
                  <time dateTime={conversation.createdAt?.toISOString()} style={{ display: "block", marginTop: 3, color: "var(--text-3)", fontSize: "0.68rem" }}>
                    {conversation.createdAt?.toLocaleString(intl) ?? "—"}
                  </time>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button type="button" className={isOpen ? "btn-secondary" : "btn-primary"} onClick={() => toggleConversation(`conversation-${conversation.id}`)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34, padding: "0.4rem 0.65rem", fontSize: "0.74rem" }}>
                    <MessageCircle size={14} /> {t(isOpen ? "chat.closeConversation" : "chat.openConversation")}
                  </button>
                  <button type="button" onClick={() => setConfirmHideConversation(conversation.id)}
                    aria-label={t("chat.deleteConversation")} title={t("chat.deleteConversation")}
                    style={{ display: "grid", placeItems: "center", width: 34, height: 34, border: "1px solid var(--border)", borderRadius: 9, background: "var(--bg-2)", color: "var(--text-3)", cursor: "pointer" }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {isOpen && (
                <OrderConversation
                  shopId={shopId}
                  conversationId={conversation.id}
                  authorRole="shop"
                  authorName={profile?.displayName ?? ""}
                  customerEmail={conversation.customerEmail}
                  locale={locale}
                />
              )}
            </article>
          );
        })}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ position: "relative", maxWidth: 520 }}>
          <Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
          <input
            className="input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("orders.searchPlaceholder")}
            aria-label={t("orders.searchPlaceholder")}
            style={{ width: "100%", paddingLeft: 38 }}
          />
        </div>

        <div role="group" aria-label={t("orders.title")} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {FILTERS.map((value) => {
            const active = filter === value;
            const label = value === "open"
              ? t("orders.filterOpen")
              : value === "all"
                ? t("all")
                : t(`orders.status.${value}`);
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(value)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0.4rem 0.72rem",
                  fontSize: "0.78rem",
                  fontWeight: 650,
                  cursor: "pointer",
                  borderRadius: 999,
                  background: active ? "var(--accent-glow)" : "var(--bg-2)",
                  border: `1px solid ${active ? "rgba(99,102,241,0.3)" : "var(--border)"}`,
                  color: active ? "var(--accent-2)" : "var(--text-2)",
                }}
              >
                {label}
                <span style={{ fontSize: "0.7rem", opacity: active ? 0.8 : 0.65 }}>
                  {loading ? "—" : counts[value].toLocaleString(intl)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {ordersError && (
        <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 11, padding: "0.8rem 0.95rem", fontSize: "0.82rem", color: "var(--red)" }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          {translateError(ordersError, t, "orders.loadFailed")}
        </div>
      )}

      {loading ? (
        <div aria-label={t("loading")} aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          {[0, 1, 2].map((index) => (
            <div key={index} className="glass" style={{ height: 150, borderRadius: 14, opacity: 1 - index * 0.18 }} />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div style={{ minHeight: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px dashed var(--border)", borderRadius: 16, gap: "0.55rem", padding: "1.5rem", textAlign: "center", color: "var(--text-3)" }}>
          <ShoppingBag size={30} strokeWidth={1.6} />
          <span style={{ fontSize: "0.9rem", color: "var(--text-2)" }}>
            {orders.length === 0 && !search ? t("orders.empty") : t("dashboard.noResults")}
          </span>
          {(search || filter !== "open") && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setSearch(""); setFilter("open"); }}
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.78rem" }}
            >
              {t("orders.filterOpen")}
            </button>
          )}
        </div>
      ) : (
        <section aria-label={t("orders.title")} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filteredOrders.map((order) => {
            const next = NEXT_STATUS[order.status];
            const busy = busyIds.has(order.id);
            const completedLines = Math.min(order.fulfilledLineIndices?.length ?? 0, order.lines.length);
            const progress = order.lines.length > 0 ? Math.round((completedLines / order.lines.length) * 100) : 0;
            const saleStornoed = Boolean(order.saleId && stornoedSaleIds.has(order.saleId));
            const channelLabel = order.channel === "catalog"
              ? t("orders.source.catalog")
              : t(`catalog.${order.channel === "other" ? "cart" : order.channel}`);

            return (
              <article key={order.id} id={`order-${order.id}`} className="glass" style={{ padding: "1rem", borderRadius: 14, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.8rem", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 750, fontSize: "0.9rem", color: "var(--accent-2)" }}>
                        {order.code || "—"}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "0.2rem 0.55rem", borderRadius: 999, fontSize: "0.7rem", fontWeight: 700, background: "var(--bg-3)", color: STATUS_COLOR[order.status] }}>
                        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[order.status] }} />
                        {t(`orders.status.${order.status}`)}
                      </span>
                      {saleStornoed && (
                        <span style={{ display: "inline-flex", alignItems: "center", padding: "0.2rem 0.55rem", borderRadius: 999, fontSize: "0.7rem", fontWeight: 700, background: "var(--red-dim)", color: "var(--red)" }}>
                          {t("orders.saleStornoed")}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.55rem", fontSize: "0.76rem", color: "var(--text-3)" }}>
                      <span>{channelLabel}</span>
                      {order.createdAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <time dateTime={order.createdAt.toISOString()}>{order.createdAt.toLocaleString(intl)}</time>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ flex: "0 0 auto", textAlign: "right" }}>
                    <span style={{ display: "block", fontSize: "1.05rem", fontWeight: 750, color: "var(--text-1)" }}>
                      {formatCatalogPrice(order.total, intl, order.currency ?? BASE_CURRENCY)}
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
                      {t("orders.itemCount", { n: order.lines.reduce((sum, line) => sum + line.quantity, 0) })}
                    </span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: "1rem", marginTop: "0.9rem", paddingTop: "0.85rem", borderTop: "1px solid var(--border)" }}>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-1)", margin: "0 0 0.5rem" }}>
                      {order.customerName || order.customerContact || "—"}
                    </h2>
                    {order.customerName && order.customerContact && (
                      <p style={{ fontSize: "0.76rem", color: "var(--text-2)", margin: "0 0 0.55rem", overflowWrap: "anywhere" }}>
                        {order.customerContact}
                      </p>
                    )}
                    {(order.customerEmail || order.customerAddress || order.customerCity) && (
                      <div style={{ fontSize: "0.76rem", color: "var(--text-2)", lineHeight: 1.5, overflowWrap: "anywhere" }}>
                        {order.customerEmail && <p style={{ margin: 0 }}>{order.customerEmail}</p>}
                        {(order.customerAddress || order.customerCity) && (
                          <p style={{ margin: 0 }}>{[order.customerAddress, order.customerCity].filter(Boolean).join(", ")}</p>
                        )}
                      </div>
                    )}
                    {order.note && (
                      <p style={{ fontSize: "0.76rem", color: "var(--text-2)", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: "0.55rem 0 0" }}>
                        {order.note}
                      </p>
                    )}
                    <div style={{ marginTop: "0.7rem" }}>
                      <select
                        className="input"
                        value={order.customerId ?? ""}
                        onChange={(event) => void changeCustomer(order.id, event.target.value)}
                        disabled={busy || customersLoading}
                        aria-label={t("customers.attach")}
                        style={{ width: "100%", maxWidth: 300, padding: "0.4rem 0.6rem", fontSize: "0.75rem", opacity: busy || customersLoading ? 0.65 : 1 }}
                      >
                        <option value="">{t("customers.attach")}</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}{customer.contact ? ` · ${customer.contact}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.45rem" }}>
                      {t("orders.items")}
                    </h2>
                    <ul style={{ display: "flex", flexDirection: "column", gap: "0.45rem", listStyle: "none", margin: 0, padding: 0 }}>
                      {order.lines.map((line, index) => (
                        <li key={`${line.productId}-${line.variantId ?? line.variantLabel}-${index}`} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.75rem", fontSize: "0.79rem" }}>
                          <span style={{ minWidth: 0, color: "var(--text-1)", overflowWrap: "anywhere" }}>
                            {line.productName}
                            {line.variantLabel && <span style={{ color: "var(--text-3)" }}> · {line.variantLabel}</span>}
                            <span style={{ color: "var(--text-3)" }}> × {line.quantity}</span>
                          </span>
                          {typeof line.unitPrice === "number" && (
                            <span style={{ flexShrink: 0, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                              {formatCatalogPrice(line.unitPrice * line.quantity, intl, order.currency ?? BASE_CURRENCY)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {order.channel === "catalog" && order.customerEmail && (
                  <div style={{ marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                    <button
                      type="button"
                      aria-expanded={openConversations.has(order.id)}
                      onClick={() => toggleConversation(order.id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "0.4rem 0.55rem", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-2)", color: "var(--text-1)", cursor: "pointer", fontSize: "0.78rem", fontWeight: 700 }}
                    >
                      <MessageCircle size={15} />
                      {t("chat.title")}
                      <ChevronDown size={14} style={{ transform: openConversations.has(order.id) ? "rotate(180deg)" : undefined, transition: "transform 0.16s" }} />
                    </button>
                    {openConversations.has(order.id) && (
                      <div id={`order-chat-${order.id}`} style={{ marginTop: "0.7rem" }}>
                        <OrderConversation
                          key={order.id}
                          shopId={shopId}
                          orderId={order.id}
                          authorRole="shop"
                          authorName={profile?.displayName ?? ""}
                          customerEmail={order.customerEmail}
                          locale={locale}
                        />
                      </div>
                    )}
                  </div>
                )}

                {order.status === "fulfilling" && (
                  <div style={{ marginTop: "0.9rem", padding: "0.7rem 0.75rem", background: "var(--amber-dim)", borderRadius: 9 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.74rem", color: "var(--amber)" }}>
                      <span>{t("orders.fulfillmentProgress", { done: completedLines, total: order.lines.length })}</span>
                      <span>{progress}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress}
                      style={{ height: 4, borderRadius: 99, overflow: "hidden", background: "var(--bg-2)", marginTop: 7 }}
                    >
                      <div style={{ width: `${progress}%`, height: "100%", background: "var(--amber)", transition: "width 0.2s" }} />
                    </div>
                  </div>
                )}

                {actionErrors[order.id] && (
                  <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 7, marginTop: "0.8rem", color: "var(--red)", fontSize: "0.77rem" }}>
                    <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    {actionErrors[order.id]}
                  </div>
                )}

                {(next || order.status === "new" || order.status === "confirmed") && (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.9rem", paddingTop: "0.8rem", borderTop: "1px solid var(--border)" }}>
                    {next && (
                      <button
                        className="btn-primary"
                        type="button"
                        disabled={busy}
                        onClick={() => void changeStatus(order.id, next.status)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 36, padding: "0.45rem 0.8rem", fontSize: "0.78rem", opacity: busy ? 0.65 : 1 }}
                      >
                        {busy ? <span className="spinner" aria-hidden="true" /> : next.status === "fulfilled" ? <PackageCheck size={14} /> : <CheckCircle2 size={14} />}
                        {t(next.key)}
                      </button>
                    )}
                    {(order.status === "new" || order.status === "confirmed") && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void changeStatus(order.id, "cancelled")}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 36, padding: "0.4rem 0.75rem", fontSize: "0.78rem", fontWeight: 650, background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 9, color: "var(--red)", cursor: busy ? "default" : "pointer", opacity: busy ? 0.55 : 1 }}
                      >
                        <XCircle size={14} />
                        {t("orders.cancel")}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      <p style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: "0.75rem", lineHeight: 1.5, color: "var(--text-3)", margin: 0 }}>
        <ClipboardList size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        {t("orders.stockNote")}
      </p>
    </main>
  );
}

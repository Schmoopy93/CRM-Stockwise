"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MessageCircle,
  PackageCheck,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { filterOrders, orderFulfillment, orderStatusCounts, ORDER_FILTERS, type OrderFilter } from "@/lib/orders";
import StatTiles from "@/components/StatTiles";
import type { CatalogOrder, Customer, OrderStatus, ShopConversation } from "@/lib/types";
import OrderCard from "./order-card";
import ShopConversationsDrawer from "./shop-conversations-drawer";
import styles from "./orders.module.css";

interface Props {
  shopId: string;
  orders: CatalogOrder[];
  loading: boolean;
  ordersError: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  stornoedSaleIds: Set<string>;
  conversations: ShopConversation[];
  conversationsLoading: boolean;
  conversationsError: Error | null;
  conversationActionError: string;
  customers: Customer[];
  customersLoading: boolean;
  busyIds: Set<string>;
  actionErrors: Record<string, string>;
  selectedLines: Record<string, number[]>;
  authorName: string;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onRequestCancel: (orderId: string) => void;
  onFulfill: (order: CatalogOrder) => void;
  onCustomerChange: (orderId: string, customerId: string) => void;
  onRequestHideConversation: (conversationId: string) => void;
  onToggleLine: (order: CatalogOrder, index: number) => void;
}

const FILTER_LABEL_KEYS: Record<Exclude<OrderFilter, "open" | "all">, string> = {
  new: "orders.status.new",
  confirmed: "orders.status.confirmed",
  fulfilling: "orders.status.fulfilling",
  fulfilled: "orders.status.fulfilled",
  cancelled: "orders.status.cancelled",
};

export default function OrdersView({
  shopId,
  orders,
  loading,
  ordersError,
  hasMore,
  loadMore,
  stornoedSaleIds,
  conversations,
  conversationsLoading,
  conversationsError,
  conversationActionError,
  customers,
  customersLoading,
  busyIds,
  actionErrors,
  selectedLines,
  authorName,
  onStatusChange,
  onRequestCancel,
  onFulfill,
  onCustomerChange,
  onRequestHideConversation,
  onToggleLine,
}: Props) {
  const { locale, t } = useI18n();
  const intl = INTL_LOCALES[locale];

  const [filter, setFilter] = useState<OrderFilter>("open");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchRef = useRef<HTMLInputElement>(null);
  const [openConversations, setOpenConversations] = useState<Set<string>>(() => new Set());
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const closeConversations = useCallback(() => {
    setConversationsOpen(false);
    setActiveConversationId(null);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target?.isContentEditable) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const openFromHash = () => {
      const conversationMatch = window.location.hash.match(/^#conversation-(.+)$/);
      if (conversationMatch) {
        setActiveConversationId(conversationMatch[1]);
        setConversationsOpen(true);
        return;
      }
      const orderMatch = window.location.hash.match(/^#order-chat-(.+)$/);
      if (!orderMatch) return;
      setFilter("all");
      setSearch("");
      setOpenConversations((current) => new Set(current).add(orderMatch[1]));
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  const counts = useMemo(() => orderStatusCounts(orders), [orders]);
  const filteredOrders = useMemo(
    () => filterOrders(orders, filter, deferredSearch),
    [orders, filter, deferredSearch]
  );
  const hasFilters = deferredSearch.trim() !== "" || filter !== "open";
  const resetFilters = () => {
    setSearch("");
    setFilter("open");
    searchRef.current?.focus();
  };

  useEffect(() => {
    const hash = window.location.hash;
    const orderId = hash.startsWith("#order-chat-") ? hash.slice("#order-chat-".length) : "";
    const targetId = orderId && filteredOrders.some((order) => order.id === orderId) ? hash.slice(1) : "";
    if (!targetId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filteredOrders, openConversations]);

  function toggleConversation(orderId: string) {
    setOpenConversations((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function selectionFor(order: CatalogOrder): number[] {
    const outstanding = orderFulfillment(order).outstanding;
    const stored = selectedLines[order.id];
    if (!stored) return outstanding;
    const selectable = new Set(outstanding);
    return stored.filter((index) => selectable.has(index));
  }

  const visibleConversations = conversations.filter((conversation) => !conversation.hiddenByShop);

  const tiles = [
    { label: t("orders.filterOpen"), value: loading ? "—" : counts.open.toLocaleString(intl), icon: <ShoppingBag size={16} />, tone: "var(--accent-2)" },
    { label: t("orders.status.new"), value: loading ? "—" : counts.new.toLocaleString(intl), icon: <Clock3 size={16} />, tone: "var(--accent-2)" },
    { label: t("orders.status.fulfilling"), value: loading ? "—" : counts.fulfilling.toLocaleString(intl), icon: <PackageCheck size={16} />, tone: "var(--amber)" },
    { label: t("orders.status.fulfilled"), value: loading ? "—" : counts.fulfilled.toLocaleString(intl), icon: <CheckCircle2 size={16} />, tone: "var(--green)" },
  ];

  return (
    <main className={`fade-up ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("orders.title")}</h1>
          <p className={styles.subtitle}>{t("orders.subtitle")}</p>
        </div>
        <button
          type="button"
          className={styles.conversationsBtn}
          onClick={() => {
            setActiveConversationId(null);
            setConversationsOpen(true);
          }}
          aria-haspopup="dialog"
          aria-expanded={conversationsOpen}
        >
          <MessageCircle size={15} />
          {t("chat.shopConversations")}
          {!conversationsLoading && (
            <span className={styles.conversationsCount}>{visibleConversations.length.toLocaleString(intl)}</span>
          )}
        </button>
      </header>

      <StatTiles items={tiles} size="lg" label={t("orders.title")} />

      <section className={styles.filtersSection}>
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={16} className={styles.searchIcon} aria-hidden="true" />
            <input
              ref={searchRef}
              className={`input ${styles.searchInput}`}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("orders.searchPlaceholder")}
              aria-label={t("orders.searchPlaceholder")}
            />
            {search ? (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => {
                  setSearch("");
                  searchRef.current?.focus();
                }}
                aria-label={t("orders.clearSearch")}
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className={styles.kbd} aria-hidden="true">/</kbd>
            )}
          </div>
          {hasFilters && (
            <button type="button" className={styles.resetBtn} onClick={resetFilters}>
              <X size={14} />
              {t("orders.clearFilters")}
            </button>
          )}
        </div>

        <div role="group" aria-label={t("orders.title")} className={styles.chips}>
          {ORDER_FILTERS.map((value) => {
            const active = filter === value;
            const label = value === "open"
              ? t("orders.filterOpen")
              : value === "all"
                ? t("all")
                : t(FILTER_LABEL_KEYS[value]);
            return (
              <button
                key={value}
                type="button"
                className={styles.chip}
                data-status={value}
                data-active={active}
                aria-pressed={active}
                onClick={() => setFilter(value)}
              >
                {value !== "all" && <span className={styles.chipDot} aria-hidden="true" />}
                {label}
                <span className={styles.chipCount}>
                  {loading ? "—" : counts[value].toLocaleString(intl)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <p className={styles.srOnly} aria-live="polite">
        {t("orders.matched", { n: filteredOrders.length })}
      </p>

      {ordersError && (
        <div role="alert" className={styles.alert}>
          <AlertCircle size={16} />
          {translateError(ordersError, t, "orders.loadFailed")}
        </div>
      )}

      {loading ? (
        <div aria-label={t("loading")} aria-busy="true" className={styles.skeletons}>
          {[0, 1, 2].map((index) => <div key={index} className={`glass ${styles.skeleton}`} />)}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <ShoppingBag size={20} />
          </div>
          <p className={styles.emptyTitle}>
            {orders.length === 0 ? t("orders.empty") : t("dashboard.noResults")}
          </p>
          <p className={styles.emptyBody}>
            {orders.length === 0 ? t("orders.subtitle") : t("orders.searchPlaceholder")}
          </p>
          {hasFilters && (
            <button type="button" className={styles.emptyAction} onClick={resetFilters}>
              {t("orders.clearFilters")}
            </button>
          )}
        </div>
      ) : (
        <section aria-label={t("orders.title")} className={styles.orders}>
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={busyIds.has(order.id)}
              actionError={actionErrors[order.id]}
              selection={selectionFor(order)}
              customers={customers}
              customersLoading={customersLoading}
              saleStornoed={Boolean(order.saleId && stornoedSaleIds.has(order.saleId))}
              conversationOpen={openConversations.has(order.id)}
              shopId={shopId}
              authorName={authorName}
              onToggleLine={onToggleLine}
              onFulfill={onFulfill}
              onStatusChange={onStatusChange}
              onRequestCancel={onRequestCancel}
              onCustomerChange={onCustomerChange}
              onToggleConversation={toggleConversation}
            />
          ))}
        </section>
      )}

      {hasMore && orders.length > 0 && (
        <div className="list-pagination">
          <p className="list-pagination-count">{t("paging.showing")} {orders.length}</p>
          <div className="list-pagination-actions">
            <button type="button" className="list-pagination-more" onClick={loadMore}>{t("paging.loadMore")}</button>
          </div>
        </div>
      )}

      <p className={styles.stockNote}>
        <ClipboardList size={14} />
        {t("orders.stockNote")}
      </p>

      {conversationsOpen && (
        <ShopConversationsDrawer
          shopId={shopId}
          conversations={visibleConversations}
          loading={conversationsLoading}
          error={conversationsError}
          actionError={conversationActionError}
          activeId={activeConversationId}
          authorName={authorName}
          onSelect={setActiveConversationId}
          onClose={closeConversations}
          onRequestHide={onRequestHideConversation}
        />
      )}
    </main>
  );
}

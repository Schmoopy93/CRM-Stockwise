"use client";

import { AlertCircle, CheckCircle2, ChevronDown, ClipboardList, MessageCircle, PackageCheck, XCircle } from "lucide-react";
import { INTL_LOCALES, useI18n } from "@/lib/i18n-context";
import { orderFulfillment } from "@/lib/orders";
import { formatCatalogPrice } from "@/lib/catalog-channels";
import { BASE_CURRENCY } from "@/lib/currency";
import OrderConversation from "@/components/OrderConversation";
import type { CatalogOrder, Customer, OrderStatus } from "@/lib/types";
import styles from "./orders.module.css";

const NEXT_STATUS: Record<OrderStatus, { status: OrderStatus; key: string } | null> = {
  new: { status: "confirmed", key: "orders.confirm" },
  confirmed: null,
  fulfilling: null,
  fulfilled: null,
  cancelled: null,
};

interface Props {
  order: CatalogOrder;
  busy: boolean;
  actionError?: string;
  selection: number[];
  customers: Customer[];
  customersLoading: boolean;
  saleStornoed: boolean;
  conversationOpen: boolean;
  shopId: string;
  authorName: string;
  onToggleLine: (order: CatalogOrder, index: number) => void;
  onFulfill: (order: CatalogOrder) => void;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onRequestCancel: (orderId: string) => void;
  onCustomerChange: (orderId: string, customerId: string) => void;
  onToggleConversation: (orderId: string) => void;
}

export default function OrderCard({
  order,
  busy,
  actionError,
  selection,
  customers,
  customersLoading,
  saleStornoed,
  conversationOpen,
  shopId,
  authorName,
  onToggleLine,
  onFulfill,
  onStatusChange,
  onRequestCancel,
  onCustomerChange,
  onToggleConversation,
}: Props) {
  const { locale, t } = useI18n();
  const intl = INTL_LOCALES[locale];

  const next = NEXT_STATUS[order.status];
  const { completed, outstanding, percent } = orderFulfillment(order);
  const selectable = order.status === "confirmed" || order.status === "fulfilling";
  const fulfillLabel = outstanding.length === 0
    ? "orders.resumeFulfill"
    : selection.length < outstanding.length
      ? "orders.fulfillSelected"
      : order.status === "fulfilling"
        ? "orders.resumeFulfill"
        : "orders.fulfill";
  const fulfillDisabled = busy || (outstanding.length > 0 && selection.length === 0);
  const channelLabel = order.channel === "catalog"
    ? t("orders.source.catalog")
    : t(`catalog.${order.channel === "other" ? "cart" : order.channel}`);

  return (
    <article id={`order-${order.id}`} className={`glass ${styles.card}`} data-status={order.status}>
      <div className={styles.cardHead}>
        <div className={styles.cardHeadMain}>
          <div className={styles.badges}>
            <span className={styles.code}>{order.code || "—"}</span>
            <span className={styles.statusBadge} data-status={order.status}>
              <span className={styles.statusDot} aria-hidden="true" />
              {t(`orders.status.${order.status}`)}
            </span>
            {saleStornoed && <span className={styles.stornoBadge}>{t("orders.saleStornoed")}</span>}
          </div>
          <div className={styles.meta}>
            <span>{channelLabel}</span>
            {order.createdAt && (
              <>
                <span aria-hidden="true">·</span>
                <time dateTime={order.createdAt.toISOString()}>{order.createdAt.toLocaleString(intl)}</time>
              </>
            )}
          </div>
        </div>

        <div className={styles.amount}>
          <span className={styles.total}>{formatCatalogPrice(order.total, intl, order.currency ?? BASE_CURRENCY)}</span>
          <span className={styles.itemCount}>
            {t("orders.itemCount", { n: order.lines.reduce((sum, line) => sum + line.quantity, 0) })}
          </span>
        </div>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.col}>
          <h2 className={styles.customerName}>{order.customerName || order.customerContact || "—"}</h2>
          {order.customerName && order.customerContact && (
            <p className={styles.customerContact}>{order.customerContact}</p>
          )}
          {(order.customerEmail || order.customerAddress || order.customerCity) && (
            <div className={styles.customerDetails}>
              {order.customerEmail && <p>{order.customerEmail}</p>}
              {(order.customerAddress || order.customerCity) && (
                <p>{[order.customerAddress, order.customerCity].filter(Boolean).join(", ")}</p>
              )}
            </div>
          )}
          {order.note && <p className={styles.note}>{order.note}</p>}
          <div className={styles.customerPicker}>
            <select
              className={`input ${styles.customerSelect}`}
              value={order.customerId ?? ""}
              onChange={(event) => onCustomerChange(order.id, event.target.value)}
              disabled={busy || customersLoading}
              aria-label={t("customers.attach")}
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

        <div className={styles.col}>
          <h2 className={styles.itemsTitle}>{t("orders.items")}</h2>
          <ul className={styles.lines}>
            {order.lines.map((line, index) => {
              const fulfilled = (order.fulfilledLineIndices ?? []).includes(index);
              const lineLabel = `${line.productName}${line.variantLabel ? ` · ${line.variantLabel}` : ""}`;
              return (
                <li key={`${line.productId}-${line.variantId ?? line.variantLabel}-${index}`} className={styles.line}>
                  <span className={styles.lineMain}>
                    {selectable && (
                      <input
                        type="checkbox"
                        className={styles.lineCheck}
                        checked={!fulfilled && selection.includes(index)}
                        disabled={fulfilled || busy}
                        onChange={() => onToggleLine(order, index)}
                        aria-label={lineLabel}
                      />
                    )}
                    <span className={styles.lineText} data-fulfilled={fulfilled}>
                      {line.productName}
                      {line.variantLabel && <span className={styles.lineVariant}> · {line.variantLabel}</span>}
                      <span className={styles.lineQty}> × {line.quantity}</span>
                      {selectable && fulfilled && (
                        <span className={styles.lineFulfilled}>
                          <CheckCircle2 size={12} /> {t("orders.lineFulfilled")}
                        </span>
                      )}
                    </span>
                  </span>
                  {typeof line.unitPrice === "number" && (
                    <span className={styles.linePrice}>
                      {formatCatalogPrice(line.unitPrice * line.quantity, intl, order.currency ?? BASE_CURRENCY)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {order.channel === "catalog" && order.customerEmail && (
        <div className={styles.chatRow}>
          <button
            type="button"
            className={styles.chatToggle}
            aria-expanded={conversationOpen}
            onClick={() => onToggleConversation(order.id)}
          >
            <MessageCircle size={15} />
            {t("chat.title")}
            <ChevronDown size={14} className={styles.chevron} data-open={conversationOpen} />
          </button>
          {conversationOpen && (
            <div id={`order-chat-${order.id}`} className={styles.chatBody}>
              <OrderConversation
                key={order.id}
                shopId={shopId}
                orderId={order.id}
                authorRole="shop"
                authorName={authorName}
                customerEmail={order.customerEmail}
                locale={locale}
              />
            </div>
          )}
        </div>
      )}

      {order.status === "fulfilling" && (
        <div className={styles.progressBox}>
          <div className={styles.progressMeta}>
            <span>{t("orders.fulfillmentProgress", { done: completed, total: order.lines.length })}</span>
            <span>{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className={styles.progressTrack}
          >
            <div className={styles.progressBar} style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {selectable && order.lines.length > 1 && (
        <p className={styles.partialHint}>
          <ClipboardList size={13} />
          {t("orders.partialHint")}
        </p>
      )}

      {actionError && (
        <div role="alert" className={styles.actionError}>
          <AlertCircle size={14} />
          {actionError}
        </div>
      )}

      {(next || selectable) && (
        <div className={styles.actions}>
          {next && (
            <button
              className={`btn-primary ${styles.actionBtn}`}
              type="button"
              disabled={busy}
              onClick={() => onStatusChange(order.id, next.status)}
            >
              {busy ? <span className="spinner" aria-hidden="true" /> : <CheckCircle2 size={14} />}
              {t(next.key)}
            </button>
          )}
          {selectable && (
            <button
              className={`btn-primary ${styles.actionBtn}`}
              type="button"
              disabled={fulfillDisabled}
              onClick={() => onFulfill(order)}
            >
              {busy ? <span className="spinner" aria-hidden="true" /> : <PackageCheck size={14} />}
              {t(fulfillLabel)}
              {outstanding.length > 1 && (
                <span className={styles.selectionCount}>{selection.length}/{outstanding.length}</span>
              )}
            </button>
          )}
          {(order.status === "new" || order.status === "confirmed") && (
            <button
              type="button"
              className={styles.cancelAction}
              disabled={busy}
              onClick={() => onRequestCancel(order.id)}
            >
              <XCircle size={14} />
              {t("orders.cancel")}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

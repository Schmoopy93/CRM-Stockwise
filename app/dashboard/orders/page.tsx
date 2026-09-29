"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useOrders } from "@/lib/hooks";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { updateOrderStatus } from "@/lib/actions";
import { formatCatalogPrice } from "@/lib/catalog-channels";
import { BASE_CURRENCY } from "@/lib/currency";
import { OrderStatus } from "@/lib/types";
import { CheckCircle2, ClipboardList, PackageCheck, ShoppingBag, XCircle } from "lucide-react";

type Filter = "open" | OrderStatus | "all";

const FILTERS: Filter[] = ["open", "new", "confirmed", "fulfilled", "cancelled", "all"];

const NEXT_STATUS: Record<OrderStatus, { status: OrderStatus; key: string } | null> = {
  new: { status: "confirmed", key: "orders.confirm" },
  confirmed: { status: "fulfilled", key: "orders.fulfill" },
  fulfilled: null,
  cancelled: null,
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  new: "var(--accent-2)",
  confirmed: "#d97706",
  fulfilled: "var(--green)",
  cancelled: "var(--text-3)",
};

export default function OrdersPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const intl = INTL_LOCALES[locale];
  const { orders, loading } = useOrders(profile?.shopId);
  const [filter, setFilter] = useState<Filter>("open");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "open") return orders.filter((order) => order.status === "new" || order.status === "confirmed");
    return orders.filter((order) => order.status === filter);
  }, [orders, filter]);

  const openCount = orders.filter((order) => order.status === "new" || order.status === "confirmed").length;

  async function setStatus(orderId: string, status: OrderStatus) {
    if (!profile) return;
    setBusyId(orderId); setError("");
    try {
      await updateOrderStatus(profile.shopId, orderId, status);
    } catch (cause) {
      setError(translateError(cause, t, "orders.updateFailed"));
    } finally { setBusyId(""); }
  }

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{t("orders.title")}</h1>
        <p style={{ fontSize: "0.82rem", color: "var(--text-2)", marginTop: 4 }}>{t("orders.subtitle")}</p>
      </div>

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            style={{
              padding: "0.35rem 0.75rem", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
              borderRadius: 99, background: filter === value ? "var(--accent-glow)" : "transparent",
              border: `1px solid ${filter === value ? "rgba(99,102,241,0.3)" : "var(--border)"}`,
              color: filter === value ? "var(--accent-2)" : "var(--text-3)",
            }}
          >
            {value === "open" ? t("orders.filterOpen") : t(`orders.status.${value}`)}
            {value === "open" && openCount > 0 && <span style={{ opacity: 0.7 }}> · {openCount}</span>}
          </button>
        ))}
      </div>

      {error && <div style={{ background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "0.82rem", color: "var(--red)" }}>{error}</div>}

      {loading ? null : filtered.length === 0 ? (
        <div style={{ height: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px dashed var(--border)", borderRadius: 16, gap: "0.5rem", color: "var(--text-3)" }}>
          <ShoppingBag size={28} />
          <span style={{ fontSize: "0.875rem" }}>{t("orders.empty")}</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {filtered.map((order) => {
            const next = NEXT_STATUS[order.status];
            const busy = busyId === order.id;
            return (
              <div key={order.id} className="glass" style={{ padding: "1rem 1.125rem", borderRadius: 12, display: "flex", gap: "0.875rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700, fontSize: "0.85rem", color: "var(--accent-2)" }}>{order.code}</span>
                    <span style={{ padding: "0.15rem 0.5rem", borderRadius: 99, fontSize: "0.68rem", fontWeight: 700, background: "var(--bg-3)", color: STATUS_COLOR[order.status] }}>{t(`orders.status.${order.status}`)}</span>
                  </p>
                  <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem", color: "var(--text-1)" }}>
                    {order.lines.map((line) => `${line.productName}${line.variantLabel ? ` — ${line.variantLabel}` : ""} ×${line.quantity}`).join(", ")}
                  </p>
                  <p style={{ margin: "0.3rem 0 0", fontSize: "0.72rem", color: "var(--text-3)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span>{t(`catalog.${order.channel === "other" ? "cart" : order.channel}`)}</span>
                    {order.customerName && <span>· {order.customerName}</span>}
                    {order.customerContact && <span>· {order.customerContact}</span>}
                    {order.createdAt && <span>· {order.createdAt.toLocaleString(intl)}</span>}
                  </p>
                  {order.note && <p style={{ margin: "0.3rem 0 0", fontSize: "0.78rem", color: "var(--text-2)" }}>{order.note}</p>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-1)" }}>
                    {/* The total was stored already converted, in the currency the
                        customer was quoted in, so it is formatted but never
                        converted again here. */}
                    {formatCatalogPrice(order.total, intl, order.currency ?? BASE_CURRENCY)}
                  </span>
                  <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {next && (
                      <button className="btn-primary" type="button" disabled={busy} onClick={() => setStatus(order.id, next.status)}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}>
                        {next.status === "fulfilled" ? <PackageCheck size={13} /> : <CheckCircle2 size={13} />}
                        {t(next.key)}
                      </button>
                    )}
                    {order.status !== "cancelled" && order.status !== "fulfilled" && (
                      <button type="button" disabled={busy} onClick={() => setStatus(order.id, "cancelled")}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "0.4rem 0.75rem", fontSize: "0.75rem", background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 9, color: "var(--red)", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
                        <XCircle size={13} />
                        {t("orders.cancel")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "0.75rem", color: "var(--text-3)", margin: 0 }}>
        <ClipboardList size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        {t("orders.stockNote")}
      </p>
    </div>
  );
}

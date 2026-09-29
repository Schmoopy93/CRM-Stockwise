"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useProducts, useAllStockEvents } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";
import { StockEvent } from "@/lib/types";
import { Filter, TrendingUp, TrendingDown, User, Tag, ExternalLink } from "lucide-react";

const REASONS: Array<{ key: NonNullable<StockEvent["reason"]>; color: string; bg: string }> = [
  { key: "receipt", color: "var(--green)", bg: "var(--green-dim)" },
  { key: "adjustment", color: "var(--accent-2)", bg: "var(--accent-glow)" },
  { key: "sale", color: "#22d3ee", bg: "rgba(34,211,238,0.08)" },
  { key: "return", color: "#a855f7", bg: "rgba(168,85,247,0.1)" },
  { key: "correction", color: "var(--amber)", bg: "var(--amber-dim)" },
];

export default function AuditPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const { products } = useProducts(profile?.shopId);
  const events = useAllStockEvents(profile?.shopId, 90);

  const [actorFilter, setActorFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Derive unique actors from events
  const actors = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of events) map.set(e.actorUid, e.actorName);
    return Array.from(map.entries()).map(([uid, name]) => ({ uid, name }));
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter((e: StockEvent) => {
      if (actorFilter !== "all" && e.actorUid !== actorFilter) return false;
      if (reasonFilter !== "all" && e.reason !== reasonFilter) return false;
      if (productFilter !== "all" && e.productId !== productFilter) return false;
      if ((dateFrom || dateTo) && !e.createdAt) return false;
      if (dateFrom && e.createdAt && e.createdAt < new Date(`${dateFrom}T00:00:00`)) return false;
      if (dateTo && e.createdAt && e.createdAt > new Date(`${dateTo}T23:59:59.999`)) return false;
      return true;
    });
  }, [events, actorFilter, reasonFilter, productFilter, dateFrom, dateTo]);

  const totalIn  = filtered.filter((e) => e.delta > 0).reduce((s, e) => s + e.delta, 0);
  const totalOut = filtered.filter((e) => e.delta < 0).reduce((s, e) => s + Math.abs(e.delta), 0);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  const hasFilters = actorFilter !== "all" || reasonFilter !== "all" || productFilter !== "all" || Boolean(dateFrom || dateTo);
  const dateLocale = locale === "sr" ? "sr-RS" : locale === "ru" ? "ru-RU" : "en-US";

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: 900 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{t("audit.title")}</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-2)", marginTop: 4 }}>{t("audit.subtitle")} · {events.length}</p>
        </div>
        <button
          onClick={() => setShowFilters((p) => !p)}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "0.45rem 0.875rem",
            background: hasFilters ? "var(--accent-glow)" : "var(--bg-3)",
            border: `1px solid ${hasFilters ? "rgba(99,102,241,0.3)" : "var(--border)"}`,
            borderRadius: 9, fontSize: "0.82rem",
            color: hasFilters ? "var(--accent-2)" : "var(--text-2)",
            cursor: "pointer", transition: "all 0.15s",
          }}
        >
          <Filter size={14} />
          {t("audit.filters")}
          {hasFilters && <span style={{ width: 7, height: 7, background: "var(--accent)", borderRadius: "50%", display: "inline-block" }} />}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="glass fade-up" style={{ padding: "1.25rem 1.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.72rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{t("audit.staff")}</label>
            <select className="input" style={{ marginTop: 5, width: "100%", fontSize: "0.82rem" }} value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}>
              <option value="all">{t("all")}</option>
              {actors.map((a) => <option key={a.uid} value={a.uid}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "0.72rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{t("audit.eventType")}</label>
            <select className="input" style={{ marginTop: 5, width: "100%", fontSize: "0.82rem" }} value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}>
              <option value="all">{t("all")}</option>
              {REASONS.map(({ key }) => <option key={key} value={key}>{t(`audit.reason.${key}`)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "0.72rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{t("audit.product")}</label>
            <select className="input" style={{ marginTop: 5, width: "100%", fontSize: "0.82rem" }} value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
              <option value="all">{t("all")}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "0.72rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{t("audit.from")}</label>
            <input className="input" type="date" style={{ marginTop: 5, width: "100%", fontSize: "0.82rem" }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: "0.72rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{t("audit.to")}</label>
            <input className="input" type="date" style={{ marginTop: 5, width: "100%", fontSize: "0.82rem" }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          {hasFilters && (
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                onClick={() => { setActorFilter("all"); setReasonFilter("all"); setProductFilter("all"); setDateFrom(""); setDateTo(""); }}
                style={{ padding: "0.45rem 0.75rem", background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: "0.78rem", color: "var(--red)", cursor: "pointer", width: "100%" }}
              >
                {t("audit.clearFilters")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="audit-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.875rem" }}>
        {[
          { icon: <Tag size={15} />, label: t("audit.events"), value: filtered.length, color: "var(--accent-2)", bg: "var(--accent-glow)" },
          { icon: <TrendingUp size={15} />, label: t("audit.unitsIn"), value: `+${totalIn}`, color: "var(--green)", bg: "var(--green-dim)" },
          { icon: <TrendingDown size={15} />, label: t("audit.unitsOut"), value: `-${totalOut}`, color: "var(--red)", bg: "var(--red-dim)" },
        ].map(({ icon, label, value, color, bg }) => (
          <div key={label} className="glass" style={{ padding: "0.875rem 1.1rem", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, background: bg, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
              {icon}
            </div>
            <div>
              <p style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0, color: "var(--text-1)", lineHeight: 1 }}>{value}</p>
              <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: "2px 0 0" }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Event table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)", fontSize: "0.875rem", border: "1px dashed var(--border)", borderRadius: 14 }}>
          {t("audit.noneMatch")}
        </div>
      ) : (
        <div className="glass" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr>
                  {["audit.time", "audit.productVariant", "audit.type", "audit.change", "audit.staffColumn"].map((key) => (
                    <th key={key} style={{ textAlign: "left", padding: "0.75rem 1rem", color: "var(--text-3)", fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => {
                  const reason = REASONS.find((item) => item.key === (e.reason ?? "adjustment")) ?? REASONS[1];
                  return (
                    <tr key={e.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none", transition: "background 0.1s" }}
                      onMouseOver={(ev) => (ev.currentTarget as HTMLTableRowElement).style.background = "var(--bg-3)"}
                      onMouseOut={(ev) => (ev.currentTarget as HTMLTableRowElement).style.background = "transparent"}>
                      <td style={{ padding: "0.7rem 1rem", color: "var(--text-3)", whiteSpace: "nowrap" }}>
                        {e.createdAt
                          ? <>
                              <span style={{ color: "var(--text-2)" }}>{e.createdAt.toLocaleDateString(dateLocale)}</span>
                              {" "}
                              <span style={{ fontSize: "0.75rem" }}>{e.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            </>
                          : "—"}
                      </td>
                      <td style={{ padding: "0.7rem 1rem" }}>
                        <Link href={`/dashboard/products/${e.productId}`} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-1)", fontWeight: 500 }}>
                          {productName(e.productId)}
                          <ExternalLink size={11} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                        </Link>
                        <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: "2px 0 0" }}>{e.variantLabel}</p>
                      </td>
                      <td style={{ padding: "0.7rem 1rem" }}>
                        <span className="badge" style={{ background: reason.bg, color: reason.color, border: "none", fontSize: "0.72rem" }}>{t(`audit.reason.${reason.key}`)}</span>
                      </td>
                      <td style={{ padding: "0.7rem 1rem" }}>
                        <span style={{ fontWeight: 700, fontSize: "1rem", color: e.delta > 0 ? "var(--green)" : "var(--red)" }}>
                          {e.delta > 0 ? "+" : ""}{e.delta}
                        </span>
                      </td>
                      <td style={{ padding: "0.7rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 24, height: 24, background: "var(--accent-glow)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <User size={11} style={{ color: "var(--accent-2)" }} />
                          </div>
                          <span style={{ color: "var(--text-2)", fontSize: "0.8rem" }}>{e.actorName}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

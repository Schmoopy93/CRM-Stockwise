"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useProducts, useAllStockEvents } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import { TrendingDown, TrendingUp, Activity, Package } from "lucide-react";

function formatDay(date: Date) {
  return date.toLocaleDateString("sr-RS", { day: "2-digit", month: "2-digit" });
}

export default function AnalyticsPage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const { products } = useProducts(profile?.shopId);
  const events = useAllStockEvents(profile?.shopId, 30);

  // Events per day (last 14 days)
  const activityData = useMemo(() => {
    const days: Record<string, { date: string; dodano: number; skinuto: number }> = {};
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = formatDay(d);
      days[key] = { date: key, dodano: 0, skinuto: 0 };
    }
    for (const ev of events) {
      if (!ev.createdAt) continue;
      const key = formatDay(ev.createdAt);
      if (!days[key]) continue;
      if (ev.delta > 0) days[key].dodano += ev.delta;
      else days[key].skinuto += Math.abs(ev.delta);
    }
    return Object.values(days);
  }, [events]);

  // Top 10 products by movement
  const topMovers = useMemo(() => {
    const counts: Record<string, { name: string; total: number }> = {};
    for (const ev of events) {
      if (!counts[ev.productId]) {
        const prod = products.find((p) => p.id === ev.productId);
        counts[ev.productId] = { name: prod?.name ?? ev.productId, total: 0 };
      }
      counts[ev.productId].total += Math.abs(ev.delta);
    }
    return Object.values(counts)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [events, products]);

  // Low stock
  const lowStock = products.filter((p) => p.minStock > 0 && p.totalQuantity <= p.minStock);

  // Totals
  const totalIn = events.filter((e) => e.delta > 0).reduce((s, e) => s + e.delta, 0);
  const totalOut = events.filter((e) => e.delta < 0).reduce((s, e) => s + Math.abs(e.delta), 0);

  const ACCENT_COLORS = ["#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe", "#e0e7ff", "#4f46e5", "#4338ca", "#3730a3"];

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{t("analytics.title")}</h1>
        <p style={{ fontSize: "0.82rem", color: "var(--text-2)", marginTop: 4 }}>{t("analytics.subtitle")}</p>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
        {[
          { icon: <Package size={16} />, label: t("analytics.products"), value: products.length, color: "#6366f1", bg: "rgba(99,102,241,0.1)" },
          { icon: <Activity size={16} />, label: t("analytics.changes"), value: events.length, color: "#22d3ee", bg: "rgba(34,211,238,0.1)" },
          { icon: <TrendingUp size={16} />, label: t("analytics.received"), value: totalIn, color: "var(--green)", bg: "var(--green-dim)" },
          { icon: <TrendingDown size={16} />, label: t("analytics.issued"), value: totalOut, color: lowStock.length > 0 ? "var(--amber)" : "var(--red)", bg: lowStock.length > 0 ? "var(--amber-dim)" : "var(--red-dim)" },
        ].map(({ icon, label, value, color, bg }) => (
          <div key={label} className="glass" style={{ padding: "1.1rem 1.25rem", display: "flex", alignItems: "center", gap: "0.875rem" }}>
            <div style={{ width: 36, height: 36, background: bg, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
              {icon}
            </div>
            <div>
              <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-1)", lineHeight: 1 }}>{value}</p>
              <p style={{ fontSize: "0.72rem", color: "var(--text-2)", margin: "2px 0 0" }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Activity chart */}
      <div className="glass" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 1.25rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {t("analytics.activity")}
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={activityData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: "var(--text-2)" }}
            />
            <Area type="monotone" dataKey="dodano" name="Primljeno" stroke="#22c55e" strokeWidth={2} fill="url(#gIn)" />
            <Area type="monotone" dataKey="skinuto" name="Izdato" stroke="#6366f1" strokeWidth={2} fill="url(#gOut)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>

        {/* Top movers */}
        <div className="glass" style={{ padding: "1.5rem" }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 1.25rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Najaktivniji artikli
          </h2>
          {topMovers.length === 0 ? (
            <p style={{ color: "var(--text-3)", fontSize: "0.82rem", textAlign: "center", padding: "2rem 0" }}>Nema podataka</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topMovers} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "var(--text-2)" }} axisLine={false} tickLine={false} width={90} />
                <Tooltip
                  contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                />
                <Bar dataKey="total" name="Promjena" radius={[0, 4, 4, 0]}>
                  {topMovers.map((_, i) => <Cell key={i} fill={ACCENT_COLORS[i % ACCENT_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Low stock list */}
        <div className="glass" style={{ padding: "1.5rem" }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 1.25rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Nisko stanje ({lowStock.length})
          </h2>
          {lowStock.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--green)", fontSize: "0.875rem" }}>
              ✓ Svi artikli imaju dovoljno stanja
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: 220, overflow: "auto" }}>
              {lowStock.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <p style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-1)", margin: 0 }}>{p.name}</p>
                    <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: "1px 0 0" }}>Min: {p.minStock}</p>
                  </div>
                  <span style={{ fontWeight: 700, color: "var(--amber)", fontSize: "1.1rem" }}>{p.totalQuantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

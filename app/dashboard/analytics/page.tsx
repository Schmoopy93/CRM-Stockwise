"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useProducts, useStockEventsInRange, useCatalogStats, useSales, useShopMoney } from "@/lib/hooks";
import { INTL_LOCALES, Locale, useI18n } from "@/lib/i18n-context";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line,
} from "recharts";
import { TrendingDown, TrendingUp, Activity, AlertCircle, Package, Eye, MessageCircle, Send, AtSign, Share2, Percent, ShoppingBag, DollarSign } from "lucide-react";

function formatDay(date: Date, locale: Locale) {
  return date.toLocaleDateString(INTL_LOCALES[locale], { day: "2-digit", month: "2-digit" });
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type ActivityRange = "30days" | "90days" | "12months" | "year";
type ActivityGroup = "day" | "week" | "month";

const CHANNEL_COLORS = { whatsapp: "#25d366", telegram: "#229ed9", instagram: "#dd2a7b" } as const;

function CatalogStatsSection({ shopId, locale }: { shopId: string | undefined; locale: Locale }) {
  const { t } = useI18n();
  const stats = useCatalogStats(shopId, 30);

  const totals = useMemo(() => stats.reduce(
    (sum, day) => ({
      views: sum.views + day.views,
      whatsapp: sum.whatsapp + day.whatsapp,
      telegram: sum.telegram + day.telegram,
      instagram: sum.instagram + day.instagram,
      share: sum.share + day.share,
      orders: sum.orders + day.orders,
    }),
    { views: 0, whatsapp: 0, telegram: 0, instagram: 0, share: 0, orders: 0 }
  ), [stats]);

  const chartData = useMemo(() => {
    const byDay = new Map(stats.map((day) => [day.day, day]));
    const now = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (13 - i)));
      const row = byDay.get(date.toISOString().slice(0, 10));
      return { date: formatDay(date, locale), whatsapp: row?.whatsapp ?? 0, telegram: row?.telegram ?? 0, instagram: row?.instagram ?? 0 };
    });
  }, [stats, locale]);

  const clicks = totals.whatsapp + totals.telegram + totals.instagram;
  const conversion = totals.views > 0 ? Math.round((clicks / totals.views) * 100) : 0;

  return (
    <div className="glass" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div>
        <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-2)", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {t("analytics.catalogTitle")}
        </h2>
        <p style={{ fontSize: "0.75rem", color: "var(--text-3)", margin: "4px 0 0" }}>{t("analytics.catalogSubtitle")}</p>
      </div>

      <div className="analytics-stats" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.75rem" }}>
        {[
          { icon: <Eye size={15} />, label: t("analytics.catalogViews"), value: totals.views, color: "#6366f1" },
          { icon: <MessageCircle size={15} />, label: "WhatsApp", value: totals.whatsapp, color: CHANNEL_COLORS.whatsapp },
          { icon: <Send size={15} />, label: "Telegram", value: totals.telegram, color: CHANNEL_COLORS.telegram },
          { icon: <AtSign size={15} />, label: "Instagram", value: totals.instagram, color: CHANNEL_COLORS.instagram },
          { icon: <Share2 size={15} />, label: t("analytics.catalogShares"), value: totals.share, color: "#22d3ee" },
          { icon: <ShoppingBag size={15} />, label: t("orders.title"), value: totals.orders, color: "#a855f7" },
          { icon: <Percent size={15} />, label: t("analytics.catalogConversion"), value: `${conversion}%`, color: "var(--green)" },
        ].map(({ icon, label, value, color }) => (
          <div key={label} style={{ padding: "0.85rem 1rem", borderRadius: 12, background: "var(--bg-3)", display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "var(--text-2)" }}>
              <span style={{ color, display: "flex" }}>{icon}</span>
              {label}
            </span>
            <p style={{ fontSize: "1.35rem", fontWeight: 700, margin: 0, color: "var(--text-1)", lineHeight: 1 }}>{value}</p>
          </div>
        ))}
      </div>

      {totals.views === 0 && clicks === 0 ? (
        <p style={{ color: "var(--text-3)", fontSize: "0.82rem", textAlign: "center", padding: "1.5rem 0", margin: 0 }}>{t("analytics.catalogEmpty")}</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: "var(--text-2)" }}
              cursor={{ fill: "var(--bg-3)" }}
            />
            <Bar dataKey="whatsapp" name="WhatsApp" stackId="clicks" fill={CHANNEL_COLORS.whatsapp} />
            <Bar dataKey="telegram" name="Telegram" stackId="clicks" fill={CHANNEL_COLORS.telegram} />
            <Bar dataKey="instagram" name="Instagram" stackId="clicks" fill={CHANNEL_COLORS.instagram} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const [range, setRange] = useState<ActivityRange>("12months");
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [today] = useState(() => {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return date;
  });
  const dateRange = useMemo(() => {
    const from = new Date(today);
    from.setHours(0, 0, 0, 0);
    if (range === "30days") {
      from.setDate(from.getDate() - 29);
      return { from, to: today };
    }
    if (range === "90days") {
      from.setDate(from.getDate() - 89);
      return { from, to: today };
    }
    if (range === "12months") {
      from.setDate(1);
      from.setMonth(from.getMonth() - 11);
      return { from, to: today };
    }
    from.setFullYear(selectedYear, 0, 1);
    const to = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
    if (selectedYear === today.getFullYear()) to.setTime(today.getTime());
    return { from, to };
  }, [range, selectedYear, today]);
  const activityGroup: ActivityGroup = range === "30days" ? "day" : range === "90days" ? "week" : "month";
  const { events, loading: eventsLoading, error: eventsError } = useStockEventsInRange(
    profile?.shopId,
    dateRange.from,
    dateRange.to
  );
  const { products } = useProducts(profile?.shopId);
  const { sales } = useSales(profile?.shopId, 500);
  const { money } = useShopMoney(profile?.shopId, INTL_LOCALES[locale]);

  // Revenue data filtered to selected date range
  const revenueData = useMemo(() => {
    const buckets = new Map<string, { date: string; revenue: number }>();
    const cursor = new Date(dateRange.from);
    if (activityGroup === "week") cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    else if (activityGroup === "month") cursor.setDate(1);
    while (cursor <= dateRange.to) {
      const key = activityGroup === "month"
        ? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
        : activityGroup === "week" ? dateKey(cursor) : dateKey(cursor);
      const label = activityGroup === "month"
        ? cursor.toLocaleDateString(INTL_LOCALES[locale], { month: "short" })
        : formatDay(cursor, locale);
      buckets.set(key, { date: label, revenue: 0 });
      if (activityGroup === "month") cursor.setMonth(cursor.getMonth() + 1);
      else if (activityGroup === "week") cursor.setDate(cursor.getDate() + 7);
      else cursor.setDate(cursor.getDate() + 1);
    }
    for (const sale of sales) {
      if (!sale.createdAt) continue;
      const d = sale.createdAt;
      if (d < dateRange.from || d > dateRange.to) continue;
      const key = activityGroup === "month"
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : activityGroup === "week"
          ? (() => { const m = new Date(d); m.setHours(0,0,0,0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return dateKey(m); })()
          : dateKey(d);
      const bucket = buckets.get(key);
      if (bucket) bucket.revenue = Math.round((bucket.revenue + sale.total) * 100) / 100;
    }
    return [...buckets.values()];
  }, [sales, dateRange, activityGroup, locale]);

  const totalRevenue = useMemo(
    () => sales.filter((s) => s.createdAt && s.createdAt >= dateRange.from && s.createdAt <= dateRange.to)
      .reduce((sum, s) => sum + s.total, 0),
    [sales, dateRange]
  );

  // Use daily, weekly, and monthly buckets as the selected period grows.
  const activityData = useMemo(() => {
    const buckets = new Map<string, { date: string; received: number; issued: number }>();
    const cursor = new Date(dateRange.from);
    if (activityGroup === "week") {
      cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    } else if (activityGroup === "month") {
      cursor.setDate(1);
    }
    const bucketEnd = dateRange.to;
    while (cursor <= bucketEnd) {
      const key = activityGroup === "month"
        ? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
        : activityGroup === "week"
          ? dateKey(cursor)
          : dateKey(cursor);
      const label = activityGroup === "month"
        ? cursor.toLocaleDateString(INTL_LOCALES[locale], { month: "short" })
        : formatDay(cursor, locale);
      buckets.set(key, { date: label, received: 0, issued: 0 });
      if (activityGroup === "month") cursor.setMonth(cursor.getMonth() + 1);
      else if (activityGroup === "week") cursor.setDate(cursor.getDate() + 7);
      else cursor.setDate(cursor.getDate() + 1);
    }

    for (const ev of events) {
      if (!ev.createdAt) continue;
      const eventDate = ev.createdAt;
      const key = activityGroup === "month"
        ? `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, "0")}`
        : activityGroup === "week"
          ? (() => {
            const monday = new Date(eventDate);
            monday.setHours(0, 0, 0, 0);
            monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
            return dateKey(monday);
          })()
          : dateKey(eventDate);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      if (ev.delta > 0) bucket.received += ev.delta;
      else bucket.issued += Math.abs(ev.delta);
    }
    return [...buckets.values()];
  }, [events, dateRange, activityGroup, locale]);

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
  const yearOptions = Array.from({ length: 11 }, (_, index) => today.getFullYear() - index);
  const rangeLabel = range === "year"
    ? String(selectedYear)
    : t(`analytics.range.${range}`);

  const ACCENT_COLORS = ["#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe", "#e0e7ff", "#4f46e5", "#4338ca", "#3730a3"];

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{t("analytics.title")}</h1>
        <p style={{ fontSize: "0.82rem", color: "var(--text-2)", marginTop: 4 }}>{t("analytics.subtitle", { range: rangeLabel })}</p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        {(["30days", "90days", "12months", "year"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={range === value}
            onClick={() => setRange(value)}
            style={{
              padding: "0.45rem 0.8rem",
              fontSize: "0.78rem",
              fontWeight: 650,
              cursor: "pointer",
              borderRadius: 999,
              background: range === value ? "var(--accent-glow)" : "var(--bg-2)",
              border: `1px solid ${range === value ? "rgba(99,102,241,0.3)" : "var(--border)"}`,
              color: range === value ? "var(--accent-2)" : "var(--text-2)",
            }}
          >
            {t(`analytics.range.${value}`)}
          </button>
        ))}
        {range === "year" && (
          <select
            className="input"
            value={selectedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
            aria-label={t("analytics.selectYear")}
            style={{ width: "auto", minWidth: 110 }}
          >
            {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        )}
        <span style={{ fontSize: "0.75rem", color: "var(--text-3)", marginLeft: "0.25rem" }}>
          {dateRange.from.toLocaleDateString(INTL_LOCALES[locale])} – {dateRange.to.toLocaleDateString(INTL_LOCALES[locale])}
        </span>
      </div>

      {eventsError && (
        <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "0.75rem 0.9rem", fontSize: "0.82rem", color: "var(--red)" }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          {t("analytics.loadFailed")}
        </div>
      )}

      {/* Stats row */}
      <div className="analytics-stats" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1rem" }}>
        {[
          { icon: <Package size={16} />, label: t("analytics.products"), value: products.length, color: "#6366f1", bg: "rgba(99,102,241,0.1)", isLoading: false },
          { icon: <Activity size={16} />, label: t("analytics.changes"), value: events.length, color: "#22d3ee", bg: "rgba(34,211,238,0.1)", isLoading: true },
          { icon: <TrendingUp size={16} />, label: t("analytics.received"), value: totalIn, color: "var(--green)", bg: "var(--green-dim)", isLoading: true },
          { icon: <TrendingDown size={16} />, label: t("analytics.issued"), value: totalOut, color: lowStock.length > 0 ? "var(--amber)" : "var(--red)", bg: lowStock.length > 0 ? "var(--amber-dim)" : "var(--red-dim)", isLoading: true },
          { icon: <DollarSign size={16} />, label: t("analytics.revenue"), value: money(totalRevenue, { minimumFractionDigits: 2 }), color: "#a855f7", bg: "rgba(168,85,247,0.1)", isLoading: false },
        ].map(({ icon, label, value, color, bg, isLoading }) => (
          <div key={label} className="glass" style={{ padding: "1.1rem 1.25rem", display: "flex", alignItems: "center", gap: "0.875rem" }}>
            <div style={{ width: 36, height: 36, background: bg, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
              {icon}
            </div>
            <div>
              <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-1)", lineHeight: 1 }}>
                {eventsLoading && isLoading ? "—" : value}
              </p>
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
        {eventsLoading ? (
          <p style={{ color: "var(--text-3)", fontSize: "0.82rem", textAlign: "center", padding: "2rem 0", margin: 0 }}>{t("analytics.loading")}</p>
        ) : activityData.every((day) => day.received === 0 && day.issued === 0) ? (
          <p style={{ color: "var(--text-3)", fontSize: "0.82rem", textAlign: "center", padding: "2rem 0", margin: 0 }}>{t("analytics.noData")}</p>
        ) : (
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
            <Area type="monotone" dataKey="received" name={t("analytics.chartIn")} stroke="#22c55e" strokeWidth={2} fill="url(#gIn)" />
            <Area type="monotone" dataKey="issued" name={t("analytics.chartOut")} stroke="#6366f1" strokeWidth={2} fill="url(#gOut)" />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </div>

      {/* Revenue chart */}
      <div className="glass" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 1.25rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {t("analytics.revenueTitle")}
        </h2>
        {revenueData.every((d) => d.revenue === 0) ? (
          <p style={{ color: "var(--text-3)", fontSize: "0.82rem", textAlign: "center", padding: "2rem 0", margin: 0 }}>{t("analytics.revenueEmpty")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={revenueData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "var(--text-2)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "0.5rem 0.75rem", fontSize: 12 }}>
                      <p style={{ margin: "0 0 4px", color: "var(--text-2)" }}>{label}</p>
                      <p style={{ margin: 0, color: "#a855f7", fontWeight: 600 }}>{money(Number(payload[0].value), { minimumFractionDigits: 2 })}</p>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#a855f7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="analytics-panels" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>

        {/* Top movers */}
        <div className="glass" style={{ padding: "1.5rem" }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 1.25rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("analytics.topMovers")}
          </h2>
          {eventsLoading ? (
            <p style={{ color: "var(--text-3)", fontSize: "0.82rem", textAlign: "center", padding: "2rem 0" }}>{t("analytics.loading")}</p>
          ) : topMovers.length === 0 ? (
            <p style={{ color: "var(--text-3)", fontSize: "0.82rem", textAlign: "center", padding: "2rem 0" }}>{t("analytics.noData")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topMovers} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "var(--text-2)" }} axisLine={false} tickLine={false} width={90} />
                <Tooltip
                  contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                />
                <Bar dataKey="total" name={t("analytics.topMoversChange")} radius={[0, 4, 4, 0]}>
                  {topMovers.map((_, i) => <Cell key={i} fill={ACCENT_COLORS[i % ACCENT_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Low stock list */}
        <div className="glass" style={{ padding: "1.5rem" }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 1.25rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("analytics.lowStockCount", { n: lowStock.length })}
          </h2>
          {lowStock.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--green)", fontSize: "0.875rem" }}>
              {t("analytics.allGood")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: 220, overflow: "auto" }}>
              {lowStock.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <p style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-1)", margin: 0 }}>{p.name}</p>
                    <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: "1px 0 0" }}>{t("analytics.minStock")} {p.minStock}</p>
                  </div>
                  <span style={{ fontWeight: 700, color: "var(--amber)", fontSize: "1.1rem" }}>{p.totalQuantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CatalogStatsSection shopId={profile?.shopId} locale={locale} />
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useProducts, useStockEventsInRange, useCatalogStats, useSalesInRange, useStornoedSaleIds, useShopMoney } from "@/lib/hooks";
import { INTL_LOCALES, Locale, useI18n } from "@/lib/i18n-context";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line,
} from "recharts";
import { TrendingDown, TrendingUp, Activity, AlertCircle, Package, Eye, MessageCircle, Send, AtSign, Share2, Percent, ShoppingBag, DollarSign, Coins } from "lucide-react";
import StatTiles, { type StatTile } from "@/components/StatTiles";
import Select from "@/components/Select";
import styles from "./analytics.module.css";

function formatDay(date: Date, locale: Locale) {
  return date.toLocaleDateString(INTL_LOCALES[locale], { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type ActivityRange = "30days" | "90days" | "12months" | "year";
type ActivityGroup = "day" | "week" | "month";

const CHANNEL_COLORS = { whatsapp: "#25d366", telegram: "#229ed9", instagram: "#dd2a7b" } as const;

function CatalogStatsSection({ shopId, locale }: { shopId: string | undefined; locale: Locale }) {
  const { t } = useI18n();
  const { stats, loading, error } = useCatalogStats(shopId, 30);

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
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (29 - i)));
      const row = byDay.get(date.toISOString().slice(0, 10));
      return { date: formatDay(date, locale), whatsapp: row?.whatsapp ?? 0, telegram: row?.telegram ?? 0, instagram: row?.instagram ?? 0 };
    });
  }, [stats, locale]);

  const clicks = totals.whatsapp + totals.telegram + totals.instagram;
  const conversion = totals.views > 0 ? Math.round((clicks / totals.views) * 100) : 0;
  const hasActivity = totals.views + clicks + totals.share + totals.orders > 0;

  const tiles: StatTile[] = [
    { icon: <Eye size={15} />, label: t("analytics.catalogViews"), value: totals.views, tone: "var(--accent-2)" },
    { icon: <MessageCircle size={15} />, label: "WhatsApp", value: totals.whatsapp, tone: CHANNEL_COLORS.whatsapp },
    { icon: <Send size={15} />, label: "Telegram", value: totals.telegram, tone: CHANNEL_COLORS.telegram },
    { icon: <AtSign size={15} />, label: "Instagram", value: totals.instagram, tone: CHANNEL_COLORS.instagram },
    { icon: <Share2 size={15} />, label: t("analytics.catalogShares"), value: totals.share, tone: "var(--cyan)" },
    { icon: <ShoppingBag size={15} />, label: t("orders.title"), value: totals.orders, tone: "var(--violet)" },
    { icon: <Percent size={15} />, label: t("analytics.catalogConversion"), value: `${conversion}%`, tone: "var(--green)" },
  ];

  return (
    <section className={`glass ${styles.card}`}>
      <div className={styles.cardHead}>
        <div>
          <h2 className={styles.cardTitle}>{t("analytics.catalogTitle")}</h2>
          <p className={styles.cardSub}>{t("analytics.catalogSubtitle")}</p>
        </div>
      </div>

      <div className={styles.catalogStats}>
        {tiles.map(({ icon, label, value, tone }) => (
          <div key={label} className={styles.miniStat}>
            <span className={styles.miniLabel}>
              <span style={{ color: tone, display: "inline-flex" }}>{icon}</span>
              {label}
            </span>
            <p className={styles.miniValue}>{loading ? "…" : error ? "—" : value}</p>
          </div>
        ))}
      </div>

      {error ? (
        <p role="alert" className={`${styles.muted} ${styles.mutedAlert}`}>{t("analytics.catalogLoadFailed")}</p>
      ) : loading ? (
        <p role="status" className={styles.muted}>{t("analytics.catalogLoading")}</p>
      ) : !hasActivity ? (
        <p className={styles.muted}>{t("analytics.catalogEmpty")}</p>
      ) : (
        <div className={styles.catalogChart}>
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
        </div>
      )}
    </section>
  );
}

const RANGES: ActivityRange[] = ["30days", "90days", "12months", "year"];

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
  // Analytics needs every sale in the period, not just the latest N — a shop
  // with thousands of sales would silently lose old revenue otherwise. The
  // hook widens its server window on its own while the period is full.
  const { sales, truncated } = useSalesInRange(profile?.shopId, dateRange.from, dateRange.to);
  const { money } = useShopMoney(profile?.shopId, INTL_LOCALES[locale]);

  // A storno annuls its original sale. Analytics leave out both documents — the
  // reversed sale and the storno that points at it — so every period shows only
  // the sales that still stand, regardless of when the reversal happened. The
  // storno set is global, not derived from the period: January can be reversed
  // in March.
  const stornoedIds = useStornoedSaleIds(profile?.shopId);

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
      if (sale.stornoOf || stornoedIds.has(sale.id)) continue;
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
  }, [sales, dateRange, activityGroup, locale, stornoedIds]);

  const totalRevenue = useMemo(
    () => sales.filter((s) => !s.stornoOf && !stornoedIds.has(s.id) && s.createdAt && s.createdAt >= dateRange.from && s.createdAt <= dateRange.to)
      .reduce((sum, s) => sum + s.total, 0),
    [sales, dateRange, stornoedIds]
  );

  const productCosts = useMemo(
    () => new Map(products.map((product) => [product.id, product.costPrice])),
    [products]
  );

  // Profit uses each line's snapshotted purchase price; sales older than the
  // snapshot fall back to the product's current cost. Reversed sales are left
  // out entirely, matching how revenue treats a storno.
  const profitStats = useMemo(() => {
    const costByProduct = productCosts;
    let profit = 0;
    let coveredRevenue = 0;
    let missingCost = false;
    for (const sale of sales) {
      if (sale.stornoOf || stornoedIds.has(sale.id)) continue;
      if (!sale.createdAt || sale.createdAt < dateRange.from || sale.createdAt > dateRange.to) continue;
      for (const line of sale.lines ?? []) {
        const costPrice = line.unitCost ?? costByProduct.get(line.productId);
        if (typeof costPrice === "number") {
          profit += line.quantity * (line.unitPrice - costPrice);
          coveredRevenue += line.quantity * line.unitPrice;
        } else {
          missingCost = true;
        }
      }
    }
    return {
      profit: Math.round(profit * 100) / 100,
      margin: coveredRevenue > 0 ? Math.round((profit / coveredRevenue) * 100) : null,
      missingCost,
    };
  }, [sales, dateRange, productCosts, stornoedIds]);

  const deadStock = useMemo(() => {
    const netSold = new Map<string, number>();
    for (const sale of sales) {
      if (sale.stornoOf || stornoedIds.has(sale.id)) continue;
      if (!sale.createdAt || sale.createdAt < dateRange.from || sale.createdAt > dateRange.to) continue;
      for (const line of sale.lines ?? []) {
        netSold.set(line.productId, (netSold.get(line.productId) ?? 0) + line.quantity);
      }
    }
    return products
      .filter((product) => product.totalQuantity > 0 && (netSold.get(product.id) ?? 0) <= 0)
      .map((product) => ({
        ...product,
        tiedValue: (product.costPrice ?? product.salePrice ?? 0) * product.totalQuantity,
      }))
      .sort((a, b) => b.tiedValue - a.tiedValue);
  }, [products, sales, dateRange, stornoedIds]);

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
      .slice(0, 5);
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

  const tiles: StatTile[] = [
    { icon: <Package size={16} />, label: t("analytics.products"), value: products.length, tone: "var(--accent-2)" },
    { icon: <Activity size={16} />, label: t("analytics.changes"), value: eventsLoading ? "—" : events.length, tone: "var(--cyan)" },
    { icon: <TrendingUp size={16} />, label: t("analytics.received"), value: eventsLoading ? "—" : totalIn, tone: "var(--green)" },
    { icon: <TrendingDown size={16} />, label: t("analytics.issued"), value: eventsLoading ? "—" : totalOut, tone: lowStock.length > 0 ? "var(--amber)" : "var(--red)" },
    { icon: <DollarSign size={16} />, label: t("analytics.revenue"), value: money(totalRevenue, { minimumFractionDigits: 2 }), tone: "var(--violet)" },
    { icon: <Coins size={16} />, label: profitStats.margin !== null ? t("analytics.profitMargin", { pct: profitStats.margin }) : t("analytics.profit"), value: money(profitStats.profit, { minimumFractionDigits: 2 }), tone: "var(--green)" },
  ];

  return (
    <div className={`fade-up ${styles.page}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("analytics.title")}</h1>
        <p className={styles.subtitle}>{t("analytics.subtitle", { range: rangeLabel })}</p>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.chips} role="group" aria-label={t("analytics.title")}>
          {RANGES.map((value) => (
            <button
              key={value}
              type="button"
              className={styles.chip}
              data-active={range === value || undefined}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {t(`analytics.range.${value}`)}
            </button>
          ))}
        </div>
        {range === "year" && (
          <Select
            className={styles.yearSelect}
            value={String(selectedYear)}
            onChange={(next) => setSelectedYear(Number(next))}
            options={yearOptions.map((year) => ({ value: String(year), label: String(year) }))}
            ariaLabel={t("analytics.selectYear")}
          />
        )}
        <span className={styles.rangeEnd}>
          {dateRange.from.toLocaleDateString(INTL_LOCALES[locale])} – {dateRange.to.toLocaleDateString(INTL_LOCALES[locale])}
        </span>
        {truncated && (
          <p className={styles.warn}>
            <AlertCircle size={13} />
            {t("analytics.salesTruncated")}
          </p>
        )}
      </div>

      {eventsError && (
        <div role="alert" className={styles.alert}>
          <AlertCircle size={15} />
          {t("analytics.loadFailed")}
        </div>
      )}

      <StatTiles items={tiles} size="lg" label={t("analytics.title")} />

      {profitStats.missingCost && (
        <p className={styles.warn}>{t("analytics.profitIncomplete")}</p>
      )}

      <section className={`glass ${styles.card}`}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t("analytics.activity")}</h2>
        </div>
        {eventsLoading ? (
          <p className={styles.muted}>{t("analytics.loading")}</p>
        ) : activityData.every((day) => day.received === 0 && day.issued === 0) ? (
          <p className={styles.muted}>{t("analytics.noData")}</p>
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
      </section>

      <section className={`glass ${styles.card}`}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t("analytics.revenueTitle")}</h2>
        </div>
        {revenueData.every((d) => d.revenue === 0) ? (
          <p className={styles.muted}>{t("analytics.revenueEmpty")}</p>
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
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className={styles.tip}>
                      <p className={styles.tipLabel}>{label}</p>
                      <p className={styles.tipValue}>{money(Number(payload[0].value), { minimumFractionDigits: 2 })}</p>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#a855f7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <div className={styles.panels}>
        <section className={`glass ${styles.card}`}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>{t("analytics.topMovers")}</h2>
          </div>
          {eventsLoading ? (
            <p className={styles.muted}>{t("analytics.loading")}</p>
          ) : topMovers.length === 0 ? (
            <p className={styles.muted}>{t("analytics.noData")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={topMovers} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={({ x, y, payload }) => {
                    const label: string = payload.value.length > 20 ? payload.value.slice(0, 19) + "…" : payload.value;
                    return (
                      <text x={x} y={y} dy={4} textAnchor="end" fill="var(--text-2)" fontSize={10}>
                        {label}
                      </text>
                    );
                  }}
                  axisLine={false}
                  tickLine={false}
                  width={115}
                  interval={0}
                />
                <Tooltip
                  contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                />
                <Bar dataKey="total" name={t("analytics.topMoversChange")} radius={[0, 4, 4, 0]}>
                  {topMovers.map((_, i) => <Cell key={i} fill={ACCENT_COLORS[i % ACCENT_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className={`glass ${styles.card}`}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>{t("analytics.lowStockCount", { n: lowStock.length })}</h2>
          </div>
          {lowStock.length === 0 ? (
            <p className={`${styles.muted} ${styles.mutedGood}`}>{t("analytics.allGood")}</p>
          ) : (
            <div className={styles.list}>
              {lowStock.map((p) => (
                <div key={p.id} className={styles.listRow}>
                  <div className={styles.listMain}>
                    <p className={styles.listName}>{p.name}</p>
                    <p className={styles.listHint}>{t("analytics.minStock")} {p.minStock}</p>
                  </div>
                  <span className={styles.listQty}>{p.totalQuantity}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={`glass ${styles.card}`}>
          <div className={styles.cardHead}>
            <div>
              <h2 className={styles.cardTitle}>{t("analytics.deadStockCount", { n: deadStock.length })}</h2>
              <p className={styles.cardSub}>{t("analytics.deadStockSubtitle")}</p>
            </div>
          </div>
          {deadStock.length === 0 ? (
            <p className={`${styles.muted} ${styles.mutedGood}`}>{t("analytics.deadStockEmpty")}</p>
          ) : (
            <div className={styles.list}>
              {deadStock.map((p) => (
                <div key={p.id} className={styles.listRow}>
                  <div className={styles.listMain}>
                    <p className={styles.listName}>{p.name}</p>
                    <p className={styles.listHint}>
                      {p.tiedValue > 0
                        ? t("analytics.deadStockHint", { value: money(p.tiedValue, { minimumFractionDigits: 2 }) })
                        : t("analytics.deadStockNoValue")}
                    </p>
                  </div>
                  <span className={styles.listQty}>{p.totalQuantity}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <CatalogStatsSection shopId={profile?.shopId} locale={locale} />
    </div>
  );
}

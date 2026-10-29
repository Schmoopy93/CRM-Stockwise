"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CalendarClock,
  CalendarDays,
  Mail,
  Pencil,
  Phone,
  Receipt,
  ShoppingBag,
  Star,
  StickyNote,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { INTL_LOCALES, useI18n } from "@/lib/i18n-context";
import { favoriteProducts, standingSales } from "@/lib/customers";
import { formatCatalogPrice } from "@/lib/catalog-channels";
import StatTiles from "@/components/StatTiles";
import type { CatalogOrder, Customer, OrderStatus, Sale } from "@/lib/types";
import styles from "./customer-detail.module.css";

type Entry = {
  kind: "sale" | "order";
  at: Date | null;
  id: string;
  total: number;
  currency?: string;
  title: string;
  subtitle: string;
  status: string | null;
  statusTone?: OrderStatus;
};

type DayGroup = {
  key: string;
  date: Date | null;
  items: Entry[];
};

interface Props {
  customer: Customer;
  sales: Sale[];
  orders: CatalogOrder[];
  money: (value: number) => string;
  deleting: boolean;
  error: string;
  onEdit: () => void;
  onDelete: () => void;
}

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date: Date | null, intlLocale: string) {
  if (!date) return "—";
  return date.toLocaleDateString(intlLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function CustomerDetailView({ customer, sales, orders, money, deleting, error, onEdit, onDelete }: Props) {
  const { locale, t } = useI18n();
  const intl = INTL_LOCALES[locale];

  const standing = useMemo(() => standingSales(sales), [sales]);

  // Sales and orders arrive as two live queries, so the timeline is assembled
  // here: only one list decides the order, and neither collection has to know
  // the other exists.
  const entries = useMemo<Entry[]>(() => {
    const fromSales: Entry[] = standing.map((sale) => ({
      kind: "sale",
      at: sale.createdAt,
      id: sale.id,
      total: sale.total,
      title: t("customers.activity.sale"),
      subtitle: sale.lines.map((line) => `${line.productName} ×${line.quantity}`).join(", ") || t("customers.activity.noLines"),
      status: t(`sales.channel.${sale.channel}`),
    }));
    const fromOrders: Entry[] = orders.map((order) => ({
      kind: "order",
      at: order.createdAt,
      id: order.id,
      total: order.total,
      currency: order.currency,
      title: t("customers.activity.order"),
      subtitle: order.lines.map((line) => `${line.productName} ×${line.quantity}`).join(", ") || t("customers.activity.noLines"),
      status: t(`orders.status.${order.status}`),
      statusTone: order.status,
    }));
    return [...fromSales, ...fromOrders]
      .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
  }, [standing, orders, t]);

  const groups = useMemo<DayGroup[]>(() => {
    const map = new Map<string, DayGroup>();
    for (const entry of entries) {
      const key = entry.at ? localDayKey(entry.at) : "unknown";
      let group = map.get(key);
      if (!group) {
        group = { key, date: entry.at, items: [] };
        map.set(key, group);
      }
      group.items.push(entry);
    }
    return [...map.values()];
  }, [entries]);

  const spentOnSales = standing.reduce((sum, sale) => sum + sale.total, 0);
  const averagePurchase = standing.length > 0 ? spentOnSales / standing.length : 0;
  const lastPurchase = standing.find((sale) => sale.createdAt)?.createdAt ?? null;
  const favorites = useMemo(() => favoriteProducts(standing), [standing]);

  const tiles = [
    { label: t("customers.totalSpent"), value: money(spentOnSales), icon: <Banknote size={15} />, tone: "var(--accent-2)" },
    { label: t("customers.averagePurchase"), value: standing.length > 0 ? money(averagePurchase) : "—", icon: <TrendingUp size={15} />, tone: "var(--green)" },
    { label: t("customers.salesCount", { n: standing.length }), value: String(standing.length), icon: <Receipt size={15} />, tone: "var(--cyan)" },
    { label: t("customers.ordersCount", { n: orders.length }), value: String(orders.length), icon: <ShoppingBag size={15} />, tone: "var(--violet)" },
    { label: t("customers.lastPurchase"), value: lastPurchase ? lastPurchase.toLocaleDateString(intl) : "—", icon: <CalendarClock size={15} />, tone: "var(--amber)" },
  ];

  return (
    <div className={`fade-up ${styles.page}`}>
      <Link href="/dashboard/customers" className={`pform-back ${styles.back}`}>
        <ArrowLeft size={14} />
        {t("customers.backToList")}
      </Link>

      <div className={`glass ${styles.headerCard}`}>
        <div className={styles.headerTop}>
          <div className={styles.identity}>
            <div className={styles.avatar} aria-hidden="true">
              {customer.name[0]?.toUpperCase() ?? "?"}
            </div>
            <div className={styles.identityText}>
              <div className={styles.nameRow}>
                <h1 className={styles.name}>{customer.name}</h1>
                {customer.tags.map((tag) => <span key={tag} className={styles.tag}>{tag}</span>)}
              </div>
              <div className={styles.contactLine}>
                {customer.contact && (
                  <span className={styles.contactPill}>
                    <Phone size={12} aria-hidden="true" />
                    {customer.contact}
                  </span>
                )}
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className={styles.contactPill}>
                    <Mail size={12} aria-hidden="true" />
                    {customer.email}
                  </a>
                )}
                {customer.createdAt && (
                  <span className={styles.contactPill}>
                    <CalendarDays size={12} aria-hidden="true" />
                    {t("customers.addedOn", { date: customer.createdAt.toLocaleDateString(intl) })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btn} type="button" onClick={onEdit}>
              <Pencil size={14} />
              {t("edit")}
            </button>
            <button type="button" onClick={onDelete} disabled={deleting} className={styles.deleteBtn}>
              <Trash2 size={14} />
              {t("delete")}
            </button>
          </div>
        </div>

        {customer.note && (
          <div className={styles.noteBox}>
            <span className={styles.noteLabel}>
              <StickyNote size={12} aria-hidden="true" />
              {t("customers.note")}
            </span>
            <p className={styles.note}>{customer.note}</p>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className={styles.error}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <StatTiles items={tiles} size="lg" label={t("customers.title")} />

      <section className={`glass ${styles.section}`}>
        <h2 className={styles.sectionTitle}>
          <Star size={15} color="var(--accent-2)" />
          {t("customers.favorites.title")}
        </h2>
        {favorites.length === 0 ? (
          <p className={styles.muted}>{t("customers.favorites.empty")}</p>
        ) : (
          <ul className={styles.favorites}>
            {favorites.map((favorite, index) => {
              const share = spentOnSales > 0 ? Math.round((favorite.spent / spentOnSales) * 100) : 0;
              return (
                <li key={favorite.productId} className={styles.favorite}>
                  <span className={styles.rank} data-top={index === 0} aria-hidden="true">{index + 1}</span>
                  <div className={styles.favoriteMain}>
                    <div className={styles.favoriteTop}>
                      <span className={styles.favoriteName}>{favorite.name}</span>
                      <span className={styles.favoriteMeta}>
                        {t("customers.favorites.units", { n: favorite.units })} · {money(favorite.spent)} · {share}%
                      </span>
                    </div>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        data-top={index === 0}
                        style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label={t("customers.activity.title")}>
        <h2 className={styles.activityTitle}>{t("customers.activity.title")}</h2>
        {groups.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}><ShoppingBag size={20} /></div>
            <p className={styles.emptyBody}>{t("customers.activity.empty")}</p>
          </div>
        ) : (
          <div className={styles.activityList}>
            {groups.map((group) => (
              <div key={group.key} className={styles.dayGroup}>
                <div className={styles.dayHead}>
                  <span className={styles.dayLabel}>{dayLabel(group.date, intl)}</span>
                  <span className={styles.dayCount}>{group.items.length}</span>
                </div>
                <div className={`glass ${styles.dayCard}`}>
                  {group.items.map((entry) => (
                    <div key={`${entry.kind}-${entry.id}`} className={styles.entry} data-kind={entry.kind}>
                      <span className={styles.entryIcon} aria-hidden="true">
                        {entry.kind === "sale" ? <Banknote size={14} /> : <Receipt size={14} />}
                      </span>
                      <span className={styles.entryBody}>
                        <span className={styles.entryTitle}>
                          {entry.title}
                          {entry.status && (
                            <span className={styles.entryStatus} data-status={entry.statusTone}>{entry.status}</span>
                          )}
                        </span>
                        <span className={styles.entrySubtitle}>{entry.subtitle}</span>
                      </span>
                      <span className={styles.entrySide}>
                        <span className={styles.entryAmount}>
                          {/* An order total is already in the currency it was quoted in. */}
                          {entry.currency ? formatCatalogPrice(entry.total, intl, entry.currency) : money(entry.total)}
                        </span>
                        {entry.at && (
                          <time dateTime={entry.at.toISOString()} className={styles.entryTime}>
                            {entry.at.toLocaleTimeString(intl, { hour: "2-digit", minute: "2-digit" })}
                          </time>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

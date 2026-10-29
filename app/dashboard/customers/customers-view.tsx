"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  Banknote,
  CalendarDays,
  ChevronRight,
  Mail,
  Phone,
  Receipt,
  Search,
  ShoppingBag,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { INTL_LOCALES, useI18n } from "@/lib/i18n-context";
import {
  collectTags,
  countNewCustomers,
  customerMatches,
  sortCustomers,
  type CustomerSort,
} from "@/lib/customers";
import { usePagination } from "@/lib/use-pagination";
import CustomerForm from "@/components/CustomerForm";
import ListPagination from "@/components/ListPagination";
import StatTiles from "@/components/StatTiles";
import type { Customer } from "@/lib/types";
import styles from "./customers.module.css";

const SORTS: { value: CustomerSort; key: string }[] = [
  { value: "name", key: "customers.sortName" },
  { value: "newest", key: "customers.sortNewest" },
  { value: "spent", key: "customers.sortSpent" },
];

interface Props {
  shopId: string;
  customers: Customer[];
  loading: boolean;
  spending: Map<string, number>;
  orderCounts: Map<string, number>;
  money: (value: number) => string;
}

export default function CustomersView({ shopId, customers, loading, spending, orderCounts, money }: Props) {
  const { locale, t } = useI18n();
  const intl = INTL_LOCALES[locale];
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<CustomerSort>("name");
  const [formOpen, setFormOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const tags = useMemo(() => collectTags(customers), [customers]);

  const filtered = useMemo(() => {
    const bySearch = customers.filter((customer) => customerMatches(customer, deferredSearch));
    const byTag = tag ? bySearch.filter((customer) => customer.tags.includes(tag)) : bySearch;
    return sortCustomers(byTag, sort, spending);
  }, [customers, deferredSearch, tag, sort, spending]);

  const pager = usePagination(filtered, [deferredSearch, tag, sort]);

  // "New" is measured against the moment the page opened, so the number cannot
  // change while the reader lingers.
  const [openedAt] = useState(() => Date.now());
  const totalSpent = useMemo(
    () => [...spending.values()].reduce((sum, value) => sum + value, 0),
    [spending]
  );

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

  const tiles = [
    { label: t("customers.totalCustomers"), value: String(customers.length), icon: <Users size={15} />, tone: "var(--accent-2)" },
    { label: t("customers.newCustomers"), value: String(countNewCustomers(customers, openedAt)), icon: <UserPlus size={15} />, tone: "var(--green)" },
    { label: t("customers.linkedSales"), value: String(spending.size), icon: <Receipt size={15} />, tone: "var(--cyan)" },
    { label: t("customers.totalSpent"), value: money(totalSpent), icon: <Banknote size={15} />, tone: "var(--amber)" },
  ];

  const resetSearch = () => {
    setSearch("");
    setTag("");
    searchRef.current?.focus();
  };

  return (
    <div className={`fade-up ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("customers.title")}</h1>
          <p className={styles.subtitle}>{t("customers.subtitle")}</p>
        </div>
        <button className={`btn-primary ${styles.newBtn}`} type="button" onClick={() => setFormOpen(true)}>
          <UserPlus size={15} />
          {t("customers.new")}
        </button>
      </header>

      <StatTiles items={tiles} size="lg" label={t("customers.title")} />

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={16} className={styles.searchIcon} aria-hidden="true" />
          <input
            ref={searchRef}
            className={`input ${styles.searchInput}`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("customers.searchPlaceholder")}
            aria-label={t("customers.searchPlaceholder")}
            type="search"
          />
          {search ? (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => {
                setSearch("");
                searchRef.current?.focus();
              }}
              aria-label={t("customers.clearSearch")}
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className={styles.kbd} aria-hidden="true">/</kbd>
          )}
        </div>
        <div className={styles.sortWrap}>
          <ArrowUpDown size={14} aria-hidden="true" />
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(event) => setSort(event.target.value as CustomerSort)}
            aria-label={t("products.sortLabel")}
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>{t(option.key)}</option>
            ))}
          </select>
        </div>
      </div>

      {tags.length > 0 && (
        <div className={styles.chips} role="group" aria-label={t("customers.tags")}>
          <button
            type="button"
            className={styles.chip}
            data-active={tag === ""}
            aria-pressed={tag === ""}
            onClick={() => setTag("")}
          >
            {t("all")}
            <span className={styles.chipCount}>{customers.length}</span>
          </button>
          {tags.map(({ tag: value, count }) => (
            <button
              key={value}
              type="button"
              className={styles.chip}
              data-active={tag === value}
              aria-pressed={tag === value}
              onClick={() => setTag(tag === value ? "" : value)}
            >
              <span className={styles.chipDot} />
              {value}
              <span className={styles.chipCount}>{count}</span>
            </button>
          ))}
        </div>
      )}

      <p className={styles.srOnly} aria-live="polite">
        {t("customers.matched", { n: filtered.length })}
      </p>

      {loading ? (
        <div className={styles.skeletons} aria-label={t("loading")} aria-busy="true">
          {[0, 1, 2, 3].map((index) => <div key={index} className={`glass ${styles.skeleton}`} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            {customers.length === 0 ? <Users size={20} /> : <Search size={20} />}
          </div>
          <p className={styles.emptyTitle}>
            {customers.length === 0 ? t("customers.title") : t("dashboard.noResults")}
          </p>
          <p className={styles.emptyBody}>
            {customers.length === 0 ? t("customers.empty") : t("customers.searchPlaceholder")}
          </p>
          {customers.length === 0 ? (
            <button className={styles.emptyAction} type="button" onClick={() => setFormOpen(true)}>
              <UserPlus size={13} />
              {t("customers.addFirst")}
            </button>
          ) : (
            <button className={styles.emptyAction} type="button" onClick={resetSearch}>
              {t("customers.clearSearch")}
            </button>
          )}
        </div>
      ) : (
        <ul className={styles.list}>
          {pager.visible.map((customer) => {
            const spent = spending.get(customer.id) ?? 0;
            const orderCount = orderCounts.get(customer.id) ?? 0;
            return (
              <li key={customer.id}>
                <Link href={`/dashboard/customers/${customer.id}`} className={`glass ${styles.row}`}>
                  <span className={styles.avatar} aria-hidden="true">
                    {customer.name[0]?.toUpperCase() ?? "?"}
                  </span>
                  <span className={styles.rowBody}>
                    <span className={styles.rowName}>
                      {customer.name}
                      {customer.tags.slice(0, 2).map((value) => (
                        <span key={value} className={styles.rowTag}>{value}</span>
                      ))}
                      {customer.tags.length > 2 && (
                        <span className={styles.moreTags}>+{customer.tags.length - 2}</span>
                      )}
                    </span>
                    <span className={styles.rowMeta}>
                      {customer.contact && (
                        <span className={styles.metaItem}><Phone size={11} aria-hidden="true" />{customer.contact}</span>
                      )}
                      {customer.email && (
                        <span className={styles.metaItem}><Mail size={11} aria-hidden="true" />{customer.email}</span>
                      )}
                      {customer.createdAt && (
                        <span className={styles.metaItem}>
                          <CalendarDays size={11} aria-hidden="true" />
                          {customer.createdAt.toLocaleDateString(intl)}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className={styles.rowStats}>
                    {orderCount > 0 && (
                      <span className={styles.orderPill} title={t("customers.ordersCount", { n: orderCount })}>
                        <ShoppingBag size={11} aria-hidden="true" />
                        {orderCount}
                      </span>
                    )}
                    <span className={styles.spent} data-has-value={spent > 0}>{money(spent)}</span>
                  </span>
                  <ChevronRight size={16} className={styles.rowChevron} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <ListPagination
        page={pager.page}
        totalPages={pager.totalPages}
        totalItems={pager.totalItems}
        shown={pager.visible.length}
        hasMore={pager.hasMore}
        onLoadMore={pager.loadMore}
        onGoToPage={pager.goToPage}
        labels={{
          loadMore: t("paging.loadMore"),
          loading: t("paging.loading"),
          showing: t("paging.showing"),
          of: t("paging.of"),
          page: t("paging.page"),
          prev: t("paging.prev"),
          next: t("paging.next"),
        }}
      />

      {formOpen && (
        <CustomerForm
          shopId={shopId}
          onSaved={() => setFormOpen(false)}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}

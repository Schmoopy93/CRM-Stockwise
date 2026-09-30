"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useCustomers, useSales, useOrders, useShopMoney } from "@/lib/hooks";
import { INTL_LOCALES, useI18n } from "@/lib/i18n-context";
import { collectTags, customerMatches, sortCustomers, type CustomerSort } from "@/lib/customers";
import { usePagination } from "@/lib/use-pagination";
import CustomerForm from "@/components/CustomerForm";
import ListPagination from "@/components/ListPagination";
import { Banknote, Receipt, Search, UserPlus, Users } from "lucide-react";

const SORTS: { value: CustomerSort; key: string }[] = [
  { value: "name", key: "customers.sortName" },
  { value: "newest", key: "customers.sortNewest" },
  { value: "spent", key: "customers.sortSpent" },
];

/** How recent a customer has to be to count as new. Long enough that a shop
 * that signs a customer in spring still recognises them the following winter. */
const NEW_CUSTOMER_DAYS = 30;

export default function CustomersPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const intl = INTL_LOCALES[locale];
  const shopId = profile?.shopId;
  const { customers, loading } = useCustomers(shopId);
  const { sales } = useSales(shopId, 200);
  const { orders } = useOrders(shopId, 200);
  const { money } = useShopMoney(shopId, intl);

  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<CustomerSort>("name");
  const [formOpen, setFormOpen] = useState(false);

  // Spending is the join the shop cannot do by hand: a customer is linked to
  // sales by id, so the totals here follow the same link the detail page uses.
  const spentBy = useMemo(() => {
    const totals = new Map<string, number>();
    for (const sale of sales) {
      if (!sale.customerId) continue;
      totals.set(sale.customerId, (totals.get(sale.customerId) ?? 0) + sale.total);
    }
    return totals;
  }, [sales]);

  const orderCountBy = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of orders) {
      if (!order.customerId) continue;
      counts.set(order.customerId, (counts.get(order.customerId) ?? 0) + 1);
    }
    return counts;
  }, [orders]);

  const tags = useMemo(() => collectTags(customers), [customers]);

  const filtered = useMemo(() => {
    const bySearch = customers.filter((customer) => customerMatches(customer, search));
    const byTag = tag ? bySearch.filter((customer) => customer.tags.includes(tag)) : bySearch;
    return sortCustomers(byTag, sort, spentBy);
  }, [customers, search, tag, sort, spentBy]);

  const pager = usePagination(filtered, [search, tag, sort]);

  // "New" is measured against the moment the page opened. Reading the clock on
  // every render would let the tile change under the reader as they linger, and
  // an unstable value in render is exactly what React's purity rule rejects.
  const [openedAt] = useState(() => Date.now());
  const newCustomers = customers.filter((customer) =>
    (customer.createdAt?.getTime() ?? 0) >= openedAt - NEW_CUSTOMER_DAYS * 86_400_000
  ).length;
  const totalSpent = [...spentBy.values()].reduce((sum, value) => sum + value, 0);

  if (!shopId) return null;

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{t("customers.title")}</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-2)", marginTop: 4 }}>{t("customers.subtitle")}</p>
        </div>
        <button className="btn-primary" type="button" onClick={() => setFormOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "0.5rem 0.9rem", fontSize: "0.8rem" }}>
          <UserPlus size={15} />
          {t("customers.new")}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
        {[
          { label: t("customers.totalCustomers"), value: String(customers.length), icon: <Users size={15} /> },
          { label: t("customers.newCustomers"), value: String(newCustomers), icon: <UserPlus size={15} /> },
          { label: t("customers.linkedSales"), value: String(spentBy.size), icon: <Receipt size={15} /> },
          { label: t("customers.totalSpent"), value: money(totalSpent), icon: <Banknote size={15} /> },
        ].map((tile) => (
          <div key={tile.label} className="glass" style={{ padding: "0.75rem 0.9rem", borderRadius: 12 }}>
            <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.7rem", fontWeight: 600, color: "var(--text-3)", margin: 0 }}>
              {tile.icon}
              {tile.label}
            </p>
            <p style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-1)", margin: "0.25rem 0 0" }}>{tile.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("customers.searchPlaceholder")}
            aria-label={t("customers.searchPlaceholder")}
            style={{ width: "100%", paddingLeft: 30 }}
          />
        </div>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value as CustomerSort)} aria-label={t("products.sortLabel")} style={{ width: "auto" }}>
          {SORTS.map((option) => <option key={option.value} value={option.value}>{t(option.key)}</option>)}
        </select>
      </div>

      {tags.length > 0 && (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            aria-pressed={tag === ""}
            onClick={() => setTag("")}
            style={{
              padding: "0.3rem 0.7rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", borderRadius: 99,
              background: tag === "" ? "var(--accent-glow)" : "transparent",
              border: `1px solid ${tag === "" ? "rgba(99,102,241,0.3)" : "var(--border)"}`,
              color: tag === "" ? "var(--accent-2)" : "var(--text-3)",
            }}
          >
            {t("all")}
          </button>
          {tags.map(({ tag: value, count }) => (
            <button
              key={value}
              type="button"
              aria-pressed={tag === value}
              onClick={() => setTag(tag === value ? "" : value)}
              style={{
                padding: "0.3rem 0.7rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", borderRadius: 99,
                background: tag === value ? "var(--accent-glow)" : "transparent",
                border: `1px solid ${tag === value ? "rgba(99,102,241,0.3)" : "var(--border)"}`,
                color: tag === value ? "var(--accent-2)" : "var(--text-3)",
              }}
            >
              {value} <span style={{ opacity: 0.65 }}>{count}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? null : filtered.length === 0 ? (
        <div style={{ height: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px dashed var(--border)", borderRadius: 16, gap: "0.5rem", color: "var(--text-3)" }}>
          <Users size={28} />
          <span style={{ fontSize: "0.875rem" }}>{customers.length === 0 ? t("customers.empty") : t("dashboard.noResults")}</span>
          {customers.length === 0 && (
            <button className="btn-secondary" type="button" onClick={() => setFormOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, padding: "0.4rem 0.85rem", fontSize: "0.78rem" }}>
              <UserPlus size={13} />
              {t("customers.addFirst")}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {pager.visible.map((customer) => {
            const spent = spentBy.get(customer.id) ?? 0;
            const orderCount = orderCountBy.get(customer.id) ?? 0;
            return (
              <Link
                key={customer.id}
                href={`/dashboard/customers/${customer.id}`}
                className="glass"
                style={{ padding: "0.8rem 1rem", borderRadius: 12, display: "flex", alignItems: "center", gap: "0.875rem", textDecoration: "none", flexWrap: "wrap" }}
              >
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--bg-3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--accent-2)", flexShrink: 0 }}>
                  {customer.name[0]?.toUpperCase() ?? "?"}
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {customer.name}
                    {customer.tags.slice(0, 2).map((value) => (
                      <span key={value} style={{ padding: "0.1rem 0.4rem", borderRadius: 99, fontSize: "0.62rem", fontWeight: 600, background: "var(--bg-3)", color: "var(--text-3)" }}>{value}</span>
                    ))}
                    {customer.tags.length > 2 && <span style={{ fontSize: "0.62rem", color: "var(--text-3)" }}>+{customer.tags.length - 2}</span>}
                  </p>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.72rem", color: "var(--text-3)" }}>
                    {[customer.contact, customer.email, customer.createdAt?.toLocaleDateString(intl)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center", fontSize: "0.72rem", color: "var(--text-3)" }}>
                  {orderCount > 0 && <span>{t("customers.ordersCount", { n: orderCount })}</span>}
                  <span style={{ fontWeight: 700, color: spent > 0 ? "var(--text-1)" : "var(--text-3)" }}>{money(spent)}</span>
                </div>
              </Link>
            );
          })}
        </div>
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

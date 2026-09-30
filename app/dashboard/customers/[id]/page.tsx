"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCustomer, useCustomerActivity, useShopMoney } from "@/lib/hooks";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { deleteCustomer } from "@/lib/actions";
import { formatCatalogPrice } from "@/lib/catalog-channels";
import CustomerForm from "@/components/CustomerForm";
import {
  ArrowLeft,
  Banknote,
  Mail,
  Pencil,
  Phone,
  Receipt,
  ShoppingBag,
  Trash2,
} from "lucide-react";

type Entry =
  | { kind: "sale"; at: Date | null; id: string; total: number; currency?: string; title: string; subtitle: string; status: string | null }
  | { kind: "order"; at: Date | null; id: string; total: number; currency?: string; title: string; subtitle: string; status: string | null };

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const intl = INTL_LOCALES[locale];
  const shopId = profile?.shopId;
  const { customer, loading } = useCustomer(shopId, id);
  const { sales, orders } = useCustomerActivity(shopId, id);
  const { money } = useShopMoney(shopId, intl);

  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // Sales and orders arrive as two live queries, so the timeline is assembled
  // here rather than in either hook: only one list decides the order, and
  // neither collection has to know the other exists.
  const entries = useMemo<Entry[]>(() => {
    const fromSales: Entry[] = sales.map((sale) => ({
      kind: "sale" as const,
      at: sale.createdAt,
      id: sale.id,
      total: sale.total,
      title: t("customers.activity.sale"),
      subtitle: sale.lines.map((line) => `${line.productName} ×${line.quantity}`).join(", ") || t("customers.activity.noLines"),
      status: t(`sales.channel.${sale.channel}`),
    }));
    const fromOrders: Entry[] = orders.map((order) => ({
      kind: "order" as const,
      at: order.createdAt,
      id: order.id,
      total: order.total,
      currency: order.currency,
      title: t("customers.activity.order"),
      subtitle: order.lines.map((line) => `${line.productName} ×${line.quantity}`).join(", ") || t("customers.activity.noLines"),
      status: t(`orders.status.${order.status}`),
    }));
    return [...fromSales, ...fromOrders]
      .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
  }, [sales, orders, t]);

  // A sale total is stored in the base currency; an order total is stored in the
  // currency the customer was quoted in, so it must be formatted and never
  // converted. Mixing the two rules in one place is what makes this readable.
  const spentOnSales = sales.reduce((sum, sale) => sum + sale.total, 0);

  async function remove() {
    if (!shopId) return;
    setDeleting(true); setError("");
    try {
      await deleteCustomer(shopId, id);
      router.replace("/dashboard/customers");
    } catch (cause) {
      setError(translateError(cause, t, "customers.deleteError"));
      setDeleting(false);
    }
  }

  if (!shopId) return null;

  if (loading) return <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>;

  if (!customer) {
    return (
      <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", paddingTop: "3rem" }}>
        <p style={{ fontSize: "0.9rem", color: "var(--text-2)", margin: 0 }}>{t("customers.notFound")}</p>
        <Link href="/dashboard/customers" className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "0.45rem 0.85rem", fontSize: "0.8rem", textDecoration: "none" }}>
          <ArrowLeft size={13} />
          {t("customers.backToList")}
        </Link>
      </div>
    );
  }

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <Link href="/dashboard/customers" className="btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start", padding: "0.35rem 0.7rem", fontSize: "0.75rem", textDecoration: "none" }}>
        <ArrowLeft size={13} />
        {t("customers.backToList")}
      </Link>

      <div className="glass" style={{ padding: "1.1rem 1.25rem", borderRadius: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "0.875rem", alignItems: "center", minWidth: 0 }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--bg-3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "var(--accent-2)", flexShrink: 0 }}>
              {customer.name[0]?.toUpperCase() ?? "?"}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{customer.name}</h1>
              <p style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: "0.75rem", color: "var(--text-3)", margin: "4px 0 0" }}>
                {customer.contact && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} />{customer.contact}</span>}
                {customer.email && (
                  <a href={`mailto:${customer.email}`} style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-3)", textDecoration: "none" }}>
                    <Mail size={11} />{customer.email}
                  </a>
                )}
                {customer.createdAt && <span>{t("customers.addedOn", { date: customer.createdAt.toLocaleDateString(intl) })}</span>}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button className="btn-secondary" type="button" onClick={() => setFormOpen(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "0.4rem 0.8rem", fontSize: "0.78rem" }}>
              <Pencil size={13} />
              {t("edit")}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "0.4rem 0.8rem", fontSize: "0.78rem", background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 9, color: "var(--red)", cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.6 : 1 }}
            >
              <Trash2 size={13} />
              {t("delete")}
            </button>
          </div>
        </div>

        {customer.tags.length > 0 && (
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.9rem" }}>
            {customer.tags.map((tag) => (
              <span key={tag} style={{ padding: "0.15rem 0.55rem", fontSize: "0.7rem", fontWeight: 600, background: "var(--accent-glow)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 99, color: "var(--accent-2)" }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {customer.note && <p style={{ margin: "0.9rem 0 0", fontSize: "0.82rem", color: "var(--text-2)", whiteSpace: "pre-wrap", borderTop: "1px solid var(--border)", paddingTop: "0.9rem" }}>{customer.note}</p>}
      </div>

      {error && <div style={{ background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "0.82rem", color: "var(--red)" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
        {[
          { label: t("customers.totalSpent"), value: money(spentOnSales), icon: <Banknote size={15} /> },
          { label: t("customers.salesCount", { n: sales.length }), value: String(sales.length), icon: <Receipt size={15} /> },
          { label: t("customers.ordersCount", { n: orders.length }), value: String(orders.length), icon: <ShoppingBag size={15} /> },
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

      <div>
        <h2 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-1)", margin: "0 0 0.6rem" }}>{t("customers.activity.title")}</h2>
        {entries.length === 0 ? (
          <div style={{ padding: "1.75rem 1rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", border: "1px dashed var(--border)", borderRadius: 14, color: "var(--text-3)" }}>
            <ShoppingBag size={24} />
            <span style={{ fontSize: "0.82rem", textAlign: "center" }}>{t("customers.activity.empty")}</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
            {entries.map((entry) => (
              <div key={`${entry.kind}-${entry.id}`} className="glass" style={{ padding: "0.7rem 0.9rem", borderRadius: 11, display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--bg-3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", flexShrink: 0 }}>
                  {entry.kind === "sale" ? <Banknote size={13} /> : <Receipt size={13} />}
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 600, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {entry.title}
                    {entry.status && <span style={{ padding: "0.1rem 0.45rem", borderRadius: 99, fontSize: "0.62rem", fontWeight: 600, background: "var(--bg-3)", color: "var(--text-3)" }}>{entry.status}</span>}
                  </p>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.72rem", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{entry.subtitle}</p>
                </div>
                {entry.at && <span style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>{entry.at.toLocaleString(intl)}</span>}
                <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-1)" }}>
                  {/* An order total is already in the currency it was quoted in. */}
                  {entry.currency ? formatCatalogPrice(entry.total, intl, entry.currency) : money(entry.total)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <CustomerForm
          shopId={shopId}
          customer={customer}
          onSaved={() => setFormOpen(false)}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}

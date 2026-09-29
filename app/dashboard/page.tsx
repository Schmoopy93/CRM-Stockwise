"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useProducts } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";
import { Plus, Search, AlertTriangle, Package, TrendingDown, Layers, ArrowRight } from "lucide-react";

export default function DashboardPage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const { products, loading } = useProducts(profile?.shopId);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const categories = ["all", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];
  const lowStock = products.filter((p) => p.minStock > 0 && p.totalQuantity <= p.minStock);
  const totalItems = products.reduce((s, p) => s + p.totalQuantity, 0);
  const inventoryValue = products
    .filter((p) => p.costPrice && p.costPrice > 0)
    .reduce((s, p) => s + (p.costPrice ?? 0) * p.totalQuantity, 0);
  const hasValue = inventoryValue > 0;

  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "all" || p.category === category;
    return matchSearch && matchCat;
  });

  if (loading) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>;

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>
            {profile?.displayName ? t("dashboard.greetingName", { name: profile.displayName.split(" ")[0] }) : t("dashboard.greeting")}
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-2)", marginTop: 4 }}>{t("dashboard.subtitle")}</p>
        </div>
        <Link href="/dashboard/products/new" className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
          <Plus size={15} />{t("dashboard.newProduct")}
        </Link>
      </div>

      {/* Stats */}
      <div className="dashboard-stats" style={{ display: "grid", gridTemplateColumns: `repeat(${hasValue ? 4 : 3}, 1fr)`, gap: "1rem" }}>
        {[
          { icon: <Package size={18} />, label: t("dashboard.totalProducts"), value: products.length, color: "var(--accent)", bg: "rgba(99,102,241,0.08)" },
          { icon: <Layers size={18} />, label: t("dashboard.totalItems"), value: totalItems, color: "#22d3ee", bg: "rgba(34,211,238,0.06)" },
          { icon: <TrendingDown size={18} />, label: t("dashboard.lowStock"), value: lowStock.length, color: lowStock.length > 0 ? "var(--amber)" : "var(--green)", bg: lowStock.length > 0 ? "var(--amber-dim)" : "var(--green-dim)" },
          ...(hasValue ? [{ icon: <span style={{ fontSize: 16 }}>💰</span>, label: t("dashboard.inventoryValue"), value: inventoryValue.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €", color: "#a855f7", bg: "rgba(168,85,247,0.08)" }] : []),
        ].map(({ icon, label, value, color, bg }) => (
          <div key={label} className="glass" style={{ padding: "1.25rem 1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ width: 42, height: 42, background: bg, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>{icon}</div>
            <div>
              <p style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0, color: "var(--text-1)", lineHeight: 1.1 }}>{value}</p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-2)", margin: "2px 0 0" }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {lowStock.length > 0 && (
        <div style={{ background: "var(--amber-dim)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "0.875rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.85rem" }}>
          <AlertTriangle size={16} color="var(--amber)" />
          <span style={{ color: "var(--amber)", fontWeight: 600 }}>{t("dashboard.lowStockAlert", { n: lowStock.length })}:</span>
          <span style={{ color: "var(--text-2)" }}>{lowStock.slice(0, 3).map((p) => p.name).join(", ")}{lowStock.length > 3 && ` +${lowStock.length - 3}`}</span>
        </div>
      )}

      {/* Search */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input className="input" type="text" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: "2.5rem" }} />
        </div>
        {categories.length > 1 && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {categories.map((cat) => (
              <button key={cat} onClick={() => setCategory(cat)}
                style={{ padding: "0.3rem 0.875rem", borderRadius: 99, fontSize: "0.78rem", fontWeight: 600, border: "1px solid", cursor: "pointer", transition: "all 0.15s", background: category === cat ? "var(--accent)" : "transparent", color: category === cat ? "white" : "var(--text-2)", borderColor: category === cat ? "var(--accent)" : "var(--border)" }}>
                {cat === "all" ? t("dashboard.allCategories") : cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem", border: "1px dashed var(--border)", borderRadius: 16, color: "var(--text-3)", fontSize: "0.875rem" }}>
          <Package size={28} />
          {products.length === 0 ? t("dashboard.noProducts") : t("dashboard.noResults")}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
          {filtered.map((product) => {
            const isLow = product.minStock > 0 && product.totalQuantity <= product.minStock;
            return (
              <Link key={product.id} href={`/dashboard/products/${product.id}`} style={{ textDecoration: "none" }}>
                <div className="glass" style={{ padding: "1.25rem", cursor: "pointer", transition: "all 0.2s", position: "relative", overflow: "hidden" }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 30px rgba(0,0,0,0.3)"; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}>
                  {isLow && <div style={{ position: "absolute", top: 0, right: 0, background: "var(--amber)", width: 3, height: "100%", borderRadius: "0 16px 16px 0" }} />}
                  <div style={{ display: "flex", gap: "0.875rem", alignItems: "flex-start", marginBottom: "1rem" }}>
                    {product.imageUrl ? (
                      <Image src={product.imageUrl} alt={product.name} width={44} height={44} style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 44, height: 44, background: "var(--bg-3)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>📦</div>
                    )}
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <p style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.name}</p>
                      {product.sku && <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: "2px 0 0" }}>{product.sku}</p>}
                      {product.category && <span className="badge" style={{ marginTop: 4, background: "var(--bg-3)", color: "var(--text-2)", border: "1px solid var(--border)" }}>{product.category}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: 0 }}>{t("dashboard.stock")}</p>
                      <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: isLow ? "var(--amber)" : "var(--text-1)", lineHeight: 1.1 }}>
                        {product.totalQuantity}{isLow && <AlertTriangle size={13} style={{ display: "inline", marginLeft: 5, verticalAlign: "middle" }} />}
                      </p>
                    </div>
                    <ArrowRight size={16} style={{ color: "var(--text-3)" }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

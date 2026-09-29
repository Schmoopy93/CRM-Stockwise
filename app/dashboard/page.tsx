"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useProducts } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";
import { Plus, Search, AlertTriangle, Package, TrendingDown, Layers, ArrowRight, DollarSign } from "lucide-react";

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

  const stats = [
    { icon: Package, label: t("dashboard.totalProducts"), value: products.length, color: "#6366f1", bg: "rgba(99,102,241,0.1)" },
    { icon: Layers, label: t("dashboard.totalItems"), value: totalItems, color: "#22d3ee", bg: "rgba(34,211,238,0.08)" },
    { icon: TrendingDown, label: t("dashboard.lowStock"), value: lowStock.length, color: lowStock.length > 0 ? "var(--amber)" : "var(--green)", bg: lowStock.length > 0 ? "var(--amber-dim)" : "var(--green-dim)" },
    ...(hasValue ? [{ icon: DollarSign, label: t("dashboard.inventoryValue"), value: inventoryValue.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €", color: "#a855f7", bg: "rgba(168,85,247,0.1)" }] : []),
  ];

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0, color: "var(--text-1)", letterSpacing: "-0.03em" }}>
            {profile?.displayName ? t("dashboard.greetingName", { name: profile.displayName.split(" ")[0] }) : t("dashboard.greeting")}
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-3)", marginTop: 3 }}>{t("dashboard.subtitle")}</p>
        </div>
        <Link href="/dashboard/products/new" className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none", fontSize: "0.875rem" }}>
          <Plus size={15} />{t("dashboard.newProduct")}
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: "0.875rem" }} className="dashboard-stats">
        {stats.map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.25rem 1.4rem", display: "flex", alignItems: "center", gap: "1rem", transition: "border-color 0.2s" }}
            onMouseOver={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = color + "44"; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; }}
          >
            <div style={{ width: 44, height: 44, background: bg, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={19} color={color} strokeWidth={2} />
            </div>
            <div>
              <p style={{ fontSize: "1.65rem", fontWeight: 800, margin: 0, color: "var(--text-1)", lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</p>
              <p style={{ fontSize: "0.73rem", color: "var(--text-3)", margin: "4px 0 0", fontWeight: 500 }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div style={{ background: "var(--amber-dim)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 12, padding: "0.875rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <AlertTriangle size={15} color="var(--amber)" strokeWidth={2.5} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "0.83rem", color: "var(--amber)", fontWeight: 700 }}>{t("dashboard.lowStockAlert", { n: lowStock.length })}:</span>
          <span style={{ fontSize: "0.83rem", color: "var(--text-2)" }}>{lowStock.slice(0, 3).map((p) => p.name).join(", ")}{lowStock.length > 3 && ` +${lowStock.length - 3}`}</span>
        </div>
      )}

      {/* Search + categories */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input className="input" type="text" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: "2.5rem" }} />
        </div>
        {categories.length > 1 && (
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {categories.map((cat) => (
              <button key={cat} onClick={() => setCategory(cat)} style={{
                padding: "0.28rem 0.85rem", borderRadius: 99, fontSize: "0.76rem", fontWeight: 600,
                border: "1px solid", cursor: "pointer", transition: "all 0.15s",
                background: category === cat ? "var(--accent)" : "transparent",
                color: category === cat ? "white" : "var(--text-3)",
                borderColor: category === cat ? "var(--accent)" : "var(--border)",
              }}>
                {cat === "all" ? t("dashboard.allCategories") : cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product grid */}
      {filtered.length === 0 ? (
        <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem", border: "1px dashed var(--border)", borderRadius: 16, color: "var(--text-3)", fontSize: "0.875rem" }}>
          <Package size={30} strokeWidth={1.5} />
          {products.length === 0 ? t("dashboard.noProducts") : t("dashboard.noResults")}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "0.875rem" }}>
          {filtered.map((product) => {
            const isLow = product.minStock > 0 && product.totalQuantity <= product.minStock;
            return (
              <Link key={product.id} href={`/dashboard/products/${product.id}`} style={{ textDecoration: "none" }}>
                <div style={{
                  background: "var(--bg-2)", border: `1px solid ${isLow ? "rgba(245,158,11,0.3)" : "var(--border)"}`,
                  borderRadius: 16, padding: "1.1rem 1.2rem", cursor: "pointer",
                  transition: "all 0.18s", height: "100%", display: "flex", flexDirection: "column", gap: "0.875rem",
                }}
                  onMouseOver={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 8px 28px rgba(0,0,0,0.15)"; el.style.borderColor = isLow ? "rgba(245,158,11,0.5)" : "rgba(99,102,241,0.3)"; }}
                  onMouseOut={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "none"; el.style.boxShadow = "none"; el.style.borderColor = isLow ? "rgba(245,158,11,0.3)" : "var(--border)"; }}
                >
                  {/* Top row */}
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                    {product.imageUrl ? (
                      <Image src={product.imageUrl} alt={product.name} width={42} height={42} style={{ width: 42, height: 42, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 42, height: 42, background: "var(--bg-3)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>📦</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.name}</p>
                      {product.sku && <p style={{ fontSize: "0.71rem", color: "var(--text-3)", margin: "2px 0 0", fontFamily: "monospace" }}>{product.sku}</p>}
                      {product.category && (
                        <span style={{ display: "inline-block", marginTop: 5, padding: "2px 8px", borderRadius: 99, fontSize: "0.67rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", background: "var(--bg-3)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
                          {product.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bottom row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                    <div>
                      <p style={{ fontSize: "0.68rem", color: "var(--text-3)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{t("dashboard.stock")}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                        {isLow && <AlertTriangle size={12} color="var(--amber)" strokeWidth={2.5} />}
                        <p style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0, color: isLow ? "var(--amber)" : "var(--text-1)", lineHeight: 1, letterSpacing: "-0.02em" }}>
                          {product.totalQuantity}
                        </p>
                      </div>
                    </div>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--bg-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ArrowRight size={14} color="var(--text-3)" />
                    </div>
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

"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useProducts } from "@/lib/hooks";
import { Plus, Search, AlertTriangle, ArrowRight, Package } from "lucide-react";

export default function ProductsListPage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const { products, loading } = useProducts(profile?.shopId);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"name" | "qty">("name");

  const categories = ["all", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

  const filtered = products
    .filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
      const matchCat = category === "all" || p.category === category;
      return matchSearch && matchCat;
    })
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : a.totalQuantity - b.totalQuantity);

  if (loading) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>;

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0, color: "var(--text-1)", letterSpacing: "-0.03em" }}>{t("products.title")}</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginTop: 3 }}>{t("products.count", { n: products.length })}</p>
        </div>
        <Link href="/dashboard/products/new" className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none", fontSize: "0.875rem" }}>
          <Plus size={15} /> {t("products.new")}
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input className="input" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: "2.3rem" }} />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "name" | "qty")}
          className="input"
          style={{ width: "auto", paddingLeft: "0.875rem", paddingRight: "0.875rem" }}
        >
          <option value="name">{t("products.sortName")}</option>
          <option value="qty">{t("products.sortQuantity")}</option>
        </select>
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
              {cat === "all" ? t("products.allCategories") : cat}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ height: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem", border: "1px dashed var(--border)", borderRadius: 16, color: "var(--text-3)", fontSize: "0.875rem" }}>
          <Package size={28} strokeWidth={1.5} />
          {t("products.empty")}
        </div>
      ) : (
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          {/* Header row */}
          <div className="product-list-header" style={{ display: "grid", gridTemplateColumns: "1fr 130px 110px 90px 36px", padding: "0.65rem 1.25rem", borderBottom: "1px solid var(--border)", fontSize: "0.68rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>
            <span>{t("products.columnProduct")}</span>
            <span>{t("products.columnCategory")}</span>
            <span>{t("products.columnSku")}</span>
            <span style={{ textAlign: "right" }}>{t("products.columnStock")}</span>
            <span />
          </div>

          {filtered.map((p, i) => {
            const isLow = p.minStock > 0 && p.totalQuantity <= p.minStock;
            return (
              <Link
                key={p.id}
                href={`/dashboard/products/${p.id}`}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 130px 110px 90px 36px",
                  padding: "0.8rem 1.25rem",
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none",
                  textDecoration: "none", alignItems: "center",
                  transition: "background 0.12s",
                  background: isLow ? "rgba(245,158,11,0.03)" : "transparent",
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "var(--bg-3)")}
                onMouseOut={(e) => (e.currentTarget.style.background = isLow ? "rgba(245,158,11,0.03)" : "transparent")}
              >
                {/* Name + image */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                  {p.imageUrl ? (
                    <Image src={p.imageUrl} alt={p.name} width={34} height={34} style={{ width: 34, height: 34, borderRadius: 9, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 34, height: 34, background: "var(--bg-3)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>📦</div>
                  )}
                  <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                </div>

                {/* Category */}
                <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
                  {p.category ? (
                    <span style={{ padding: "2px 8px", borderRadius: 99, background: "var(--bg-3)", border: "1px solid var(--border)", fontSize: "0.7rem", fontWeight: 600 }}>{p.category}</span>
                  ) : "—"}
                </span>

                {/* SKU */}
                <span style={{ fontSize: "0.78rem", color: "var(--text-3)", fontFamily: "monospace" }}>{p.sku || "—"}</span>

                {/* Stock */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                  {isLow && <AlertTriangle size={12} color="var(--amber)" strokeWidth={2.5} />}
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: isLow ? "var(--amber)" : "var(--text-1)" }}>{p.totalQuantity}</span>
                </div>

                {/* Arrow */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ArrowRight size={14} color="var(--text-3)" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

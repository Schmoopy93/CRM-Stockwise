"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useProducts } from "@/lib/hooks";
import { Plus, Search, AlertTriangle, ArrowRight } from "lucide-react";

export default function ProductsListPage() {
  const { profile } = useAuth();
  const { products, loading } = useProducts(profile?.shopId);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("sve");
  const [sort, setSort] = useState<"name" | "qty">("name");

  const categories = ["sve", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

  const filtered = products
    .filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
      const matchCat = category === "sve" || p.category === category;
      return matchSearch && matchCat;
    })
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : a.totalQuantity - b.totalQuantity);

  if (loading) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>;

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>Svi artikli</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-2)", marginTop: 4 }}>{products.length} artikala</p>
        </div>
        <Link href="/dashboard/products/new" className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
          <Plus size={15} /> Novi artikal
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input className="input" placeholder="Pretraži..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: "2.3rem" }} />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "name" | "qty")}
          style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 10, padding: "0.6rem 1rem", fontSize: "0.85rem", color: "var(--text-1)", outline: "none", cursor: "pointer" }}
        >
          <option value="name">Sortiraj: Naziv</option>
          <option value="qty">Sortiraj: Količina ↑</option>
        </select>
      </div>

      {categories.length > 1 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                padding: "0.3rem 0.875rem", borderRadius: 99, fontSize: "0.78rem", fontWeight: 600,
                border: "1px solid", cursor: "pointer", transition: "all 0.15s",
                background: category === cat ? "var(--accent)" : "transparent",
                color: category === cat ? "white" : "var(--text-2)",
                borderColor: category === cat ? "var(--accent)" : "var(--border)",
              }}
            >
              {cat === "sve" ? "Sve" : cat}
            </button>
          ))}
        </div>
      )}

      {/* Table-style list */}
      {filtered.length === 0 ? (
        <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed var(--border)", borderRadius: 16, color: "var(--text-3)", fontSize: "0.875rem" }}>
          Nema artikala
        </div>
      ) : (
        <div className="glass" style={{ overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 80px 40px", padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)", fontSize: "0.72rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
            <span>Artikal</span><span>Kategorija</span><span>SKU</span><span style={{ textAlign: "right" }}>Stanje</span><span />
          </div>
          {filtered.map((p, i) => {
            const isLow = p.minStock > 0 && p.totalQuantity <= p.minStock;
            return (
              <Link
                key={p.id}
                href={`/dashboard/products/${p.id}`}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 120px 100px 80px 40px",
                  padding: "0.875rem 1.25rem",
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none",
                  textDecoration: "none",
                  alignItems: "center",
                  transition: "background 0.12s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  {p.imageUrl ? (
                    <Image src={p.imageUrl} alt={p.name} width={32} height={32} style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 32, height: 32, background: "var(--bg-3)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>📦</div>
                  )}
                  <span style={{ fontWeight: 500, fontSize: "0.875rem", color: "var(--text-1)" }}>{p.name}</span>
                </div>
                <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>{p.category || "—"}</span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-3)", fontFamily: "monospace" }}>{p.sku || "—"}</span>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                  {isLow && <AlertTriangle size={12} color="var(--amber)" />}
                  <span style={{ fontWeight: 700, color: isLow ? "var(--amber)" : "var(--text-1)", fontSize: "0.95rem" }}>{p.totalQuantity}</span>
                </div>
                <ArrowRight size={14} color="var(--text-3)" style={{ justifySelf: "center" }} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

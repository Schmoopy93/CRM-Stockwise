"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useProducts } from "@/lib/hooks";
import { usePagination } from "@/lib/use-pagination";
import ListPagination from "@/components/ListPagination";
import CategoriesManager from "@/components/CategoriesManager";
import { Plus, Search, AlertTriangle, ArrowRight, Package, X, Tags } from "lucide-react";

export default function ProductsListPage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const { products, loading } = useProducts(profile?.shopId);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"name" | "qty">("name");
  const [manageOpen, setManageOpen] = useState(false);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))],
    [products]
  );
  const categoryNames = categories.filter((c) => c !== "all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
        const matchCat = category === "all" || p.category === category;
        return matchSearch && matchCat;
      })
      .slice()
      .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : a.totalQuantity - b.totalQuantity));
  }, [products, search, category, sort]);

  const pagingLabels = {
    loadMore: t("paging.loadMore"),
    loading: t("paging.loading"),
    showing: t("paging.showing"),
    of: t("paging.of"),
    page: t("paging.page"),
    prev: t("paging.prev"),
    next: t("paging.next"),
  };

  const paging = usePagination(filtered, [search, category, sort, products.length]);

  if (loading)
    return (
      <div className="fade-up products-page" aria-busy="true" aria-live="polite">
        <div className="products-skeleton products-skeleton--head" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="products-skeleton" style={{ animationDelay: `${i * 65}ms` }} />
        ))}
      </div>
    );

  return (
    <div className="fade-up products-page">

      {/* Header */}
      <header className="products-head">
        <div className="products-head-text">
          <h1 className="products-title">{t("products.title")}</h1>
          <p className="products-subtitle">{t("products.count", { n: products.length })}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {categoryNames.length > 0 && (
            <button onClick={() => setManageOpen(true)} title={t("categories.manage")} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", fontWeight: 600, padding: "0.55rem 0.9rem", borderRadius: 10, cursor: "pointer", background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
              <Tags size={14} />
              <span>{t("categories.manage")}</span>
            </button>
          )}
          <Link href="/dashboard/products/new" className="btn-primary products-new-btn">
            <Plus size={15} />
            <span>{t("products.new")}</span>
          </Link>
        </div>
      </header>

      {/* Sticky filters */}
      <div className="products-filters">
        <div className="products-search">
          <Search size={15} className="products-search-icon" />
          <input
            className="input products-search-input"
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t("search")}
          />
          {search && (
            <button className="products-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "name" | "qty")}
          className="input products-sort"
          aria-label={t("products.sortName")}
        >
          <option value="name">{t("products.sortName")}</option>
          <option value="qty">{t("products.sortQuantity")}</option>
        </select>

        {categoryNames.length > 0 && (
          <div className="products-chips">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setCategory(cat)} className="products-chip" data-active={category === cat}>
                {cat === "all" ? t("products.allCategories") : cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {manageOpen && profile && (
        <CategoriesManager
          shopId={profile.shopId}
          categories={categoryNames}
          onRenamed={(oldName) => { if (category === oldName) setCategory("all"); }}
          onClose={() => setManageOpen(false)}
        />
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="products-empty">
          <Package size={28} strokeWidth={1.5} />
          <span>{t("products.empty")}</span>
        </div>
      ) : (
        <div className="products-list">
          <div className="products-list-head" aria-hidden="true">
            <span>{t("products.columnProduct")}</span>
            <span>{t("products.columnCategory")}</span>
            <span>{t("products.columnSku")}</span>
            <span className="products-cell-qty">{t("products.columnStock")}</span>
            <span />
          </div>

          {paging.visible.map((p, i) => {
            const isLow = p.minStock > 0 && p.totalQuantity <= p.minStock;
            return (
              <Link
                key={p.id}
                href={`/dashboard/products/${p.id}`}
                className="products-row"
                data-low={isLow || undefined}
                data-last={i === paging.visible.length - 1 || undefined}
              >
                <div className="products-cell-main">
                  {p.imageUrl ? (
                    <Image src={p.imageUrl} alt={p.name} width={40} height={40} className="products-thumb" />
                  ) : (
                    <div className="products-thumb products-thumb--empty" aria-hidden="true">📦</div>
                  )}
                  <span className="products-name">{p.name}</span>
                </div>

                <div className="products-cell-cat">
                  {p.category ? <span className="products-badge">{p.category}</span> : <span className="products-dash">—</span>}
                </div>

                <div className="products-cell-sku">
                  {p.sku ? <span className="products-sku">{p.sku}</span> : <span className="products-dash">—</span>}
                </div>

                <div className="products-cell-qty" data-low={isLow || undefined}>
                  {isLow && <AlertTriangle size={13} color="var(--amber)" strokeWidth={2.5} />}
                  <span className="products-qty">{p.totalQuantity}</span>
                </div>

                <ArrowRight size={15} className="products-arrow" />
              </Link>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <ListPagination
          page={paging.page}
          totalPages={paging.totalPages}
          totalItems={paging.totalItems}
          shown={paging.visible.length}
          hasMore={paging.hasMore}
          onLoadMore={paging.loadMore}
          onGoToPage={paging.goToPage}
          labels={pagingLabels}
        />
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { INTL_LOCALES, useI18n } from "@/lib/i18n-context";
import { useProducts, useShopMoney } from "@/lib/hooks";
import { usePagination } from "@/lib/use-pagination";
import ListPagination from "@/components/ListPagination";
import CategoriesManager from "@/components/CategoriesManager";
import { Plus, Search, AlertTriangle, ArrowRight, Package, X, Tags, Boxes, Layers3, CircleAlert, LayoutGrid, List as ListIcon } from "lucide-react";

type SortKey = "name" | "qty" | "priceAsc" | "priceDesc";

/** Products without a price sort after priced ones rather than being treated as
 * zero, so a half-filled catalogue still orders by price. */
function comparePrice(a: number | undefined, b: number | undefined, direction: 1 | -1) {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  return (a - b) * direction;
}

export default function ProductsListPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const { products, loading } = useProducts(profile?.shopId);
  const { money } = useShopMoney(profile?.shopId, INTL_LOCALES[locale]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [view, setView] = useState<"grid" | "list">("list");
  const [manageOpen, setManageOpen] = useState(false);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))],
    [products]
  );
  const categoryNames = categories.filter((c) => c !== "all");
  const totalUnits = products.reduce((sum, product) => sum + product.totalQuantity, 0);
  const lowStockCount = products.filter((product) => product.minStock > 0 && product.totalQuantity <= product.minStock).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = products.filter((p) => {
      const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
      const matchCat = category === "all" || p.category === category;
      return matchSearch && matchCat;
    });
    if (sort === "priceAsc") return matched.slice().sort((a, b) => comparePrice(a.salePrice, b.salePrice, 1));
    if (sort === "priceDesc") return matched.slice().sort((a, b) => comparePrice(a.salePrice, b.salePrice, -1));
    return matched.slice().sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : a.totalQuantity - b.totalQuantity));
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
        <div className="products-head-actions">
          {categoryNames.length > 0 && (
            <button type="button" onClick={() => setManageOpen(true)} title={t("categories.manage")} className="products-manage-btn">
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

      <section className="products-overview" aria-label={t("products.title")}>
        <div className="products-stat">
          <span className="products-stat-icon" data-tone="green"><Boxes size={17} /></span>
          <span className="products-stat-copy">
            <span className="products-stat-label">{t("products.columnStock")}</span>
            <strong className="products-stat-value">{totalUnits.toLocaleString(INTL_LOCALES[locale])}</strong>
          </span>
        </div>
        <div className="products-stat">
          <span className="products-stat-icon" data-tone="blue"><Layers3 size={17} /></span>
          <span className="products-stat-copy">
            <span className="products-stat-label">{t("products.columnCategory")}</span>
            <strong className="products-stat-value">{categoryNames.length}</strong>
          </span>
        </div>
        <div className="products-stat" data-alert={lowStockCount > 0 || undefined}>
          <span className="products-stat-icon" data-tone="amber"><CircleAlert size={17} /></span>
          <span className="products-stat-copy">
            <span className="products-stat-label">{t("analytics.lowStock")}</span>
            <strong className="products-stat-value">{lowStockCount}</strong>
          </span>
        </div>
      </section>

      {/* Filters */}
      <div className="products-filters">
        <div className="products-filter-row">
          <div className="products-search">
            <Search size={16} className="products-search-icon" />
            <input
              className="input products-search-input"
              placeholder={t("search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("search")}
            />
            {search && (
              <button type="button" className="products-search-clear" onClick={() => setSearch("")} aria-label={t("catalog.close")}>
                <X size={13} />
              </button>
            )}
          </div>
          <label className="products-sort-wrap">
            <span>{t("products.sortLabel")}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="input products-sort"
              aria-label={t("products.sortLabel")}
            >
              <option value="name">{t("products.sortName")}</option>
              <option value="qty">{t("products.sortQuantity")}</option>
              <option value="priceAsc">{t("products.sortPriceAsc")}</option>
              <option value="priceDesc">{t("products.sortPriceDesc")}</option>
            </select>
          </label>
          <div className="products-view-toggle" role="group" aria-label={t("products.viewLabel")}>
            <button type="button" onClick={() => setView("grid")} aria-label={t("products.viewGrid")} title={t("products.viewGrid")} aria-pressed={view === "grid"}>
              <LayoutGrid size={17} />
            </button>
            <button type="button" onClick={() => setView("list")} aria-label={t("products.viewList")} title={t("products.viewList")} aria-pressed={view === "list"}>
              <ListIcon size={18} />
            </button>
          </div>
        </div>

        {categoryNames.length > 0 && (
          <div className="products-chips" role="tablist" aria-label={t("products.allCategories")}>
            {categories.map((cat) => (
              <button key={cat} type="button" role="tab" aria-selected={category === cat} onClick={() => setCategory(cat)} className="products-chip" data-active={category === cat}>
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
        <div className="products-list" data-view={view}>
          <div className="products-list-head" aria-hidden="true">
            <span>{t("products.columnProduct")}</span>
            <span>{t("products.columnCategory")}</span>
            <span>{t("products.columnSku")}</span>
            <span>{t("products.columnPrice")}</span>
            <span className="products-cell-qty">{t("products.columnStock")}</span>
            <span />
          </div>

          {paging.visible.map((p, i) => {
            const isLow = p.minStock > 0 && p.totalQuantity <= p.minStock;
            if (view === "grid") {
              return (
                <Link key={p.id} href={`/dashboard/products/${p.id}`} className="products-card" data-low={isLow || undefined}>
                  <div className="products-card-media">
                    {p.imageUrl ? (
                      <Image src={p.imageUrl} alt={p.name} fill sizes="(max-width: 760px) 50vw, 320px" className="products-card-img" />
                    ) : (
                      <div className="products-card-placeholder"><Package size={30} strokeWidth={1.4} /></div>
                    )}
                    {p.category && <span className="products-card-category">{p.category}</span>}
                  </div>
                  <div className="products-card-body">
                    {isLow && (
                      <span className="products-card-alert">
                        <AlertTriangle size={12} />
                        {t("analytics.lowStock")}
                      </span>
                    )}
                    <h2 className="products-card-name">{p.name}</h2>
                    <div className="products-card-sku">
                      {p.sku && <><span>{t("products.columnSku")}</span><code>{p.sku}</code></>}
                    </div>
                    <div className="products-card-footer">
                      <div className="products-card-price">
                        <span>{t("products.columnPrice")}</span>
                        <strong>{p.salePrice !== undefined ? money(p.salePrice) : "—"}</strong>
                      </div>
                      <div className="products-card-stock" data-low={isLow || undefined}>
                        <span>{t("products.columnStock")}</span>
                        <strong>{p.totalQuantity}</strong>
                      </div>
                      <span className="products-card-arrow" aria-hidden="true"><ArrowRight size={16} /></span>
                    </div>
                  </div>
                </Link>
              );
            }
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
                    <Image src="/android-chrome-512x512.png" alt="" aria-hidden="true" width={40} height={40} className="products-thumb" />
                  )}
                  <span className="products-name">{p.name}</span>
                </div>

                <div className="products-cell-cat">
                  {p.category ? <span className="products-badge">{p.category}</span> : <span className="products-dash">—</span>}
                </div>

                <div className="products-cell-sku">
                  {p.sku ? <span className="products-sku">{p.sku}</span> : <span className="products-dash">—</span>}
                </div>

                <div className="products-cell-price">
                  {p.salePrice !== undefined ? (
                    <span className="products-price">{money(p.salePrice)}</span>
                  ) : <span className="products-dash">—</span>}
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

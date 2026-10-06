"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCatalog, useShopMoney } from "@/lib/hooks";
import { INTL_LOCALES, useI18n } from "@/lib/i18n-context";
import { channelsFromShop, EMPTY_CHANNELS } from "@/lib/catalog-channels";
import { BASE_CURRENCY, isSupportedCurrency } from "@/lib/currency";
import { trackCatalogEvent } from "@/lib/actions";
import { useAuth } from "@/lib/auth-context";
import { CatalogItem, CatalogStatEvent, ShopCatalogSettings } from "@/lib/types";
import { ArrowUpDown, MessageCircle, Package, Search, ShoppingBag, Sparkles, X } from "lucide-react";
import { setProductParam, useCart, useProductParam } from "./catalog-store";
import CatalogCard, { catalogStockForVariant, fieldText } from "./catalog-card";
import CatalogDetail from "./catalog-detail";
import CatalogCart, { ResolvedCartLine } from "./catalog-cart";
import OrderChannels, { availableChannels } from "./order-channels";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

type SortKey = "name" | "priceAsc" | "priceDesc";

function comparePrice(a: CatalogItem, b: CatalogItem, direction: 1 | -1) {
  if (a.salePrice === undefined) return b.salePrice === undefined ? 0 : 1;
  if (b.salePrice === undefined) return -1;
  return (a.salePrice - b.salePrice) * direction;
}

export default function CatalogView({ shopId }: { shopId: string }) {
  const { t, locale } = useI18n();
  const { user, profile, loading: authLoading } = useAuth();
  const isShopOwner = !authLoading && Boolean(user && profile?.shopId === shopId);
  const showCustomerActions = !authLoading && !isShopOwner;
  const intl = INTL_LOCALES[locale];
  const [shop, setShop] = useState<ShopCatalogSettings | null>(null);
  const [shopLoading, setShopLoading] = useState(true);
  const { items, loading, error: catalogError } = useCatalog(shopId);
  const prices = useShopMoney(shopId, intl);
  const cart = useCart(shopId);
  const productId = useProductParam();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "shops", shopId))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.data();
        if (!data) {
          setShop(null);
          return;
        }
        const currency = data.currency;
        setShop({
          name: data.name ?? "",
          catalogEnabled: data.catalogEnabled === true,
          channels: channelsFromShop(data),
          logoUrl: data.catalogLogoUrl ?? "",
          coverUrl: data.catalogCoverUrl ?? "",
          currency: isSupportedCurrency(currency) ? currency : BASE_CURRENCY,
        });
      })
      .catch(() => { if (!cancelled) setShop(null); })
      .finally(() => { if (!cancelled) setShopLoading(false); });
    return () => { cancelled = true; };
  }, [shopId]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (!shop?.catalogEnabled) return;
    const key = `catalog-viewed-${shopId}-${new Date().toISOString().slice(0, 10)}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    trackCatalogEvent(shopId, "views");
  }, [shop?.catalogEnabled, shopId]);

  const track = useCallback((event: CatalogStatEvent) => trackCatalogEvent(shopId, event), [shopId]);

  const notify = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }, []);

  const closeDetail = useCallback(() => setProductParam(null), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  const name = shop?.name ?? "";
  const catalogEnabled = shop?.catalogEnabled === true;
  const channels = shop?.channels ?? EMPTY_CHANNELS;
  const hasChannels = availableChannels(channels).length > 0;
  const logoUrl = catalogEnabled ? shop?.logoUrl ?? "" : "";
  const coverUrl = catalogEnabled ? shop?.coverUrl ?? "" : "";

  const visible = useMemo(() => items.filter((item) => !item.hidden), [items]);
  const itemsById = useMemo(() => new Map(visible.map((item) => [item.id, item])), [visible]);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of visible) if (item.category) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return [["all", visible.length] as const, ...Array.from(counts.entries())];
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = visible.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!q) return true;
      const searchable = [
        item.name,
        item.category,
        ...item.variants,
        ...item.fields.flatMap((field) => {
          const { label, value } = fieldText(field, locale, t);
          return [label, value];
        }),
      ].join(" ").toLowerCase();
      return searchable.includes(q);
    });
    if (sort === "priceAsc") return [...matches].sort((a, b) => comparePrice(a, b, 1));
    if (sort === "priceDesc") return [...matches].sort((a, b) => comparePrice(a, b, -1));
    return matches;
  }, [visible, search, category, sort, locale, t]);

  const selected = productId ? itemsById.get(productId) ?? null : null;
  const cartLines: ResolvedCartLine[] = cart.lines.flatMap((line) => {
    const item = itemsById.get(line.itemId);
    return item ? [{
      item,
      variant: line.variant,
      variantId: line.variantId ?? item.variantIds?.[item.variants.indexOf(line.variant)],
      quantity: line.quantity,
      availableQuantity: item.variants.length > 0
        ? catalogStockForVariant(item, line.variantId
          ? item.variantIds?.indexOf(line.variantId) ?? -1
          : item.variants.indexOf(line.variant))
        : item.stockQuantity ?? 0,
    }] : [];
  });
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartPriced = cartLines.every((line) => line.item.salePrice !== undefined);
  const cartTotal = cartLines.reduce((sum, line) => sum + (line.item.salePrice ?? 0) * line.quantity, 0);
  const initials = name.trim().slice(0, 1).toUpperCase() || "•";

  function addToCart(item: CatalogItem, variant: string, quantity: number, variantId = item.variantIds?.[item.variants.indexOf(variant)]) {
    const variantIndex = variantId ? item.variantIds?.indexOf(variantId) ?? -1 : item.variants.indexOf(variant);
    const availableQuantity = item.variants.length > 0
      ? catalogStockForVariant(item, variantIndex)
      : item.stockQuantity ?? 0;
    const existingQuantity = cart.lines.find((line) => line.itemId === item.id &&
      (variantId ? line.variantId === variantId || (!line.variantId && line.variant === variant) : line.variant === variant))?.quantity ?? 0;
    if (availableQuantity <= 0 || existingQuantity + quantity > availableQuantity) {
      notify(t("catalog.stockChanged"));
      return;
    }
    cart.add(item.id, variant, quantity, variantId);
    notify(t("catalog.added"));
  }

  function quickAdd(item: CatalogItem) {
    if (item.variants.length > 1) setProductParam(item.id);
    else addToCart(item, item.variants[0] ?? "", 1);
  }

  return (
    <div className="cat-page">
      <div className="cat-wrap">

        <header className="cat-hero" data-cover={coverUrl ? true : undefined}>
          {coverUrl && (
            <div className="cat-hero-cover">
              <Image src={coverUrl} alt="" fill sizes="(max-width: 1240px) 100vw, 1240px" quality={90} preload style={{ objectFit: "cover" }} />
            </div>
          )}
          <div className="cat-hero-content">
            <div className="cat-hero-main">
              <div className="cat-hero-logo" aria-hidden="true">
                {logoUrl ? <Image src={logoUrl} alt="" fill sizes="80px" quality={90} style={{ objectFit: "cover" }} /> : initials}
              </div>
              <div style={{ minWidth: 0 }}>
                {shopLoading ? (
                  <div className="cat-hero-skel" />
                ) : (
                  <>
                    <h1 className="cat-hero-title">{name || t("catalog.title")}</h1>
                    {catalogEnabled && (
                      <p className="cat-hero-sub">
                        <span className="cat-hero-dot" aria-hidden="true" />
                        {t("catalog.itemCount", { n: visible.length })}
                        {categories.length > 1 && <> · {categories.length - 1} {t("catalog.categoriesLabel").toLowerCase()}</>}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
            {!shopLoading && catalogEnabled && (
              <div className="cat-hero-contact">
                <div className="cat-hero-tools">
                  <ThemeSwitcher className="cat-theme-toggle" lightLabel={t("theme.switchToLight")} darkLabel={t("theme.switchToDark")} />
                </div>
                {showCustomerActions && (
                  <>
                    <Link href={`/catalog/${shopId}/account#shop-chat`} className="cat-ask-shop">
                      <MessageCircle size={15} />
                      {t("chat.askBeforeOrder")}
                    </Link>
                    {hasChannels && (
                      <div className="cat-hero-order-via">
                        <p className="cat-hero-caption">{t("catalog.orderVia")}</p>
                        <OrderChannels channels={channels} onChannelClick={track} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {(shopLoading || loading) ? (
          <div className="cat-grid">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="cat-skel" style={{ animationDelay: `${i * 70}ms` }} />)}
          </div>
        ) : catalogError ? (
          <div className="cat-empty" data-large>
            <Package size={34} strokeWidth={1.5} />
            {t("catalog.loadError")}
          </div>
        ) : !catalogEnabled ? (
          <div className="cat-empty" data-large>
            <Package size={34} strokeWidth={1.5} />
            {t("catalog.notAvailable")}
          </div>
        ) : (
          <>
            <div className="cat-browse">
              <aside className="cat-sidebar" aria-label={t("catalog.categoriesLabel")}>
                <div className="cat-sidebar-heading">
                  <span>{t("catalog.categoriesLabel")}</span>
                  <span className="cat-sidebar-total">{visible.length}</span>
                </div>
                <nav className="cat-category-list" aria-label={t("catalog.categoriesLabel")}>
                  {categories.map(([cat, count]) => (
                    <button key={cat} type="button" aria-current={category === cat ? "true" : undefined}
                      onClick={() => setCategory(cat)} className="cat-category" data-active={category === cat || undefined}>
                      <span className="cat-category-name">{cat === "all" ? t("all") : cat}</span>
                      <span className="cat-category-count">{count}</span>
                    </button>
                  ))}
                </nav>
              </aside>

              <section className="cat-results-area" aria-label={t("catalog.title")}>
                <div className="cat-toolbar">
                  <div className="cat-toolbar-row">
                    <div className="cat-search-wrap">
                      <Search size={17} className="cat-search-icon" />
                      <input className="input cat-search" type="search" placeholder={t("search")} aria-label={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
                      {search && (
                        <button type="button" className="cat-search-clear" onClick={() => setSearch("")} aria-label={t("catalog.close")}><X size={15} /></button>
                      )}
                    </div>
                    <label className="cat-sort">
                      <ArrowUpDown size={16} className="cat-sort-icon" />
                      <span className="cat-sort-label">{t("catalog.sortLabel")}</span>
                      <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label={t("catalog.sortLabel")}>
                        <option value="name">{t("catalog.sortName")}</option>
                        <option value="priceAsc">{t("catalog.sortPriceAsc")}</option>
                        <option value="priceDesc">{t("catalog.sortPriceDesc")}</option>
                      </select>
                    </label>
                  </div>
                  <div className="cat-toolbar-meta">
                    <span className="cat-active-category">{category === "all" ? t("all") : category}</span>
                    <span className="cat-results" aria-live="polite">{t("catalog.itemCount", { n: filtered.length })}</span>
                    {(search || category !== "all") && (
                      <button type="button" className="cat-clear-filters" onClick={() => { setSearch(""); setCategory("all"); }}>
                        <X size={13} /> {t("catalog.clearFilters")}
                      </button>
                    )}
                  </div>
                </div>

                {filtered.length === 0 ? (
                  <div className="cat-empty">
                    <Package size={30} strokeWidth={1.5} />
                    {t("dashboard.noResults")}
                  </div>
                ) : (
                  <div className="cat-grid">
                    {filtered.map((item, index) => (
                      <CatalogCard key={item.id} item={item} locale={locale} prices={prices} index={index}
                        canAddToCart={showCustomerActions}
                        onOpen={() => setProductParam(item.id)} onQuickAdd={() => quickAdd(item)} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}

        <footer className="cat-footer">
          {showCustomerActions && (
            <>
              <Link href={`/catalog/${shopId}/account`} className="cat-account-link">
                <MessageCircle size={14} />
                {t("chat.myOrders")}
              </Link>
              <Link href="/" className="cat-footer-cta">
                <Sparkles size={14} />
                {t("catalog.createOwn")}
              </Link>
            </>
          )}
          <Link href="/cookies" className="cat-cookie-link">{t("cookies.title")}</Link>
        </footer>
      </div>

      {showCustomerActions && cartCount > 0 && !cartOpen && (
        <button type="button" className="cat-cart-bar" onClick={() => setCartOpen(true)}>
          <span className="cat-cart-bar-icon">
            <ShoppingBag size={18} />
            <span className="cat-cart-bar-badge">{cartCount}</span>
          </span>
          <span className="cat-cart-bar-label">{t("catalog.cart")}</span>
          {cartPriced && <span className="cat-cart-bar-total">{prices.money(cartTotal)}</span>}
        </button>
      )}

      {selected && (
        <CatalogDetail
          key={selected.id}
          item={selected}
          locale={locale}
          prices={prices}
          shopId={shopId}
          canPurchase={showCustomerActions}
          onClose={closeDetail}
          onAdd={(variant, quantity, variantId) => addToCart(selected, variant, quantity, variantId)}
          onNotify={notify}
          onTrack={track}
        />
      )}

      {showCustomerActions && cartOpen && (
        <CatalogCart
          lines={cartLines}
          locale={locale}
          prices={prices}
          shopId={shopId}
          channels={channels}
          onQuantity={(itemId, variant, quantity, variantId) => cart.setQuantity(itemId, variant, quantity, variantId)}
          onClear={() => { cart.clear(); setCartOpen(false); }}
          onOrderPlaced={() => cart.clear()}
          onClose={closeCart}
          onNotify={notify}
          onTrack={track}
        />
      )}

      <div className="cat-toast" role="status" aria-live="polite" data-visible={toast ? true : undefined}>{toast}</div>

      <style>{`
        .cat-page {
          --shop-accent: var(--accent); --shop-accent-hover: var(--accent-2); --shop-accent-soft: var(--accent-glow);
          min-height: 100vh; position: relative; overflow-x: clip; background: var(--bg);
        }
        .cat-wrap { max-width: 1320px; margin: 0 auto; padding: 1.5rem 2rem 7rem; position: relative; }

        /* ── Hero ── */
        .cat-hero {
          position: relative; overflow: hidden; min-height: 150px;
          margin-bottom: 1.25rem; border: 1px solid var(--border); border-radius: 12px;
          background: var(--bg-2);
          animation: catRise 0.5s cubic-bezier(0.2, 0.8, 0.3, 1);
        }
        .cat-hero[data-cover] { display: flex; align-items: flex-end; min-height: 320px; background: #111713; }
        .cat-hero-cover { position: absolute; inset: 0; width: 100%; height: 100%; background: var(--bg-3); }
        .cat-hero-cover::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(0deg, rgba(10, 18, 14, 0.88), rgba(10, 18, 14, 0.1) 72%); }
        .cat-hero-content {
          position: relative; z-index: 1; display: flex; align-items: flex-end; justify-content: space-between; gap: 1.5rem; flex-wrap: wrap;
          width: 100%; padding: 1.5rem 1.6rem;
        }
        .cat-hero-main { display: flex; align-items: center; gap: 1rem; min-width: 0; }
        .cat-hero-logo {
          position: relative; overflow: hidden;
          width: 68px; height: 68px; border-radius: 12px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.65rem; font-weight: 750; color: white;
          background: var(--shop-accent); border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .cat-hero-title {
          font-size: 2rem; font-weight: 760; color: var(--text-1); margin: 0;
          letter-spacing: 0; line-height: 1.12; overflow-wrap: anywhere;
        }
        .cat-hero-sub { display: flex; align-items: center; gap: 7px; font-size: 0.8rem; font-weight: 600; color: var(--text-3); margin: 8px 0 0; }
        .cat-hero-dot { width: 7px; height: 7px; border-radius: 99px; background: var(--green); }
        .cat-hero-contact {
          display: flex; align-items: center; justify-content: flex-end; gap: 0.55rem;
          flex-wrap: wrap; padding: 0.45rem; border: 1px solid var(--border);
          border-radius: 13px; background: color-mix(in srgb, var(--bg-2) 88%, transparent);
          box-shadow: 0 5px 18px rgba(0,0,0,0.08);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        }
        .cat-hero-tools { display: flex; align-items: center; padding-right: 0.45rem; border-right: 1px solid var(--border); }
        .cat-theme-toggle { width: 38px !important; height: 38px !important; border-radius: 10px !important; }
        .cat-theme-toggle:hover { border-color: #7664ed !important; transform: translateY(-1px); }
        .cat-hero[data-cover] .cat-hero-contact { background: rgba(20, 20, 29, 0.68); border-color: rgba(255,255,255,0.25); }
        .cat-hero[data-cover] .cat-hero-tools { border-color: rgba(255,255,255,0.22); }
        .cat-hero[data-cover] .cat-theme-toggle { background: rgba(255,255,255,0.94) !important; border-color: rgba(255,255,255,0.65) !important; color: #18231d !important; }
        .cat-hero[data-cover] .cat-theme-toggle:hover { background: #fff !important; }
        .cat-hero-order-via { display: inline-flex; align-items: center; gap: 0.5rem; padding-left: 0.2rem; }
        .cat-ask-shop {
          display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 38px;
          width: fit-content; padding: 0.5rem 0.8rem; border: 1px solid #6551dc;
          border-radius: 9px; background: linear-gradient(135deg, #8069f2, #624bdc); color: #fff;
          box-shadow: 0 4px 13px rgba(99, 77, 220, 0.32);
          font-size: 0.78rem; font-weight: 750; text-decoration: none; white-space: nowrap;
          transition: background 0.16s, border-color 0.16s, transform 0.16s, box-shadow 0.16s;
        }
        .cat-ask-shop:hover { background: linear-gradient(135deg, #907fff, #7159ed); border-color: #8e7cf5; transform: translateY(-1px); box-shadow: 0 6px 18px rgba(99, 77, 220, 0.44); }
        .cat-ask-shop:focus-visible { outline: 2px solid #918aff; outline-offset: 3px; }
        .cat-hero-caption { font-size: 0.68rem; font-weight: 650; color: var(--text-3); margin: 0; }
        .cat-hero[data-cover] .cat-hero-title { color: #fff; }
        .cat-hero[data-cover] .cat-hero-sub, .cat-hero[data-cover] .cat-hero-caption { color: rgba(255, 255, 255, 0.78); }
        .cat-hero[data-cover] .cat-hero-logo { border: 2px solid rgba(255, 255, 255, 0.8); }
        .cat-hero-skel { width: 200px; height: 30px; border-radius: 10px; background: var(--bg-3); animation: pulse 1.4s ease-in-out infinite; }

        /* ── Channels ── */
        .cat-channels { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .cat-channels[data-disabled] { opacity: 0.5; }
        .cat-channel {
          display: inline-flex; align-items: center; justify-content: center; gap: 7px; flex: 0 0 auto;
          min-height: 38px; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 8px;
          background: var(--bg-2); color: var(--text-1); font-size: 0.8rem; font-weight: 650;
          text-decoration: none; white-space: nowrap; transition: border-color 0.16s, background 0.16s, transform 0.16s;
        }
        .cat-channel:hover { transform: translateY(-1px); border-color: var(--shop-accent); background: var(--bg-3); }
        .cat-channel:active { transform: translateY(0); }
        .cat-channel[aria-disabled] { pointer-events: none; }
        .cat-channel[data-channel="whatsapp"] svg { color: #168b55; }
        .cat-channel[data-channel="telegram"] svg { color: #2184ad; }
        .cat-channel[data-channel="instagram"] svg { color: #bf4279; }
        .cat-hero[data-cover] .cat-channel { border-color: rgba(255, 255, 255, 0.35); background: rgba(255, 255, 255, 0.94); color: #18231d; }
        .cat-hint { font-size: 0.72rem; color: var(--text-3); margin: 0; line-height: 1.45; }

        /* ── Category navigation and toolbar ── */
        .cat-browse { display: grid; grid-template-columns: 220px minmax(0, 1fr); align-items: start; gap: 1.1rem; }
        .cat-sidebar {
          position: sticky; top: 1rem; overflow: hidden; padding: 0.8rem;
          background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px;
        }
        .cat-sidebar-heading {
          display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
          padding: 0.25rem 0.45rem 0.7rem; color: var(--text-1); font-size: 0.78rem; font-weight: 750;
        }
        .cat-sidebar-total {
          min-width: 22px; padding: 2px 6px; border-radius: 6px; text-align: center;
          background: var(--bg-3); color: var(--text-3); font-size: 0.68rem; font-variant-numeric: tabular-nums;
        }
        .cat-category-list { display: flex; flex-direction: column; gap: 3px; }
        .cat-category {
          display: flex; align-items: center; justify-content: space-between; gap: 0.6rem;
          width: 100%; min-width: 0; padding: 0.58rem 0.62rem; border: 1px solid transparent; border-radius: 7px;
          background: transparent; color: var(--text-2); text-align: left; cursor: pointer;
          font: inherit; font-size: 0.78rem; transition: background 0.16s, color 0.16s, border-color 0.16s;
        }
        .cat-category:hover { background: var(--bg-3); color: var(--text-1); }
        .cat-category[data-active] {
          background: var(--shop-accent-soft); border-color: color-mix(in srgb, var(--shop-accent) 28%, transparent);
          color: var(--shop-accent); font-weight: 700;
        }
        .cat-category-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cat-category-count {
          flex: 0 0 auto; min-width: 22px; padding: 2px 6px; border-radius: 5px;
          background: var(--bg-3); color: var(--text-3); text-align: center;
          font-size: 0.66rem; font-weight: 700; font-variant-numeric: tabular-nums;
        }
        .cat-category[data-active] .cat-category-count { background: color-mix(in srgb, var(--shop-accent) 14%, var(--bg-2)); color: var(--shop-accent); }
        .cat-results-area { min-width: 0; }

        .cat-toolbar {
          position: sticky; top: 0; z-index: 30; margin: 0 0 1rem; padding: 0.8rem;
          background: color-mix(in srgb, var(--bg-2) 96%, transparent);
          backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
          border: 1px solid var(--border); border-radius: 10px;
          box-shadow: 0 8px 24px color-mix(in srgb, var(--bg) 22%, transparent);
        }
        .cat-toolbar-row { display: flex; gap: 0.65rem; align-items: center; }
        .cat-search-wrap { position: relative; flex: 1; min-width: 0; }
        .cat-search-icon { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: var(--shop-accent); pointer-events: none; }
        .cat-search {
          width: 100%; height: 46px; padding-left: 2.8rem !important; padding-right: 2.6rem !important;
          border-radius: 8px !important; background: var(--bg); font-size: 0.86rem;
          transition: border-color 0.16s, box-shadow 0.16s;
        }
        .cat-search:focus { border-color: var(--shop-accent) !important; box-shadow: 0 0 0 3px var(--shop-accent-soft); }
        .cat-search::-webkit-search-cancel-button { display: none; }
        .cat-search-clear {
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
          width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--border); cursor: pointer;
          display: flex; align-items: center; justify-content: center; background: var(--bg-2); color: var(--text-2);
          transition: color 0.16s, border-color 0.16s, background 0.16s;
        }
        .cat-search-clear:hover { color: var(--text-1); border-color: var(--shop-accent); }
        .cat-sort {
          position: relative; display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto;
          padding: 0 0.8rem; height: 46px; border-radius: 8px; cursor: pointer;
          background: var(--bg); border: 1px solid var(--border); color: var(--text-2);
          font-size: 0.76rem; font-weight: 650; transition: border-color 0.16s, box-shadow 0.16s;
        }
        .cat-sort-icon { flex: 0 0 auto; color: var(--shop-accent); }
        .cat-sort select {
          appearance: none; -webkit-appearance: none; border: none; background: transparent; cursor: pointer;
          color: var(--text-1); font: inherit; font-weight: 700; outline: none; padding: 0 1rem 0 0; max-width: 220px;
        }
        .cat-sort select option { background: var(--bg-2); color: var(--text-1); }
        .cat-sort:focus-within { border-color: var(--shop-accent); box-shadow: 0 0 0 3px var(--shop-accent-soft); }
        .cat-toolbar-meta { display: flex; align-items: center; gap: 0.55rem; min-height: 1.25rem; margin-top: 0.6rem; }
        .cat-active-category { min-width: 0; overflow: hidden; color: var(--text-1); font-size: 0.73rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .cat-results { flex: 0 0 auto; color: var(--text-3); font-size: 0.72rem; font-weight: 600; white-space: nowrap; }
        .cat-clear-filters {
          display: inline-flex; align-items: center; gap: 4px; margin-left: auto; padding: 0.18rem 0.35rem;
          border: 0; background: transparent; color: var(--shop-accent); cursor: pointer; font: inherit;
          font-size: 0.7rem; font-weight: 700; white-space: nowrap;
        }
        .cat-clear-filters:hover { color: var(--shop-accent-hover); }

        /* ── Grid + cards ── */
        .cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.85rem; }
        .cat-card {
          position: relative; display: flex; flex-direction: column; height: 100%;
          background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
          animation: catRise 0.38s ease both;
        }
        .cat-card:hover {
          transform: translateY(-3px); border-color: var(--border-hover);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
        }
        .cat-card-hit { position: absolute; inset: 0; z-index: 2; background: transparent; border: none; cursor: pointer; border-radius: inherit; }
        .cat-card-hit:focus-visible { outline: 2px solid var(--shop-accent); outline-offset: -3px; }
        .cat-card-media { position: relative; width: 100%; aspect-ratio: 1 / 1.08; background: var(--bg-3); overflow: hidden; }
        .cat-card-media img { padding: 10px; transition: transform 0.35s ease; }
        .cat-card:hover .cat-card-media img { transform: scale(1.035); }
        .cat-card-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
        .cat-card-shade { display: none; }
        .cat-card-cat, .cat-card-count {
          position: absolute; display: inline-flex; align-items: center; gap: 4px;
          padding: 4px 8px; border-radius: 5px; font-size: 0.65rem; font-weight: 650;
          background: color-mix(in srgb, var(--bg-2) 92%, transparent); color: var(--text-1);
          border: 1px solid var(--border); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .cat-card-cat { top: 9px; left: 9px; max-width: calc(100% - 18px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cat-card-stock {
          position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 1;
          padding: 0.4rem 0.7rem; border: 1px solid var(--border); border-radius: 6px;
          background: color-mix(in srgb, var(--bg-2) 90%, transparent); color: var(--text-2);
          font-size: 0.7rem; font-weight: 750; white-space: nowrap;
        }
        .cat-card-count { bottom: 9px; right: 9px; }
        .cat-card-badges { position: absolute; bottom: 9px; left: 9px; display: flex; gap: 4px; }
        .cat-badge {
          display: inline-flex; align-items: center; padding: 4px 7px; border-radius: 5px;
          font-size: 0.65rem; font-weight: 750; color: white; white-space: nowrap;
        }
        .cat-badge[data-kind="sale"] { background: var(--red); }
        .cat-badge[data-kind="new"] { background: var(--shop-accent); }
        .cat-card-body { padding: 0.85rem 0.9rem 0.9rem; display: flex; flex-direction: column; gap: 0.45rem; flex: 1; }
        .cat-card-name {
          font-weight: 700; font-size: 0.93rem; color: var(--text-1); margin: 0; line-height: 1.35;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .cat-card-fields { font-size: 0.73rem; color: var(--text-3); margin: 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
        .cat-card-pills { display: flex; gap: 0.3rem; flex-wrap: wrap; }
        .cat-card-pill { padding: 2px 7px; border-radius: 5px; font-size: 0.66rem; font-weight: 600; background: var(--bg-3); color: var(--text-2); }
        .cat-card-foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding-top: 0.6rem; border-top: 1px solid var(--border); }
        .cat-card-prices { display: flex; flex-direction: column; min-width: 0; line-height: 1.1; }
        .cat-card-price { font-size: 1.08rem; font-weight: 750; color: var(--text-1); font-variant-numeric: tabular-nums; }
        .cat-card-price[data-sale] { color: var(--red); }
        .cat-card-old { font-size: 0.74rem; font-weight: 600; color: var(--text-3); margin-top: 2px; }
        .cat-card-add {
          position: relative; z-index: 3; flex-shrink: 0;
          width: 36px; height: 36px; border-radius: 8px; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; color: white;
          background: var(--shop-accent); transition: background 0.16s, transform 0.16s;
        }
        .cat-card-add:hover { background: var(--shop-accent-hover); transform: translateY(-1px); }
        .cat-card-add:disabled { background: var(--bg-3); color: var(--text-3); box-shadow: none; cursor: not-allowed; transform: none; }
        .cat-card-add:active { transform: scale(0.96); }
        .cat-card-add:focus-visible { outline: 2px solid var(--shop-accent); outline-offset: 2px; }

        .cat-empty {
          min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem;
          border: 1px dashed var(--border); border-radius: 10px; color: var(--text-3); font-size: 0.875rem; text-align: center; padding: 1rem;
        }
        .cat-empty[data-large] { min-height: 42vh; }
        .cat-skel { aspect-ratio: 1 / 1.32; border-radius: 10px; background: var(--bg-2); border: 1px solid var(--border); animation: pulse 1.4s ease-in-out infinite; }

        /* ── Footer ── */
        .cat-footer { margin-top: 3rem; display: flex; flex-direction: column; align-items: center; gap: 0.8rem; font-size: 0.72rem; color: var(--text-3); }
        .cat-footer-cta {
          display: inline-flex; align-items: center; gap: 7px; padding: 0.55rem 0.85rem; border-radius: 7px;
          font-size: 0.78rem; font-weight: 700; color: var(--accent-2); text-decoration: none;
          background: var(--shop-accent-soft); border: 1px solid color-mix(in srgb, var(--shop-accent) 28%, transparent);
          transition: background 0.18s;
        }
        .cat-footer-cta:hover { background: color-mix(in srgb, var(--shop-accent) 18%, var(--bg-2)); }
        .cat-footer-cta { color: var(--shop-accent); }
        .cat-account-link {
          display: inline-flex; align-items: center; gap: 7px; padding: 0.5rem 0.75rem;
          border: 1px solid var(--border); border-radius: 8px; background: var(--bg-2);
          color: var(--text-2); font-size: 0.76rem; font-weight: 700; text-decoration: none;
          transition: color 0.16s, border-color 0.16s, background 0.16s;
        }
        .cat-account-link:hover { color: var(--shop-accent); border-color: var(--shop-accent); background: var(--bg-3); }
        .cat-cookie-link { color: var(--text-3); text-decoration: none; }
        .cat-cookie-link:hover { color: var(--text-1); }

        /* ── Floating cart ── */
        .cat-cart-bar {
          position: fixed; z-index: 60; bottom: max(1.25rem, env(safe-area-inset-bottom)); right: 1.5rem;
          display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1.2rem 0.6rem 0.6rem;
          border-radius: 10px; border: 1px solid var(--border); cursor: pointer; color: white; background: var(--shop-accent);
          box-shadow: 0 10px 28px -12px rgba(0, 0, 0, 0.55);
          font-size: 0.88rem; font-weight: 700;
          animation: catRise 0.35s cubic-bezier(0.2, 0.8, 0.3, 1);
          transition: transform 0.18s;
        }
        .cat-cart-bar:hover { transform: translateY(-2px); background: var(--shop-accent-hover); }
        .cat-cart-bar-icon {
          position: relative; width: 38px; height: 38px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center; color: white;
          background: rgba(255, 255, 255, 0.15);
        }
        .cat-cart-bar-badge {
          position: absolute; top: -4px; right: -4px; min-width: 19px; height: 19px; padding: 0 5px;
          border-radius: 6px; font-size: 0.66rem; display: flex; align-items: center; justify-content: center;
          background: var(--red); color: white; border: 2px solid var(--shop-accent);
        }
        .cat-cart-bar-total { padding-left: 0.75rem; border-left: 1px solid color-mix(in srgb, var(--bg) 25%, transparent); font-variant-numeric: tabular-nums; }

        /* ── Overlay / modal ── */
        @keyframes catOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes catModalIn { from { opacity: 0; transform: translateY(18px) scale(0.97); } to { opacity: 1; transform: none; } }
        @keyframes catRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @keyframes catDrawerIn { from { transform: translateX(100%); } to { transform: none; } }
        @keyframes catSheetIn { from { transform: translateY(100%); } to { transform: none; } }
        @keyframes catPulse { 0%, 100% { box-shadow: 0 0 0 3px var(--green-dim); } 50% { box-shadow: 0 0 0 6px transparent; } }
        @keyframes catSpin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        .cat-overlay {
          position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center; padding: 1rem;
          background: rgba(8, 13, 10, 0.62);
          backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); animation: catOverlayIn 0.18s ease;
        }
        .cat-modal {
          position: relative; width: 100%; max-width: 1020px; max-height: 90vh;
          display: flex; flex-direction: column; overflow: hidden;
          background: var(--bg-2); border: 1px solid var(--border); border-radius: 14px;
          box-shadow: 0 24px 72px rgba(0, 0, 0, 0.32);
          animation: catModalIn 0.24s ease;
        }
        .cat-modal-close {
          position: absolute; top: 12px; right: 12px; z-index: 6; flex-shrink: 0;
          width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--bg-2) 92%, transparent); border: 1px solid var(--border);
          border-radius: 8px; cursor: pointer; color: var(--text-1);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          transition: background 0.15s, border-color 0.15s;
        }
        .cat-modal-close:hover { background: var(--bg-3); border-color: var(--border-hover); }
        .cat-modal-close:focus-visible, .cat-modal-share:focus-visible, .cat-modal-ask:focus-visible,
        .cat-variant:focus-visible, .cat-stepper button:focus-visible, .cat-add-btn:focus-visible {
          outline: 2px solid var(--shop-accent); outline-offset: 3px;
        }
        .cat-drawer-close { position: static; flex: 0 0 auto; }
        .cat-modal-slider { position: relative; width: 100%; aspect-ratio: 1 / 1; background: var(--bg-3); flex-shrink: 0; }
        .cat-modal-placeholder { display: grid; place-items: center; color: var(--text-3); }
        .cat-modal-count {
          position: absolute; top: 12px; left: 12px; z-index: 4;
          padding: 4px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 650; font-variant-numeric: tabular-nums;
          background: color-mix(in srgb, var(--bg-2) 85%, transparent); color: var(--text-2); border: 1px solid var(--border);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .cat-modal-swipe { display: flex; width: 100%; height: 100%; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
        .cat-modal-swipe::-webkit-scrollbar { display: none; }
        .cat-modal-slide { position: relative; flex: 0 0 100%; scroll-snap-align: start; }
        .cat-modal-arrow {
          position: absolute; top: 50%; transform: translateY(-50%); z-index: 4;
          width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--bg-2) 85%, transparent); border: 1px solid var(--border);
          border-radius: 8px; cursor: pointer; color: var(--text-1);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: background 0.15s, border-color 0.15s;
        }
        .cat-modal-arrow:hover { background: var(--bg-3); border-color: var(--border-hover); }
        .cat-modal-arrow[data-side="left"] { left: 12px; }
        .cat-modal-arrow[data-side="right"] { right: 12px; }
        .cat-modal-dots {
          position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); z-index: 4;
          display: flex; gap: 6px; padding: 5px 9px; border-radius: 7px;
          background: color-mix(in srgb, var(--bg-2) 80%, transparent); border: 1px solid var(--border);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .cat-modal-dot { width: 7px; height: 7px; border-radius: 99px; border: none; padding: 0; cursor: pointer; background: var(--border-hover); transition: all 0.2s; }
        .cat-modal-dot[data-active] { background: var(--shop-accent); width: 18px; }
        .cat-modal-thumbs { display: none; }
        .cat-modal-body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; padding: 1.35rem 1.5rem 1.5rem; }
        .cat-modal-top { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding-right: 2.75rem; }
        .cat-modal-eyebrow {
          padding: 4px 8px; border-radius: 5px; font-size: 0.68rem; font-weight: 650;
          background: var(--shop-accent-soft); color: var(--shop-accent); border: 1px solid color-mix(in srgb, var(--shop-accent) 25%, transparent);
        }
        .cat-modal-share {
          display: inline-flex; align-items: center; gap: 6px; padding: 0.45rem 0.7rem; border-radius: 7px;
          font-size: 0.76rem; font-weight: 700; cursor: pointer; color: var(--text-2);
          background: var(--bg-3); border: 1px solid var(--border); transition: color 0.15s, border-color 0.15s, background 0.15s, transform 0.15s;
        }
        .cat-modal-share:hover { color: var(--shop-accent); border-color: var(--shop-accent); background: var(--shop-accent-soft); transform: translateY(-1px); }
        .cat-modal-title { font-size: 1.5rem; font-weight: 750; color: var(--text-1); margin: 0.85rem 0 0; line-height: 1.2; }
        .cat-modal-price { display: flex; align-items: center; flex-wrap: wrap; gap: 0.6rem; font-size: 1.7rem; font-weight: 750; color: var(--shop-accent); margin: 0.45rem 0 0; font-variant-numeric: tabular-nums; }
        .cat-modal-old { font-size: 1rem; font-weight: 600; color: var(--text-3); letter-spacing: 0; }
        .cat-modal-group { margin-top: 1.25rem; }
        .cat-modal-section { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); margin: 0 0 0.55rem; }
        .cat-variant-list { display: flex; flex-wrap: wrap; gap: 0.45rem; }
        .cat-variant {
          min-width: 48px; min-height: 40px; padding: 0.5rem 0.85rem; border-radius: 7px; font-size: 0.84rem; font-weight: 650; cursor: pointer;
          background: var(--bg-2); color: var(--text-1); border: 1.5px solid var(--border);
          transition: border-color 0.15s, background 0.15s, transform 0.15s;
        }
        .cat-variant:hover { border-color: var(--shop-accent); }
        .cat-variant:active { transform: scale(0.96); }
        .cat-variant[data-active] { border-color: var(--shop-accent); background: var(--shop-accent-soft); color: var(--shop-accent); }
        .cat-variant:disabled { color: var(--text-3); background: var(--bg-3); border-color: var(--border); cursor: not-allowed; opacity: 0.65; }
        .cat-modal-fields { display: flex; flex-direction: column; gap: 6px; }
        .cat-modal-field { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; font-size: 0.82rem; padding: 0.6rem 0.7rem; border-radius: 6px; background: var(--bg-3); }
        .cat-modal-field span:first-child { color: var(--text-3); font-weight: 600; flex-shrink: 0; }
        .cat-modal-field span:last-child { color: var(--text-1); text-align: right; }
        .cat-modal-actions { margin-top: auto; padding-top: 1.5rem; display: flex; flex-direction: column; gap: 0.7rem; }
        .cat-modal-ask {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; min-height: 52px; padding: 0.8rem 1rem; border: 2px solid #6a54df;
          border-radius: 12px; color: #fff; background: linear-gradient(135deg, #8069f2, #624bdc);
          text-decoration: none; font-size: 0.9rem; font-weight: 800; letter-spacing: 0.005em;
          box-shadow: 0 5px 17px rgba(99, 77, 220, 0.28), inset 0 1px rgba(255,255,255,0.2);
          transition: transform 0.16s, border-color 0.16s, background 0.16s, box-shadow 0.16s;
        }
        .cat-modal-ask:hover {
          transform: translateY(-2px); border-color: #8e7cf5;
          background: linear-gradient(135deg, #907fff, #7159ed);
          box-shadow: 0 8px 22px rgba(99, 77, 220, 0.4);
        }
        .cat-modal-ask:active { transform: translateY(0) scale(0.99); }
        .cat-buy-row { display: flex; gap: 0.6rem; }
        .cat-stepper {
          display: inline-flex; align-items: center; flex-shrink: 0; border-radius: 8px;
          background: var(--bg-3); border: 1px solid var(--border); padding: 3px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.06);
        }
        .cat-stepper button {
          width: 38px; height: 40px; border-radius: 6px; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; background: transparent; color: var(--text-1);
          transition: background 0.15s;
        }
        .cat-stepper button:hover:not(:disabled) { background: var(--bg-2); color: var(--shop-accent); }
        .cat-stepper button:disabled { opacity: 0.35; cursor: default; }
        .cat-stepper span { min-width: 28px; text-align: center; font-weight: 800; font-size: 0.92rem; font-variant-numeric: tabular-nums; color: var(--text-1); }
        .cat-stepper[data-size="sm"] button { width: 30px; height: 30px; border-radius: 9px; }
        .cat-stepper[data-size="sm"] span { min-width: 24px; font-size: 0.82rem; }
        .cat-add-btn {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
          min-height: 54px; padding: 0.8rem 1rem; font-size: 0.96rem; font-weight: 800; border-radius: 12px;
          color: #fff; background: linear-gradient(135deg, #8069f2, #624bdc);
          border: 1px solid #735ee8;
          box-shadow: 0 7px 22px rgba(99, 77, 220, 0.38), inset 0 1px rgba(255,255,255,0.22);
          text-shadow: 0 1px 1px rgba(0,0,0,0.14);
          transition: transform 0.15s, background 0.15s, box-shadow 0.15s, filter 0.15s;
        }
        .cat-add-btn:hover:not(:disabled) { transform: translateY(-2px); background: linear-gradient(135deg, #907fff, #7159ed); box-shadow: 0 10px 28px rgba(99, 77, 220, 0.48), inset 0 1px rgba(255,255,255,0.25); filter: saturate(1.12); }
        .cat-add-btn:active:not(:disabled) { transform: translateY(0) scale(0.99); }
        .cat-add-btn:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; filter: grayscale(0.15); }

        /* ── Cart drawer ── */
        .cat-drawer-overlay { justify-content: flex-end; align-items: stretch; padding: 0; }
        .cat-drawer {
          width: min(460px, 100%); height: 100%; display: flex; flex-direction: column;
          background: var(--bg-2); border-left: 1px solid var(--border);
          box-shadow: -20px 0 54px rgba(0, 0, 0, 0.25); animation: catDrawerIn 0.24s ease;
        }
        .cat-drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.15rem; border-bottom: 1px solid var(--border); }
        .cat-drawer-title { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 1rem; font-weight: 750; color: var(--text-1); }
        .cat-drawer-title > svg { color: var(--shop-accent); }
        .cat-drawer-badge { font-size: 0.7rem; font-weight: 750; padding: 3px 7px; border-radius: 5px; background: var(--shop-accent); color: white; }
        .cat-drawer-list { list-style: none; margin: 0; padding: 0.75rem 1.15rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.55rem; }
        .cat-line { display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.65rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-3); animation: catRise 0.25s ease both; }
        .cat-line-media { position: relative; width: 64px; height: 64px; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: var(--bg-2); display: flex; align-items: center; justify-content: center; color: var(--text-3); }
        .cat-line-media img { padding: 4px; }
        .cat-line-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .cat-line-name { margin: 0; font-size: 0.86rem; font-weight: 700; color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cat-line-variant { margin: 0; font-size: 0.72rem; font-weight: 600; color: var(--text-3); }
        .cat-line-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 4px; }
        .cat-line-row .cat-stepper { background: var(--bg-2); }
        .cat-line-price { font-size: 0.9rem; font-weight: 800; color: var(--text-1); font-variant-numeric: tabular-nums; }
        .cat-line-stock, .cat-stock-warning { margin: 0.25rem 0 0; color: var(--red); font-size: 0.72rem; font-weight: 650; }
        .cat-line-remove {
          width: 30px; height: 30px; border-radius: 6px; border: none; cursor: pointer; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; background: transparent; color: var(--text-3);
          transition: color 0.15s, background 0.15s;
        }
        .cat-line-remove:hover { color: var(--red); background: var(--red-dim); }
        .cat-drawer-foot { padding: 1rem 1.15rem max(1.25rem, env(safe-area-inset-bottom)); border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 0.65rem; }
        .cat-drawer-total { display: flex; align-items: baseline; justify-content: space-between; margin: 0 0 0.25rem; font-size: 0.85rem; font-weight: 600; color: var(--text-2); }
        .cat-drawer-total strong { font-size: 1.4rem; font-weight: 750; color: var(--text-1); font-variant-numeric: tabular-nums; }
        .cat-drawer-clear {
          align-self: center; display: inline-flex; align-items: center; gap: 6px; margin-top: 0.25rem; padding: 0.4rem 0.65rem; border-radius: 6px;
          font-size: 0.75rem; font-weight: 600; color: var(--text-3); background: none; border: none; cursor: pointer;
        }
        .cat-drawer-clear:hover { color: var(--red); background: var(--red-dim); }
        .cat-cart-empty { flex: 1; margin: 1rem; }
        .cat-order-form {
          display: flex; flex-direction: column; gap: 0.9rem; padding: 1rem;
          border: 1px solid var(--border); border-radius: 10px;
          background: color-mix(in srgb, var(--bg-3) 55%, var(--bg-2));
        }
        .cat-order-heading { display: flex; align-items: flex-start; gap: 0.7rem; }
        .cat-order-heading-icon {
          display: flex; align-items: center; justify-content: center; flex: 0 0 34px; height: 34px;
          border: 1px solid color-mix(in srgb, var(--shop-accent) 28%, var(--border)); border-radius: 8px;
          color: var(--shop-accent); background: var(--shop-accent-soft);
        }
        .cat-order-form .cat-modal-section { margin: 0 0 0.25rem; color: var(--text-1); font-size: 0.8rem; letter-spacing: 0.02em; }
        .cat-order-intro { margin: 0; color: var(--text-3); font-size: 0.7rem; line-height: 1.45; }
        .cat-order-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; }
        .cat-order-field { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
        .cat-order-field > span { color: var(--text-2); font-size: 0.7rem; font-weight: 650; }
        .cat-order-field-wide { grid-column: 1 / -1; }
        .cat-order-input { min-height: 42px; padding: 0.65rem 0.75rem !important; border-radius: 7px; font-size: 0.8rem; transition: border-color 0.16s, box-shadow 0.16s, background 0.16s; }
        .cat-order-input:focus { border-color: var(--shop-accent) !important; box-shadow: 0 0 0 3px var(--shop-accent-soft); }
        .cat-order-button { min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 7px; border-radius: 7px; font-size: 0.82rem; }
        .cat-order-button:disabled { cursor: not-allowed; opacity: 0.5; filter: grayscale(0.2); }
        .cat-order-note, .cat-order-error, .cat-order-success { margin: 0; font-size: 0.72rem; line-height: 1.45; }
        .cat-order-error { color: var(--red); }
        .cat-order-success { color: var(--green); font-size: 0.8rem; }
        .cat-order-confirmation { flex: 1; display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 0.9rem; padding: 1.25rem; }
        .cat-order-success-mark { align-self: center; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: var(--green); background: var(--green-dim); }
        .cat-order-confirmation > .cat-order-success { text-align: center; font-size: 0.9rem; font-weight: 650; }
        .cat-order-chat-link {
          display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 42px;
          padding: 0.55rem 0.8rem; border: 1px solid color-mix(in srgb, var(--shop-accent) 30%, transparent);
          border-radius: 8px; background: var(--shop-accent-soft); color: var(--shop-accent);
          text-decoration: none; font-size: 0.8rem; font-weight: 750; transition: background 0.16s, transform 0.16s;
        }
        .cat-order-chat-link:hover { background: color-mix(in srgb, var(--shop-accent) 18%, var(--bg-2)); transform: translateY(-1px); }

        /* ── Toast ── */
        .cat-toast {
          position: fixed; z-index: 90; left: 50%; top: 1.25rem; transform: translate(-50%, -20px);
          max-width: min(92vw, 420px); padding: 0.7rem 1rem; border-radius: 8px;
          font-size: 0.84rem; font-weight: 700; text-align: center;
          background: var(--shop-accent); color: white; border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
          opacity: 0; pointer-events: none; transition: opacity 0.25s, transform 0.3s cubic-bezier(0.2, 0.8, 0.3, 1);
        }
        .cat-toast[data-visible] { opacity: 1; transform: translate(-50%, 0); }

        @media (min-width: 761px) {
          .cat-modal { flex-direction: row; }
          .cat-modal-slider { width: 52%; aspect-ratio: auto; min-height: 500px; }
          .cat-modal-slide img { padding: 18px; }
          .cat-modal-body { width: 48%; padding: 1.9rem; }
          .cat-modal-dots { display: none; }
          .cat-modal-thumbs {
            position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 4;
            display: flex; gap: 7px; padding: 6px; border-radius: 8px; max-width: calc(100% - 28px);
            background: color-mix(in srgb, var(--bg-2) 80%, transparent); border: 1px solid var(--border);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); overflow-x: auto; scrollbar-width: none;
          }
          .cat-modal-thumbs::-webkit-scrollbar { display: none; }
          .cat-modal-thumb {
            position: relative; flex: 0 0 auto; width: 44px; height: 44px; border-radius: 6px; padding: 0;
            overflow: hidden; cursor: pointer; border: 2px solid transparent; background: var(--bg-3);
            opacity: 0.7; transition: border-color 0.15s, opacity 0.15s;
          }
          .cat-modal-thumb[data-active] { border-color: var(--shop-accent); opacity: 1; }
          .cat-modal-thumb:hover { opacity: 1; }
        }

        @media (max-width: 760px) {
          .cat-wrap { padding: 0.9rem 1rem 6rem; }
          .cat-hero { border-radius: 10px; }
          .cat-hero[data-cover] { min-height: 270px; }
          .cat-hero-content { padding: 1.1rem; gap: 1rem; }
          .cat-hero-logo { width: 56px; height: 56px; border-radius: 9px; font-size: 1.35rem; }
          .cat-hero-title { font-size: 1.55rem; }
          .cat-hero-contact { width: fit-content; max-width: 100%; justify-content: flex-start; gap: 0.45rem; }
          .cat-hero-order-via { flex-wrap: wrap; }
          .cat-modal-actions { padding-top: 1rem; }
          .cat-buy-row { gap: 0.5rem; }
          .cat-stepper button { width: 34px; }
          .cat-browse { grid-template-columns: minmax(0, 1fr); gap: 0.75rem; }
          .cat-sidebar { position: static; padding: 0.65rem; }
          .cat-sidebar-heading { padding: 0.1rem 0.35rem 0.55rem; }
          .cat-category-list { flex-direction: row; overflow-x: auto; gap: 0.4rem; padding-bottom: 2px; scrollbar-width: none; }
          .cat-category-list::-webkit-scrollbar { display: none; }
          .cat-category { width: auto; min-width: max-content; max-width: 220px; flex: 0 0 auto; gap: 0.5rem; padding: 0.48rem 0.62rem; border-color: var(--border); }
          .cat-toolbar { top: 0; margin: 0 0 0.75rem; padding: 0.65rem; }
          .cat-toolbar-row { flex-wrap: wrap; gap: 0.5rem; }
          .cat-search-wrap { flex: 1 1 100%; }
          .cat-search { height: 44px; }
          .cat-sort { width: 100%; height: 42px; justify-content: space-between; }
          .cat-sort select { max-width: calc(100% - 6.5rem); }
          .cat-toolbar-meta { margin-top: 0.45rem; }
          .cat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem; }
          .cat-card { border-radius: 8px; }
          .cat-card-media { aspect-ratio: 1 / 1.04; }
          .cat-card-media img { padding: 6px; }
          .cat-card-body { padding: 0.65rem; gap: 0.4rem; }
          .cat-card-name { font-size: 0.83rem; }
          .cat-card-fields { display: -webkit-box; font-size: 0.67rem; }
          .cat-card-pill { font-size: 0.62rem; }
          .cat-card-price { font-size: 0.9rem; }
          .cat-card-old { font-size: 0.66rem; }
          .cat-card-add { width: 32px; height: 32px; border-radius: 7px; }
          .cat-card-cat { top: 7px; left: 7px; }
          .cat-card-badges { bottom: 7px; left: 7px; }
          .cat-overlay:not(.cat-drawer-overlay) { align-items: flex-end; padding: 0; }
          .cat-modal { max-height: 94dvh; border-radius: 12px 12px 0 0; animation: catSheetIn 0.24s ease; }
          .cat-modal-slider { aspect-ratio: 1.15 / 1; max-height: 42dvh; }
          .cat-modal-arrow { display: none; }
          .cat-modal-body { padding: 1rem 1rem max(1rem, env(safe-area-inset-bottom)); }
          .cat-modal-title { font-size: 1.2rem; }
          .cat-modal-price { font-size: 1.4rem; }
          .cat-drawer-overlay { align-items: flex-end; }
          .cat-drawer { width: 100%; height: auto; max-height: 90dvh; border-left: none; border-radius: 12px 12px 0 0; animation: catSheetIn 0.24s ease; }
          .cat-drawer-foot { gap: 0.55rem; }
          .cat-order-form { padding: 0.85rem; gap: 0.75rem; }
          .cat-order-fields { gap: 0.6rem; }
          .cat-cart-bar { left: 1rem; right: 1rem; justify-content: flex-start; }
          .cat-cart-bar-total { margin-left: auto; }
        }

        @media (max-width: 380px) {
          .cat-wrap { padding-inline: 0.7rem; }
          .cat-category { padding-inline: 0.5rem; font-size: 0.72rem; }
          .cat-toolbar { padding: 0.55rem; }
          .cat-grid { gap: 0.5rem; }
          .cat-card-body { padding: 0.55rem; }
          .cat-card-add { width: 30px; height: 30px; }
          .cat-hero-main { gap: 0.7rem; }
          .cat-hero-logo { width: 48px; height: 48px; }
          .cat-hero-title { font-size: 1.35rem; }
        }

        @media (prefers-reduced-motion: reduce) {
          .cat-page *, .cat-overlay * { animation: none !important; transition: none !important; }
        }
      `}</style>
    </div>
  );
}

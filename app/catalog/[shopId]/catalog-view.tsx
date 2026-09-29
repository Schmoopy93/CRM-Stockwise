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
import { CatalogItem, CatalogStatEvent, ShopCatalogSettings } from "@/lib/types";
import { ArrowUpDown, Package, Search, ShoppingBag, Sparkles, X } from "lucide-react";
import { setProductParam, useCart, useProductParam } from "./catalog-store";
import CatalogCard from "./catalog-card";
import CatalogDetail from "./catalog-detail";
import CatalogCart, { ResolvedCartLine } from "./catalog-cart";
import OrderChannels, { availableChannels } from "./order-channels";

type SortKey = "name" | "priceAsc" | "priceDesc";

function comparePrice(a: CatalogItem, b: CatalogItem, direction: 1 | -1) {
  if (a.salePrice === undefined) return b.salePrice === undefined ? 0 : 1;
  if (b.salePrice === undefined) return -1;
  return (a.salePrice - b.salePrice) * direction;
}

export default function CatalogView({ shopId }: { shopId: string }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALES[locale];
  const [shop, setShop] = useState<ShopCatalogSettings | null>(null);
  const [shopLoading, setShopLoading] = useState(true);
  const { items, loading } = useCatalog(shopId);
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
    const matches = visible.filter((item) =>
      (category === "all" || item.category === category) &&
      (!q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q))
    );
    if (sort === "priceAsc") return [...matches].sort((a, b) => comparePrice(a, b, 1));
    if (sort === "priceDesc") return [...matches].sort((a, b) => comparePrice(a, b, -1));
    return matches;
  }, [visible, search, category, sort]);

  const selected = productId ? itemsById.get(productId) ?? null : null;
  const cartLines: ResolvedCartLine[] = cart.lines.flatMap((line) => {
    const item = itemsById.get(line.itemId);
    return item ? [{ item, variant: line.variant, quantity: line.quantity }] : [];
  });
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartPriced = cartLines.every((line) => line.item.salePrice !== undefined);
  const cartTotal = cartLines.reduce((sum, line) => sum + (line.item.salePrice ?? 0) * line.quantity, 0);
  const initials = name.trim().slice(0, 1).toUpperCase() || "•";

  function addToCart(item: CatalogItem, variant: string, quantity: number) {
    cart.add(item.id, variant, quantity);
    notify(t("catalog.added"));
  }

  function quickAdd(item: CatalogItem) {
    if (item.variants.length > 1) setProductParam(item.id);
    else addToCart(item, item.variants[0] ?? "", 1);
  }

  return (
    <div className="cat-page">
      <div aria-hidden className="cat-glow" />
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
            {!shopLoading && catalogEnabled && hasChannels && (
              <div className="cat-hero-contact">
                <p className="cat-hero-caption">{t("catalog.orderVia")}</p>
                <OrderChannels channels={channels} onChannelClick={track} />
              </div>
            )}
          </div>
        </header>

        {(shopLoading || loading) ? (
          <div className="cat-grid">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="cat-skel" style={{ animationDelay: `${i * 70}ms` }} />)}
          </div>
        ) : !catalogEnabled ? (
          <div className="cat-empty" style={{ minHeight: "42vh" }}>
            <Package size={34} strokeWidth={1.5} />
            {t("catalog.notAvailable")}
          </div>
        ) : (
          <>
            <div className="cat-toolbar">
              <div className="cat-toolbar-row">
                <div className="cat-search-wrap">
                  <Search size={15} className="cat-search-icon" />
                  <input className="input cat-search" type="search" placeholder={t("search")} aria-label={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
                  {search && (
                    <button type="button" className="cat-search-clear" onClick={() => setSearch("")} aria-label={t("catalog.close")}><X size={14} /></button>
                  )}
                </div>
                <label className="cat-sort">
                  <ArrowUpDown size={14} />
                  <span className="cat-sort-label">{t("catalog.sortLabel")}</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label={t("catalog.sortLabel")}>
                    <option value="name">{t("catalog.sortName")}</option>
                    <option value="priceAsc">{t("catalog.sortPriceAsc")}</option>
                    <option value="priceDesc">{t("catalog.sortPriceDesc")}</option>
                  </select>
                </label>
              </div>
              {categories.length > 1 && (
                <div className="cat-chips" role="tablist" aria-label={t("catalog.categoriesLabel")}>
                  {categories.map(([cat, count]) => (
                    <button key={cat} type="button" role="tab" aria-selected={category === cat} onClick={() => setCategory(cat)} className="cat-chip" data-active={category === cat || undefined}>
                      {cat === "all" ? t("all") : cat}
                      <span className="cat-chip-count">{count}</span>
                    </button>
                  ))}
                </div>
              )}
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
                    onOpen={() => setProductParam(item.id)} onQuickAdd={() => quickAdd(item)} />
                ))}
              </div>
            )}
          </>
        )}

        <footer className="cat-footer">
          <Link href="/" className="cat-footer-cta">
            <Sparkles size={14} />
            {t("catalog.createOwn")}
          </Link>
          <Link href="/cookies" style={{ color: "var(--text-3)" }}>{t("cookies.title")}</Link>
        </footer>
      </div>

      {cartCount > 0 && !cartOpen && (
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
          channels={channels}
          onClose={closeDetail}
          onAdd={(variant, quantity) => addToCart(selected, variant, quantity)}
          onNotify={notify}
          onTrack={track}
        />
      )}

      {cartOpen && (
        <CatalogCart
          lines={cartLines}
          locale={locale}
          prices={prices}
          shopId={shopId}
          channels={channels}
          onQuantity={cart.setQuantity}
          onClear={() => { cart.clear(); setCartOpen(false); }}
          onClose={closeCart}
          onNotify={notify}
          onTrack={track}
        />
      )}

      <div className="cat-toast" role="status" aria-live="polite" data-visible={toast ? true : undefined}>{toast}</div>

      <style>{`
        .cat-page { min-height: 100vh; background: var(--bg); position: relative; overflow-x: clip; }
        .cat-glow {
          position: absolute; top: -18rem; left: 50%; transform: translateX(-50%); pointer-events: none;
          width: min(1100px, 120vw); height: 38rem; border-radius: 50%;
          background: radial-gradient(closest-side, var(--accent-glow), transparent);
        }
        .cat-wrap { max-width: 1240px; margin: 0 auto; padding: 1.5rem 1.25rem 7rem; position: relative; }

        /* ── Hero ── */
        .cat-hero {
          position: relative; overflow: hidden;
          margin-bottom: 1.5rem;
          border: 1px solid var(--border); border-radius: 28px;
          background:
            radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 55%),
            linear-gradient(160deg, color-mix(in srgb, var(--bg-2) 96%, transparent), color-mix(in srgb, var(--bg-2) 80%, transparent));
          box-shadow: 0 20px 60px -30px color-mix(in srgb, var(--accent) 35%, transparent);
          animation: catRise 0.5s cubic-bezier(0.2, 0.8, 0.3, 1);
        }
        .cat-hero-cover { position: relative; width: 100%; aspect-ratio: 3 / 1; max-height: 300px; background: var(--bg-3); }
        .cat-hero-cover::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to top, color-mix(in srgb, var(--bg-2) 55%, transparent), transparent 45%); }
        .cat-hero-content {
          position: relative; display: flex; align-items: flex-end; justify-content: space-between; gap: 1.5rem; flex-wrap: wrap;
          padding: 2rem 2rem 1.75rem;
        }
        .cat-hero[data-cover] .cat-hero-content { padding-top: 0; }
        .cat-hero[data-cover] .cat-hero-main { align-items: flex-end; }
        .cat-hero[data-cover] .cat-hero-logo { margin-top: -40px; border: 4px solid var(--bg-2); }
        .cat-hero-main { display: flex; align-items: center; gap: 1.1rem; min-width: 0; }
        .cat-hero-logo {
          position: relative; overflow: hidden;
          width: 80px; height: 80px; border-radius: 24px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 2rem; font-weight: 800; color: white; letter-spacing: -0.03em;
          background: linear-gradient(135deg, var(--accent), var(--accent-2));
          box-shadow: 0 12px 30px -6px var(--accent-glow), inset 0 1px 0 rgba(255, 255, 255, 0.25);
        }
        .cat-hero-title {
          font-size: clamp(1.4rem, 3.2vw, 2.1rem); font-weight: 800; color: var(--text-1); margin: 0;
          letter-spacing: -0.035em; line-height: 1.1; overflow-wrap: anywhere;
        }
        .cat-hero-sub { display: flex; align-items: center; gap: 7px; font-size: 0.8rem; font-weight: 600; color: var(--text-3); margin: 8px 0 0; }
        .cat-hero-dot { width: 7px; height: 7px; border-radius: 99px; background: var(--green); box-shadow: 0 0 0 3px var(--green-dim); animation: catPulse 2s ease-in-out infinite; }
        .cat-hero-contact { display: flex; flex-direction: column; gap: 0.5rem; }
        .cat-hero-caption { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); margin: 0; }
        .cat-hero-skel { width: 200px; height: 30px; border-radius: 10px; background: var(--bg-3); animation: pulse 1.4s ease-in-out infinite; }

        /* ── Channels ── */
        .cat-channels { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .cat-channels[data-disabled] { opacity: 0.45; }
        .cat-channel {
          display: inline-flex; align-items: center; justify-content: center; gap: 7px; flex: 1 1 auto;
          padding: 0.7rem 1.1rem; border-radius: 14px; font-size: 0.85rem; font-weight: 700;
          color: white; text-decoration: none; white-space: nowrap;
          transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.3, 1), box-shadow 0.18s, filter 0.18s;
        }
        .cat-channel:hover { transform: translateY(-2px); filter: brightness(1.06); }
        .cat-channel:active { transform: translateY(0) scale(0.98); }
        .cat-channel[aria-disabled] { pointer-events: none; }
        .cat-channel[data-channel="whatsapp"] { background: #25d366; box-shadow: 0 8px 22px -8px rgba(37, 211, 102, 0.7); }
        .cat-channel[data-channel="telegram"] { background: #229ed9; box-shadow: 0 8px 22px -8px rgba(34, 158, 217, 0.7); }
        .cat-channel[data-channel="instagram"] { background: linear-gradient(45deg, #f58529, #dd2a7b 55%, #8134af); box-shadow: 0 8px 22px -8px rgba(221, 42, 123, 0.65); }
        .cat-hint { font-size: 0.72rem; color: var(--text-3); margin: 0; line-height: 1.45; }

        /* ── Toolbar ── */
        .cat-toolbar {
          position: sticky; top: 0; z-index: 30;
          margin: 0 -1.25rem 1.25rem; padding: 0.75rem 1.25rem 0.6rem;
          background: color-mix(in srgb, var(--bg) 82%, transparent);
          backdrop-filter: blur(14px) saturate(1.4); -webkit-backdrop-filter: blur(14px) saturate(1.4);
          border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
        }
        .cat-toolbar-row { display: flex; gap: 0.6rem; align-items: stretch; }
        .cat-search-wrap { position: relative; flex: 1; min-width: 0; }
        .cat-search-icon { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: var(--text-3); pointer-events: none; }
        .cat-search { padding-left: 2.6rem !important; padding-right: 2.4rem !important; border-radius: 14px !important; height: 46px; }
        .cat-search::-webkit-search-cancel-button { display: none; }
        .cat-search-clear {
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
          width: 30px; height: 30px; border-radius: 99px; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; background: var(--bg-3); color: var(--text-2);
        }
        .cat-sort {
          position: relative; display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
          padding: 0 0.9rem; height: 46px; border-radius: 14px; cursor: pointer;
          background: var(--bg-2); border: 1px solid var(--border); color: var(--text-2);
          font-size: 0.8rem; font-weight: 600;
        }
        .cat-sort select {
          appearance: none; -webkit-appearance: none; border: none; background: transparent; cursor: pointer;
          color: var(--text-1); font: inherit; font-weight: 700; outline: none; padding: 0;
        }
        .cat-sort select option { background: var(--bg-2); color: var(--text-1); }
        .cat-sort:focus-within { border-color: var(--accent); }
        .cat-chips { display: flex; gap: 0.45rem; overflow-x: auto; margin-top: 0.65rem; padding-bottom: 2px; scrollbar-width: none; }
        .cat-chips::-webkit-scrollbar { display: none; }
        .cat-chip {
          flex: 0 0 auto; display: inline-flex; align-items: center; gap: 7px;
          padding: 0.42rem 0.55rem 0.42rem 0.95rem; border-radius: 99px; font-size: 0.8rem; font-weight: 600;
          border: 1px solid var(--border); cursor: pointer; background: var(--bg-2); color: var(--text-2);
          transition: background 0.18s, color 0.18s, border-color 0.18s, transform 0.18s;
        }
        .cat-chip:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
        .cat-chip:active { transform: scale(0.97); }
        .cat-chip[data-active] { background: var(--text-1); border-color: var(--text-1); color: var(--bg); }
        .cat-chip-count { font-size: 0.68rem; font-weight: 700; padding: 1px 7px; border-radius: 99px; background: var(--bg-3); color: var(--text-3); }
        .cat-chip[data-active] .cat-chip-count { background: color-mix(in srgb, var(--bg) 22%, transparent); color: var(--bg); }

        /* ── Grid + cards ── */
        .cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
        .cat-card {
          position: relative; display: flex; flex-direction: column; height: 100%;
          background: var(--bg-2); border: 1px solid var(--border); border-radius: 18px; overflow: hidden;
          transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.3, 1), box-shadow 0.3s, border-color 0.3s;
          animation: catRise 0.45s cubic-bezier(0.2, 0.8, 0.3, 1) both;
        }
        .cat-card:hover {
          transform: translateY(-5px);
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
          box-shadow: 0 22px 50px -18px color-mix(in srgb, var(--accent) 30%, transparent), 0 8px 20px -10px color-mix(in srgb, var(--text-1) 14%, transparent);
        }
        .cat-card-hit { position: absolute; inset: 0; z-index: 2; background: transparent; border: none; cursor: pointer; border-radius: inherit; }
        .cat-card-hit:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
        .cat-card-media { position: relative; width: 100%; aspect-ratio: 1 / 1; background: var(--bg-3); overflow: hidden; }
        .cat-card-media img { transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.3, 1); }
        .cat-card:hover .cat-card-media img { transform: scale(1.06); }
        .cat-card-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 44px; opacity: 0.45; }
        .cat-card-shade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to top, rgba(0, 0, 0, 0.28) 0%, transparent 38%); opacity: 0; transition: opacity 0.3s; }
        .cat-card:hover .cat-card-shade { opacity: 1; }
        .cat-card-cat, .cat-card-count {
          position: absolute; display: inline-flex; align-items: center; gap: 4px;
          padding: 4px 10px; border-radius: 99px; font-size: 0.64rem; font-weight: 700;
          background: color-mix(in srgb, var(--bg-2) 80%, transparent); color: var(--text-1);
          border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        }
        .cat-card-cat { top: 10px; left: 10px; text-transform: uppercase; letter-spacing: 0.07em; max-width: calc(100% - 20px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cat-card-count { bottom: 10px; right: 10px; }
        .cat-card-badges { position: absolute; bottom: 10px; left: 10px; display: flex; gap: 4px; }
        .cat-badge {
          display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 99px;
          font-size: 0.66rem; font-weight: 800; letter-spacing: 0.02em; color: white; white-space: nowrap;
        }
        .cat-badge[data-kind="sale"] { background: var(--red); box-shadow: 0 4px 12px -4px var(--red); }
        .cat-badge[data-kind="new"] { background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 4px 12px -4px var(--accent-glow); text-transform: uppercase; }
        .cat-card-body { padding: 0.8rem 0.9rem 0.9rem; display: flex; flex-direction: column; gap: 0.4rem; flex: 1; }
        .cat-card-name {
          font-weight: 700; font-size: 0.9rem; color: var(--text-1); margin: 0; letter-spacing: -0.015em; line-height: 1.3;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .cat-card-fields { font-size: 0.72rem; color: var(--text-3); margin: 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
        .cat-card-pills { display: flex; gap: 0.3rem; flex-wrap: wrap; }
        .cat-card-pill { padding: 1px 8px; border-radius: 99px; font-size: 0.66rem; font-weight: 600; background: var(--bg-3); color: var(--text-2); }
        .cat-card-foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding-top: 0.45rem; }
        .cat-card-prices { display: flex; flex-direction: column; min-width: 0; line-height: 1.1; }
        .cat-card-price { font-size: 1.1rem; font-weight: 800; color: var(--text-1); letter-spacing: -0.03em; }
        .cat-card-price[data-sale] { color: var(--red); }
        .cat-card-old { font-size: 0.74rem; font-weight: 600; color: var(--text-3); margin-top: 2px; }
        .cat-card-add {
          position: relative; z-index: 3; flex-shrink: 0;
          width: 36px; height: 36px; border-radius: 12px; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; color: white;
          background: linear-gradient(135deg, var(--accent), var(--accent-2));
          box-shadow: 0 8px 20px -6px var(--accent-glow);
          transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.3, 1), box-shadow 0.18s;
        }
        .cat-card-add:hover { transform: scale(1.08) rotate(90deg); }
        .cat-card-add:active { transform: scale(0.94); }
        .cat-card-add:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        .cat-empty {
          min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem;
          border: 1px dashed var(--border); border-radius: 22px; color: var(--text-3); font-size: 0.875rem; text-align: center; padding: 1rem;
        }
        .cat-skel { aspect-ratio: 1 / 1.4; border-radius: 18px; background: var(--bg-2); border: 1px solid var(--border); animation: pulse 1.4s ease-in-out infinite; }

        /* ── Footer ── */
        .cat-footer { margin-top: 3.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.9rem; font-size: 0.72rem; color: var(--text-3); }
        .cat-footer-cta {
          display: inline-flex; align-items: center; gap: 7px; padding: 0.55rem 1rem; border-radius: 99px;
          font-size: 0.78rem; font-weight: 700; color: var(--accent-2); text-decoration: none;
          background: var(--accent-glow); border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
          transition: transform 0.18s;
        }
        .cat-footer-cta:hover { transform: translateY(-1px); }

        /* ── Floating cart ── */
        .cat-cart-bar {
          position: fixed; z-index: 60; bottom: max(1.25rem, env(safe-area-inset-bottom)); right: 1.5rem;
          display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1.2rem 0.6rem 0.6rem;
          border-radius: 99px; border: none; cursor: pointer; color: var(--bg); background: var(--text-1);
          box-shadow: 0 18px 40px -12px color-mix(in srgb, var(--text-1) 55%, transparent);
          font-size: 0.88rem; font-weight: 700;
          animation: catRise 0.35s cubic-bezier(0.2, 0.8, 0.3, 1);
          transition: transform 0.18s;
        }
        .cat-cart-bar:hover { transform: translateY(-2px); }
        .cat-cart-bar-icon {
          position: relative; width: 40px; height: 40px; border-radius: 99px;
          display: flex; align-items: center; justify-content: center; color: white;
          background: linear-gradient(135deg, var(--accent), var(--accent-2));
        }
        .cat-cart-bar-badge {
          position: absolute; top: -4px; right: -4px; min-width: 19px; height: 19px; padding: 0 5px;
          border-radius: 99px; font-size: 0.66rem; display: flex; align-items: center; justify-content: center;
          background: var(--red); color: white; border: 2px solid var(--text-1);
        }
        .cat-cart-bar-total { padding-left: 0.75rem; border-left: 1px solid color-mix(in srgb, var(--bg) 25%, transparent); font-variant-numeric: tabular-nums; }

        /* ── Overlay / modal ── */
        @keyframes catOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes catModalIn { from { opacity: 0; transform: translateY(18px) scale(0.97); } to { opacity: 1; transform: none; } }
        @keyframes catRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @keyframes catDrawerIn { from { transform: translateX(100%); } to { transform: none; } }
        @keyframes catSheetIn { from { transform: translateY(100%); } to { transform: none; } }
        @keyframes catPulse { 0%, 100% { box-shadow: 0 0 0 3px var(--green-dim); } 50% { box-shadow: 0 0 0 6px transparent; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        .cat-overlay {
          position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center; padding: 1rem;
          background: color-mix(in srgb, var(--text-1) 45%, transparent);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); animation: catOverlayIn 0.2s ease;
        }
        .cat-modal {
          position: relative; width: 100%; max-width: 980px; max-height: 92vh;
          display: flex; flex-direction: column; overflow: hidden;
          background: var(--bg-2); border: 1px solid var(--border); border-radius: 26px;
          box-shadow: 0 30px 90px -20px color-mix(in srgb, var(--text-1) 40%, transparent);
          animation: catModalIn 0.32s cubic-bezier(0.2, 0.8, 0.3, 1);
        }
        .cat-modal-close {
          position: absolute; top: 12px; right: 12px; z-index: 6; flex-shrink: 0;
          width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--bg-2) 85%, transparent); border: 1px solid var(--border);
          border-radius: 99px; cursor: pointer; color: var(--text-1);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          transition: background 0.15s, transform 0.2s;
        }
        .cat-modal-close:hover { background: var(--bg-3); transform: rotate(90deg); }
        .cat-modal-slider { position: relative; width: 100%; aspect-ratio: 1 / 1; background: var(--bg-3); flex-shrink: 0; }
        .cat-modal-count {
          position: absolute; top: 12px; left: 12px; z-index: 4;
          padding: 3px 10px; border-radius: 99px; font-size: 0.7rem; font-weight: 700; font-variant-numeric: tabular-nums;
          background: color-mix(in srgb, var(--bg-2) 85%, transparent); color: var(--text-2); border: 1px solid var(--border);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .cat-modal-swipe { display: flex; width: 100%; height: 100%; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
        .cat-modal-swipe::-webkit-scrollbar { display: none; }
        .cat-modal-slide { position: relative; flex: 0 0 100%; scroll-snap-align: start; }
        .cat-modal-arrow {
          position: absolute; top: 50%; transform: translateY(-50%); z-index: 4;
          width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--bg-2) 85%, transparent); border: 1px solid var(--border);
          border-radius: 99px; cursor: pointer; color: var(--text-1);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: background 0.15s, transform 0.15s;
        }
        .cat-modal-arrow:hover { background: var(--bg-3); transform: translateY(-50%) scale(1.08); }
        .cat-modal-arrow[data-side="left"] { left: 12px; }
        .cat-modal-arrow[data-side="right"] { right: 12px; }
        .cat-modal-dots {
          position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); z-index: 4;
          display: flex; gap: 6px; padding: 5px 9px; border-radius: 99px;
          background: color-mix(in srgb, var(--bg-2) 80%, transparent); border: 1px solid var(--border);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .cat-modal-dot { width: 7px; height: 7px; border-radius: 99px; border: none; padding: 0; cursor: pointer; background: var(--border-hover); transition: all 0.2s; }
        .cat-modal-dot[data-active] { background: var(--accent); width: 18px; }
        .cat-modal-thumbs { display: none; }
        .cat-modal-body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; padding: 1.25rem 1.4rem 1.4rem; }
        .cat-modal-top { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding-right: 2.75rem; }
        .cat-modal-eyebrow {
          padding: 4px 12px; border-radius: 99px; font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
          background: var(--accent-glow); color: var(--accent-2); border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
        }
        .cat-modal-share {
          display: inline-flex; align-items: center; gap: 6px; padding: 0.4rem 0.85rem; border-radius: 99px;
          font-size: 0.76rem; font-weight: 700; cursor: pointer; color: var(--text-2);
          background: var(--bg-3); border: 1px solid var(--border); transition: color 0.15s, border-color 0.15s;
        }
        .cat-modal-share:hover { color: var(--accent-2); border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
        .cat-modal-title { font-size: 1.5rem; font-weight: 800; color: var(--text-1); margin: 0.85rem 0 0; letter-spacing: -0.03em; line-height: 1.2; }
        .cat-modal-price { display: flex; align-items: center; flex-wrap: wrap; gap: 0.6rem; font-size: 1.75rem; font-weight: 800; color: var(--accent-2); letter-spacing: -0.03em; margin: 0.45rem 0 0; }
        .cat-modal-old { font-size: 1rem; font-weight: 600; color: var(--text-3); letter-spacing: 0; }
        .cat-modal-group { margin-top: 1.25rem; }
        .cat-modal-section { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); margin: 0 0 0.55rem; }
        .cat-variant-list { display: flex; flex-wrap: wrap; gap: 0.45rem; }
        .cat-variant {
          min-width: 48px; padding: 0.5rem 0.95rem; border-radius: 12px; font-size: 0.84rem; font-weight: 700; cursor: pointer;
          background: var(--bg-2); color: var(--text-1); border: 1.5px solid var(--border);
          transition: border-color 0.15s, background 0.15s, transform 0.15s;
        }
        .cat-variant:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
        .cat-variant:active { transform: scale(0.96); }
        .cat-variant[data-active] { border-color: var(--accent); background: var(--accent-glow); color: var(--accent-2); }
        .cat-modal-fields { display: flex; flex-direction: column; gap: 6px; }
        .cat-modal-field { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; font-size: 0.82rem; padding: 0.55rem 0.8rem; border-radius: 10px; background: var(--bg-3); }
        .cat-modal-field span:first-child { color: var(--text-3); font-weight: 600; flex-shrink: 0; }
        .cat-modal-field span:last-child { color: var(--text-1); text-align: right; }
        .cat-modal-actions { margin-top: auto; padding-top: 1.5rem; display: flex; flex-direction: column; gap: 0.65rem; }
        .cat-buy-row { display: flex; gap: 0.6rem; }
        .cat-stepper {
          display: inline-flex; align-items: center; flex-shrink: 0; border-radius: 14px;
          background: var(--bg-3); border: 1px solid var(--border); padding: 3px;
        }
        .cat-stepper button {
          width: 38px; height: 40px; border-radius: 11px; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; background: transparent; color: var(--text-1);
          transition: background 0.15s;
        }
        .cat-stepper button:hover:not(:disabled) { background: var(--bg-2); }
        .cat-stepper button:disabled { opacity: 0.35; cursor: default; }
        .cat-stepper span { min-width: 28px; text-align: center; font-weight: 800; font-size: 0.92rem; font-variant-numeric: tabular-nums; color: var(--text-1); }
        .cat-stepper[data-size="sm"] button { width: 30px; height: 30px; border-radius: 9px; }
        .cat-stepper[data-size="sm"] span { min-width: 24px; font-size: 0.82rem; }
        .cat-add-btn {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 0.8rem 1rem; font-size: 0.92rem; border-radius: 14px;
          transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
        }
        .cat-add-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 26px var(--accent-glow); filter: brightness(1.05); }
        .cat-add-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Cart drawer ── */
        .cat-drawer-overlay { justify-content: flex-end; align-items: stretch; padding: 0; }
        .cat-drawer {
          width: min(440px, 100%); height: 100%; display: flex; flex-direction: column;
          background: var(--bg-2); border-left: 1px solid var(--border);
          box-shadow: -30px 0 80px -30px color-mix(in srgb, var(--text-1) 40%, transparent);
          animation: catDrawerIn 0.32s cubic-bezier(0.2, 0.8, 0.3, 1);
        }
        .cat-drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.1rem 1.25rem; border-bottom: 1px solid var(--border); }
        .cat-drawer-title { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 1.05rem; font-weight: 800; color: var(--text-1); letter-spacing: -0.02em; }
        .cat-drawer-badge { font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 99px; background: var(--accent); color: white; }
        .cat-drawer-list { list-style: none; margin: 0; padding: 0.75rem 1.25rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.65rem; }
        .cat-line { display: flex; gap: 0.8rem; align-items: flex-start; padding: 0.7rem; border-radius: 16px; background: var(--bg-3); animation: catRise 0.3s ease both; }
        .cat-line-media { position: relative; width: 64px; height: 64px; border-radius: 12px; overflow: hidden; flex-shrink: 0; background: var(--bg-2); display: flex; align-items: center; justify-content: center; font-size: 24px; }
        .cat-line-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .cat-line-name { margin: 0; font-size: 0.86rem; font-weight: 700; color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cat-line-variant { margin: 0; font-size: 0.72rem; font-weight: 600; color: var(--text-3); }
        .cat-line-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 4px; }
        .cat-line-row .cat-stepper { background: var(--bg-2); }
        .cat-line-price { font-size: 0.9rem; font-weight: 800; color: var(--text-1); font-variant-numeric: tabular-nums; }
        .cat-line-remove {
          width: 30px; height: 30px; border-radius: 9px; border: none; cursor: pointer; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; background: transparent; color: var(--text-3);
          transition: color 0.15s, background 0.15s;
        }
        .cat-line-remove:hover { color: var(--red); background: var(--red-dim); }
        .cat-drawer-foot { padding: 1rem 1.25rem max(1.25rem, env(safe-area-inset-bottom)); border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 0.65rem; }
        .cat-drawer-total { display: flex; align-items: baseline; justify-content: space-between; margin: 0 0 0.25rem; font-size: 0.85rem; font-weight: 600; color: var(--text-2); }
        .cat-drawer-total strong { font-size: 1.5rem; font-weight: 800; color: var(--text-1); letter-spacing: -0.03em; }
        .cat-drawer-clear {
          align-self: center; display: inline-flex; align-items: center; gap: 6px; margin-top: 0.25rem;
          font-size: 0.75rem; font-weight: 600; color: var(--text-3); background: none; border: none; cursor: pointer;
        }
        .cat-drawer-clear:hover { color: var(--red); }

        /* ── Toast ── */
        .cat-toast {
          position: fixed; z-index: 90; left: 50%; top: 1.25rem; transform: translate(-50%, -20px);
          max-width: min(92vw, 420px); padding: 0.7rem 1.1rem; border-radius: 14px;
          font-size: 0.84rem; font-weight: 700; text-align: center;
          background: var(--text-1); color: var(--bg);
          box-shadow: 0 14px 40px -12px color-mix(in srgb, var(--text-1) 55%, transparent);
          opacity: 0; pointer-events: none; transition: opacity 0.25s, transform 0.3s cubic-bezier(0.2, 0.8, 0.3, 1);
        }
        .cat-toast[data-visible] { opacity: 1; transform: translate(-50%, 0); }

        @media (min-width: 761px) {
          .cat-modal { flex-direction: row; }
          .cat-modal-slider { width: 52%; aspect-ratio: auto; min-height: 540px; }
          .cat-modal-body { width: 48%; padding: 1.9rem; }
          .cat-modal-dots { display: none; }
          .cat-modal-thumbs {
            position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 4;
            display: flex; gap: 7px; padding: 6px; border-radius: 14px; max-width: calc(100% - 28px);
            background: color-mix(in srgb, var(--bg-2) 80%, transparent); border: 1px solid var(--border);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); overflow-x: auto; scrollbar-width: none;
          }
          .cat-modal-thumbs::-webkit-scrollbar { display: none; }
          .cat-modal-thumb {
            position: relative; flex: 0 0 auto; width: 44px; height: 44px; border-radius: 9px; padding: 0;
            overflow: hidden; cursor: pointer; border: 2px solid transparent; background: var(--bg-3);
            opacity: 0.7; transition: border-color 0.15s, opacity 0.15s;
          }
          .cat-modal-thumb[data-active] { border-color: var(--accent); opacity: 1; }
          .cat-modal-thumb:hover { opacity: 1; }
        }

        @media (max-width: 760px) {
          .cat-wrap { padding: 1rem 0.9rem 7rem; }
          .cat-hero { border-radius: 24px; }
          .cat-hero-content { padding: 1.35rem 1.2rem 1.25rem; gap: 1.1rem; }
          .cat-hero-cover { aspect-ratio: 5 / 2; }
          .cat-hero-logo { width: 60px; height: 60px; border-radius: 18px; font-size: 1.55rem; }
          .cat-hero[data-cover] .cat-hero-logo { margin-top: -30px; border-width: 3px; }
          .cat-hero-contact { width: 100%; }
          .cat-toolbar { margin: 0 -0.9rem 1rem; padding: 0.65rem 0.9rem 0.55rem; }
          .cat-sort-label { display: none; }
          .cat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; }
          .cat-card { border-radius: 16px; }
          .cat-card-body { padding: 0.65rem 0.7rem 0.7rem; gap: 0.35rem; }
          .cat-card-name { font-size: 0.82rem; }
          .cat-card-fields { display: none; }
          .cat-card-price { font-size: 0.98rem; }
          .cat-card-add { width: 32px; height: 32px; border-radius: 10px; }
          .cat-card-cat { top: 8px; left: 8px; }
          .cat-card-badges { bottom: 8px; left: 8px; }
          .cat-overlay:not(.cat-drawer-overlay) { align-items: flex-end; padding: 0; }
          .cat-modal { max-height: 94vh; border-radius: 24px 24px 0 0; animation: catSheetIn 0.34s cubic-bezier(0.2, 0.8, 0.3, 1); }
          .cat-modal-slider { aspect-ratio: 1 / 1; max-height: 46vh; }
          .cat-modal-arrow { display: none; }
          .cat-modal-body { padding: 1.1rem 1.1rem max(1.1rem, env(safe-area-inset-bottom)); }
          .cat-modal-title { font-size: 1.2rem; }
          .cat-modal-price { font-size: 1.45rem; }
          .cat-drawer-overlay { align-items: flex-end; }
          .cat-drawer { width: 100%; height: auto; max-height: 88vh; border-left: none; border-radius: 24px 24px 0 0; animation: catSheetIn 0.34s cubic-bezier(0.2, 0.8, 0.3, 1); }
          .cat-cart-bar { left: 0.9rem; right: 0.9rem; justify-content: flex-start; }
          .cat-cart-bar-total { margin-left: auto; }
        }

        @media (prefers-reduced-motion: reduce) {
          .cat-page *, .cat-overlay * { animation: none !important; transition: none !important; }
        }
      `}</style>
    </div>
  );
}

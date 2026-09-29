"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCatalog } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";
import { CatalogItem } from "@/lib/types";
import { Search, Package, MessageCircle, AtSign, X, ChevronLeft, ChevronRight, Images } from "lucide-react";

function contactLink(contact: string) {
  const trimmed = contact.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (/^\+?\d{6,15}$/.test(trimmed.replace(/\s/g, ""))) {
    return `https://wa.me/${digits}`;
  }
  return `https://instagram.com/${trimmed.replace(/^@/, "")}`;
}

function CatalogCard({ item, locale, onOpen }: { item: CatalogItem; locale: string; onOpen: () => void }) {
  const { t } = useI18n();
  const images = item.images.length > 0 ? item.images : item.imageUrl ? [item.imageUrl] : [];
  return (
    <article className="cat-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}>
      <div className="cat-card-media">
        {images[0] ? (
          <Image src={images[0]} alt={item.name} fill sizes="(max-width: 760px) 50vw, 280px" style={{ objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, opacity: 0.5 }}>📦</div>
        )}
        <div className="cat-card-shade" aria-hidden="true" />
        {item.category && <span className="cat-card-cat">{item.category}</span>}
        {images.length > 1 && (
          <span className="cat-card-variants">
            <Images size={11} />
            {images.length}
          </span>
        )}
      </div>

      <div style={{ padding: "0.95rem 1.05rem 1.05rem", display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1 }}>
        <p className="cat-card-name">{item.name}</p>

        {item.fields.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {item.fields.slice(0, 4).map((field, i) => {
              const label = field.labels?.[locale as never] || field.label;
              const value = typeof field.value === "boolean" ? t(field.value ? "yes" : "no") : String(field.value);
              return (
                <p key={i} className="cat-card-field">
                  <span>{label}</span>
                  {value}
                </p>
              );
            })}
            {item.fields.length > 4 && (
              <p className="cat-card-field" style={{ fontStyle: "italic" }}>
                +{item.fields.length - 4}
              </p>
            )}
          </div>
        )}

        {item.variants.length > 0 && (
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
            {item.variants.slice(0, 5).map((variant) => (
              <span key={variant} className="cat-card-pill">{variant}</span>
            ))}
            {item.variants.length > 5 && <span className="cat-card-pill">+{item.variants.length - 5}</span>}
          </div>
        )}

        <div className="cat-card-foot">
          {item.salePrice !== undefined ? (
            <span className="cat-card-price">
              {item.salePrice.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              <em>€</em>
            </span>
          ) : <span />}
        </div>
      </div>
    </article>
  );
}

function CatalogDetailModal({ item, locale, contactLink: link, isInstagram, onClose }: {
  item: CatalogItem;
  locale: string;
  contactLink: string;
  isInstagram: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const images = item.images.length > 0 ? item.images : item.imageUrl ? [item.imageUrl] : [];
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") scrollTo(Math.max(0, index - 1));
      if (e.key === "ArrowRight") scrollTo(Math.min(images.length - 1, index + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, index, onClose]);

  function scrollTo(i: number) {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label={item.name}
      style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "color-mix(in srgb, var(--text-1) 45%, transparent)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", animation: "catOverlayIn 0.2s ease" }}
    >
      <div className="cat-modal">
        {/* Slider */}
        <button onClick={onClose} aria-label={t("catalog.close")} className="cat-modal-close">
          <X size={16} />
        </button>

        <div className="cat-modal-slider">
          <div
            ref={scrollerRef}
            className="cat-modal-swipe"
            onScroll={(e) => {
              const el = e.currentTarget;
              setIndex(Math.min(images.length - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
            }}
          >
            {images.map((src, i) => (
              <div key={i} className="cat-modal-slide">
                <Image src={src} alt={`${item.name} — ${i + 1}`} fill sizes="(max-width: 760px) 100vw, 460px" style={{ objectFit: "cover" }} priority={i === 0} />
              </div>
            ))}
          </div>
          {images.length > 1 && (
            <span className="cat-modal-count">{index + 1}/{images.length}</span>
          )}
          {images.length > 1 && (
            <>
              {index > 0 && (
                <button onClick={() => scrollTo(index - 1)} aria-label={t("catalog.prevImage")} className="cat-modal-arrow" data-side="left"><ChevronLeft size={18} /></button>
              )}
              {index < images.length - 1 && (
                <button onClick={() => scrollTo(index + 1)} aria-label={t("catalog.nextImage")} className="cat-modal-arrow" data-side="right"><ChevronRight size={18} /></button>
              )}
              <div className="cat-modal-dots">
                {images.map((_, i) => (
                  <button key={i} onClick={() => scrollTo(i)} aria-label={t("catalog.imageOf", { n: i + 1, total: images.length })} className="cat-modal-dot" data-active={i === index || undefined} />
                ))}
              </div>
              <div className="cat-modal-thumbs">
                {images.map((src, i) => (
                  <button key={i} onClick={() => scrollTo(i)} aria-label={t("catalog.imageOf", { n: i + 1, total: images.length })} className="cat-modal-thumb" data-active={i === index || undefined}>
                    <Image src={src} alt="" fill sizes="56px" style={{ objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Details */}
        <div className="cat-modal-body">
          {item.category && <span className="cat-modal-eyebrow">{item.category}</span>}
          <h2 className="cat-modal-title">{item.name}</h2>

          {item.salePrice !== undefined && (
            <p className="cat-modal-price">
              {item.salePrice.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              <em>€</em>
            </p>
          )}

          {item.fields.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "1.25rem" }}>
              <p className="cat-modal-section">{t("product.customDetails")}</p>
              {item.fields.map((field, i) => {
                const label = field.labels?.[locale as never] || field.label;
                const value = typeof field.value === "boolean" ? t(field.value ? "yes" : "no") : String(field.value);
                return (
                  <div key={i} className="cat-modal-field">
                    <span>{label}</span>
                    <span>{value}</span>
                  </div>
                );
              })}
            </div>
          )}

          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className="btn-primary"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none", fontSize: "0.9rem", padding: "0.8rem", borderRadius: 12, marginTop: "auto" }}>
              {isInstagram ? <AtSign size={16} /> : <MessageCircle size={16} />}
              {t("catalog.order")}
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function PublicCatalogPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const { t, locale } = useI18n();
  const [shop, setShop] = useState<{ name: string; catalogEnabled: boolean; catalogContact: string } | null>(null);
  const [shopLoading, setShopLoading] = useState(true);
  const { items, loading } = useCatalog(shopId);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "shops", shopId))
      .then((snap) => {
        if (!cancelled) setShop(snap.exists() ? {
          name: snap.data().name ?? "",
          catalogEnabled: snap.data().catalogEnabled === true,
          catalogContact: snap.data().catalogContact ?? "",
        } : null);
      })
      .catch(() => { if (!cancelled) setShop(null); })
      .finally(() => { if (!cancelled) setShopLoading(false); });
    return () => { cancelled = true; };
  }, [shopId]);

  const name = shop?.name ?? "";
  const catalogEnabled = shop?.catalogEnabled === true;
  const catalogContact = shop?.catalogContact ?? "";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<CatalogItem | null>(null);

  const visible = useMemo(() => items.filter((item) => !item.hidden), [items]);
  const categories = ["all", ...Array.from(new Set(visible.map((item) => item.category).filter(Boolean)))];
  const filtered = visible.filter((item) => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    const matchCat = category === "all" || item.category === category;
    return matchSearch && matchCat;
  });

  const link = contactLink(catalogContact);
  const isInstagram = !/^\+?\d{6,15}$/.test(catalogContact.replace(/\s/g, ""));
  const initials = name.trim().slice(0, 1).toUpperCase() || "•";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", position: "relative" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-25%", left: "50%", transform: "translateX(-50%)", width: "70vw", height: "50vw", maxWidth: 900, maxHeight: 600, background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 65%)", borderRadius: "50%" }} />
      </div>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "1.5rem 1.25rem 4.5rem", position: "relative" }}>

        {/* Hero */}
        <header className="cat-hero">
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <div className="cat-hero-logo" aria-hidden="true">{initials}</div>
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
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          {link && !shopLoading && catalogEnabled && (
            <a href={link} target="_blank" rel="noopener noreferrer" className="btn-primary cat-hero-cta">
              {isInstagram ? <AtSign size={15} /> : <MessageCircle size={15} />}
              {t("catalog.order")}
            </a>
          )}
        </header>

        {(shopLoading || loading) ? (
          <div className="cat-grid">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="cat-skel" style={{ animationDelay: `${i * 70}ms` }} />)}
          </div>
        ) : !catalogEnabled ? (
          <div style={{ height: "42vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem", color: "var(--text-3)" }}>
            <Package size={34} strokeWidth={1.5} />
            <p style={{ fontSize: "0.9rem", margin: 0 }}>{t("catalog.notAvailable")}</p>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }} className="cat-layout">

            {/* Category sidebar (desktop) */}
            {categories.length > 1 && (
              <aside className="cat-sidebar">
                <p className="cat-sidebar-label">{t("catalog.categoriesLabel")}</p>
                {categories.map((cat) => {
                  const active = category === cat;
                  const count = cat === "all" ? visible.length : visible.filter((item) => item.category === cat).length;
                  return (
                    <button key={cat} onClick={() => setCategory(cat)} aria-pressed={active} className="cat-side-btn" data-active={active || undefined}>
                      <span className="cat-side-btn-text">{cat === "all" ? t("all") : cat}</span>
                      <span className="cat-side-count">{count}</span>
                    </button>
                  );
                })}
              </aside>
            )}

            {/* Product area */}
            <section style={{ flex: 1, minWidth: 0 }}>
              <div className="cat-search-wrap">
                <Search size={14} className="cat-search-icon" />
                <input className="input" type="text" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: "2.5rem" }} />
              </div>

              {categories.length > 1 && (
                <div className="cat-chips">
                  {categories.map((cat) => (
                    <button key={cat} onClick={() => setCategory(cat)} className="cat-chip" data-active={category === cat || undefined}>
                      {cat === "all" ? t("all") : cat}
                    </button>
                  ))}
                </div>
              )}

              {filtered.length === 0 ? (
                <div className="cat-empty">
                  <Package size={30} strokeWidth={1.5} />
                  {t("dashboard.noResults")}
                </div>
              ) : (
                <div className="cat-grid">
                  {filtered.map((item) => <CatalogCard key={item.id} item={item} locale={locale} onOpen={() => setSelected(item)} />)}
                </div>
              )}
            </section>
          </div>
        )}

        {selected && (
          <CatalogDetailModal
            item={selected}
            locale={locale}
            contactLink={link}
            isInstagram={isInstagram}
            onClose={() => setSelected(null)}
          />
        )}
      </div>

      <style>{`
        .cat-card { cursor: pointer; }
        .cat-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        /* ── Detail modal ── */
        @keyframes catOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes catModalIn { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: none; } }
        .cat-modal {
          position: relative; width: 100%; max-width: 900px; max-height: 92vh;
          display: flex; flex-direction: column; overflow: hidden;
          background: var(--bg-2); border: 1px solid var(--border); border-radius: 22px;
          box-shadow: 0 30px 90px -20px color-mix(in srgb, var(--text-1) 40%, transparent);
          animation: catModalIn 0.3s cubic-bezier(0.2, 0.8, 0.3, 1);
        }
        .cat-modal-close {
          position: absolute; top: 12px; right: 12px; z-index: 6;
          width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--bg-2) 85%, transparent); border: 1px solid var(--border);
          border-radius: 99px; cursor: pointer; color: var(--text-1);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          transition: background 0.15s, transform 0.15s;
        }
        .cat-modal-close:hover { background: var(--bg-3); transform: scale(1.06) rotate(90deg); }
        .cat-modal-slider { position: relative; width: 100%; aspect-ratio: 1 / 1; background: var(--bg-3); flex-shrink: 0; }
        .cat-modal-slider::after {
          content: ""; position: absolute; top: 0; left: 0; right: 0; height: 72px; z-index: 1;
          pointer-events: none;
          background: linear-gradient(to bottom, color-mix(in srgb, var(--text-1) 26%, transparent), transparent);
        }
        .cat-modal-count {
          position: absolute; top: 12px; left: 12px; z-index: 4;
          padding: 3px 10px; border-radius: 99px; font-size: 0.7rem; font-weight: 700;
          font-variant-numeric: tabular-nums;
          background: color-mix(in srgb, var(--bg-2) 85%, transparent); color: var(--text-2);
          border: 1px solid var(--border);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .cat-modal-swipe {
          display: flex; width: 100%; height: 100%;
          overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none;
        }
        .cat-modal-swipe::-webkit-scrollbar { display: none; }
        .cat-modal-slide { position: relative; flex: 0 0 100%; scroll-snap-align: start; }
        .cat-modal-arrow {
          position: absolute; top: 50%; transform: translateY(-50%); z-index: 4;
          width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--bg-2) 85%, transparent); border: 1px solid var(--border);
          border-radius: 99px; cursor: pointer; color: var(--text-1);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          transition: background 0.15s, transform 0.15s;
        }
        .cat-modal-arrow:hover { background: var(--bg-3); transform: translateY(-50%) scale(1.08); }
        .cat-modal-arrow[data-side="left"] { left: 12px; }
        .cat-modal-arrow[data-side="right"] { right: 12px; }
        .cat-modal-dots {
          position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); z-index: 4;
          display: flex; gap: 6px; padding: 5px 9px; border-radius: 99px;
          background: color-mix(in srgb, var(--bg-2) 80%, transparent);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid var(--border);
        }
        .cat-modal-dot { width: 7px; height: 7px; border-radius: 99px; border: none; padding: 0; cursor: pointer; background: var(--border-hover); transition: all 0.2s; }
        .cat-modal-dot[data-active] { background: var(--accent); width: 18px; }
        .cat-modal-thumbs { display: none; }
        .cat-modal-body {
          display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto;
          padding: 1.25rem 1.4rem 1.4rem; gap: 0;
        }
        .cat-modal-eyebrow {
          align-self: flex-start; padding: 4px 12px; border-radius: 99px;
          font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
          background: var(--accent-glow); color: var(--accent-2);
          border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
        }
        .cat-modal-section {
          font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--text-3); margin: 0 0 0.55rem;
        }
        .cat-modal-field {
          display: flex; justify-content: space-between; align-items: baseline; gap: 1rem;
          font-size: 0.82rem; padding: 0.55rem 0.8rem; border-radius: 10px; background: var(--bg-3);
        }
        .cat-modal-field span:first-child { color: var(--text-3); font-weight: 600; flex-shrink: 0; }
        .cat-modal-field span:last-child { color: var(--text-1); text-align: right; }
        .cat-modal-title { font-size: 1.35rem; font-weight: 800; color: var(--text-1); margin: 0.75rem 0 0; letter-spacing: -0.02em; line-height: 1.25; }
        .cat-modal-price {
          display: flex; align-items: baseline; gap: 3px;
          font-size: 1.6rem; font-weight: 800; color: var(--accent-2); letter-spacing: -0.02em;
          margin: 0.6rem 0 0;
        }
        .cat-modal-price em { font-style: normal; font-size: 1rem; font-weight: 700; opacity: 0.75; }
        .cat-modal-body .btn-primary {
          margin-top: 1.5rem; padding: 0.9rem; font-size: 0.92rem; border-radius: 13px;
          transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
        }
        .cat-modal-body .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 24px var(--accent-glow); filter: brightness(1.05); }

        @media (min-width: 761px) {
          .cat-modal { flex-direction: row; aspect-ratio: auto; }
          .cat-modal-slider { width: 50%; aspect-ratio: auto; min-height: 480px; }
          .cat-modal-body { width: 50%; padding: 1.75rem 1.75rem; overflow-y: auto; }
          .cat-modal-dots { display: none; }
          .cat-modal-thumbs {
            position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 4;
            display: flex; gap: 7px; padding: 6px; border-radius: 14px; max-width: calc(100% - 28px);
            background: color-mix(in srgb, var(--bg-2) 80%, transparent);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid var(--border);
            overflow-x: auto; scrollbar-width: none;
          }
          .cat-modal-thumbs::-webkit-scrollbar { display: none; }
          .cat-modal-thumb {
            position: relative; flex: 0 0 auto; width: 44px; height: 44px; border-radius: 9px;
            overflow: hidden; cursor: pointer; border: 2px solid transparent; padding: 0;
            background: var(--bg-3); transition: border-color 0.15s, opacity 0.15s; opacity: 0.7;
          }
          .cat-modal-thumb[data-active] { border-color: var(--accent); opacity: 1; }
          .cat-modal-thumb:hover { opacity: 1; }
        }
        @media (max-width: 760px) {
          .cat-modal { max-height: 94vh; border-radius: 20px; }
          .cat-modal-slider { aspect-ratio: 4 / 5; }
          .cat-modal-arrow { display: none; }
          .cat-modal-body { padding: 1.1rem 1.15rem 1.25rem; }
          .cat-modal-title { font-size: 1.15rem; }
        }

        /* ── Hero ── */
        .cat-hero {
          display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
          margin-bottom: 2rem; padding: 1.35rem 1.5rem;
          background: color-mix(in srgb, var(--bg-2) 88%, transparent);
          border: 1px solid var(--border); border-radius: 22px;
          box-shadow: 0 1px 2px color-mix(in srgb, var(--text-1) 6%, transparent);
        }
        .cat-hero-logo {
          width: 52px; height: 52px; border-radius: 15px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.35rem; font-weight: 800; color: white; letter-spacing: -0.02em;
          background: linear-gradient(135deg, var(--accent), var(--accent-2));
          box-shadow: 0 6px 18px var(--accent-glow);
        }
        .cat-hero-title {
          font-size: 1.35rem; font-weight: 800; color: var(--text-1); margin: 0;
          letter-spacing: -0.025em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .cat-hero-sub { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 600; color: var(--text-3); margin: 3px 0 0; }
        .cat-hero-dot { width: 6px; height: 6px; border-radius: 99px; background: var(--green); box-shadow: 0 0 0 3px var(--green-dim); }
        .cat-hero-cta { display: inline-flex; align-items: center; gap: 7px; text-decoration: none; font-size: 0.85rem; padding: 0.65rem 1.2rem; border-radius: 12px; }
        .cat-hero-skel { width: 160px; height: 22px; border-radius: 8px; background: var(--bg-3); animation: pulse 1.4s ease-in-out infinite; }

        /* ── Sidebar ── */
        .cat-sidebar {
          position: sticky; top: 1.25rem; flex-shrink: 0; width: 216px;
          background: var(--bg-2); border: 1px solid var(--border); border-radius: 18px;
          padding: 0.6rem;
        }
        .cat-sidebar-label {
          font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--text-3); margin: 0.35rem 0.7rem 0.55rem;
        }
        .cat-side-btn {
          display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
          padding: 0.55rem 0.7rem; border-radius: 11px; font-size: 0.82rem; font-weight: 500;
          border: 1px solid transparent; background: transparent; color: var(--text-2);
          cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s;
          white-space: nowrap;
        }
        .cat-side-btn:hover { background: var(--bg-3); }
        .cat-side-btn[data-active] { background: var(--accent-glow); border-color: color-mix(in srgb, var(--accent) 25%, transparent); color: var(--accent-2); font-weight: 700; }
        .cat-side-btn-text { overflow: hidden; text-overflow: ellipsis; flex: 1; }
        .cat-side-count {
          font-size: 0.68rem; font-weight: 700; flex-shrink: 0;
          background: var(--bg-3); color: var(--text-3); border-radius: 99px; padding: 1px 7px;
        }
        .cat-side-btn[data-active] .cat-side-count { background: var(--accent); color: white; }

        /* ── Search / chips ── */
        .cat-search-wrap { position: relative; margin-bottom: 1rem; }
        .cat-search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-3); }
        .cat-chips { display: none; gap: 0.4rem; overflow-x: auto; margin-bottom: 1rem; padding-bottom: 2px; scrollbar-width: none; }
        .cat-chips::-webkit-scrollbar { display: none; }
        .cat-chip {
          flex: 0 0 auto; padding: 0.32rem 0.9rem; border-radius: 99px; font-size: 0.76rem; font-weight: 600;
          border: 1px solid var(--border); cursor: pointer; transition: all 0.15s;
          background: var(--bg-2); color: var(--text-2);
        }
        .cat-chip[data-active] { background: var(--accent); border-color: var(--accent); color: white; }

        /* ── Grid + cards ── */
        .cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(235px, 1fr)); gap: 1.1rem; }
        .cat-card {
          display: flex; flex-direction: column; height: 100%;
          background: var(--bg-2); border: 1px solid var(--border); border-radius: 18px;
          overflow: hidden; position: relative;
          transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.3, 1), box-shadow 0.25s, border-color 0.25s;
        }
        .cat-card:hover {
          transform: translateY(-4px);
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
          box-shadow: 0 14px 40px -12px color-mix(in srgb, var(--accent) 22%, transparent), 0 6px 18px -6px color-mix(in srgb, var(--text-1) 10%, transparent);
        }
        .cat-card-media { position: relative; width: 100%; aspect-ratio: 1 / 1; background: var(--bg-3); overflow: hidden; }
        .cat-card-media img { transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.3, 1); }
        .cat-card:hover .cat-card-media img { transform: scale(1.05); }
        .cat-card-shade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to top, color-mix(in srgb, var(--text-1) 22%, transparent) 0%, transparent 32%); opacity: 0; transition: opacity 0.25s; }
        .cat-card:hover .cat-card-shade { opacity: 1; }
        .cat-card-cat {
          position: absolute; top: 10px; left: 10px;
          padding: 3px 9px; border-radius: 99px; font-size: 0.65rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.06em;
          background: color-mix(in srgb, var(--bg-2) 78%, transparent);
          color: var(--text-2); border: 1px solid var(--border);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .cat-card-variants {
          position: absolute; bottom: 10px; right: 10px;
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 9px; border-radius: 99px; font-size: 0.66rem; font-weight: 700;
          background: color-mix(in srgb, var(--bg-2) 78%, transparent);
          color: var(--text-2); border: 1px solid var(--border);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .cat-card-name { font-weight: 700; font-size: 0.95rem; color: var(--text-1); margin: 0; letter-spacing: -0.01em; line-height: 1.35; }
        .cat-card-field { font-size: 0.75rem; color: var(--text-3); margin: 0; display: flex; gap: 5px; }
        .cat-card-field span { color: var(--text-2); font-weight: 600; flex-shrink: 0; }
        .cat-card-pill { padding: 2px 9px; border-radius: 99px; font-size: 0.7rem; font-weight: 600; background: var(--bg-3); color: var(--text-2); border: 1px solid var(--border); }
        .cat-card-foot { margin-top: auto; display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; padding-top: 0.7rem; border-top: 1px solid var(--border); }
        .cat-card-price { font-size: 1.25rem; font-weight: 800; color: var(--accent-2); letter-spacing: -0.02em; }
        .cat-card-price em { font-style: normal; font-size: 0.85rem; font-weight: 700; margin-left: 2px; opacity: 0.75; }

        .cat-empty {
          min-height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem;
          border: 1px dashed var(--border); border-radius: 18px; color: var(--text-3); font-size: 0.875rem;
        }
        .cat-skel { aspect-ratio: 1 / 1.35; border-radius: 18px; background: var(--bg-2); border: 1px solid var(--border); animation: pulse 1.4s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

        @media (max-width: 760px) {
          .cat-layout { display: block !important; }
          .cat-sidebar { display: none !important; }
          .cat-chips { display: flex !important; }
          .cat-hero { padding: 1.1rem 1.15rem; }
          .cat-hero-title { font-size: 1.15rem; }
          .cat-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.75rem; }
          .cat-card-name { font-size: 0.88rem; }
          .cat-card-price { font-size: 1.1rem; }
        }
      `}</style>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useProducts, useShop, useShopMoney, useSales } from "@/lib/hooks";
import { updateCatalogSettings, recordSale } from "@/lib/actions";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { CATALOG_CHANNELS, CatalogChannels, hasAnyChannel, isValidChannel } from "@/lib/catalog-channels";
import { usePagination } from "@/lib/use-pagination";
import ListPagination from "@/components/ListPagination";
import CatalogBrandingFields from "@/components/CatalogBrandingFields";
import CurrencySettingsCard from "@/components/CurrencySettingsCard";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Product, ProductVariant } from "@/lib/types";
import { BASE_CURRENCY } from "@/lib/currency";
import { Plus, Search, AlertTriangle, Package, TrendingDown, Layers, ArrowRight, DollarSign, Store, Copy, Check, ExternalLink, ShoppingBag, X, CheckCircle, RefreshCw } from "lucide-react";

function QuickSellModal({ product, shopId, actorUid, actorName, onClose }: {
  product: Product; shopId: string; actorUid: string; actorName: string; onClose: () => void;
}) {
  const { t } = useI18n();
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(product.salePrice !== undefined ? String(product.salePrice) : "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getDocs(collection(db, "shops", shopId, "products", product.id, "variants")).then((snap) => {
      const v = snap.docs.map((d) => ({ id: d.id, label: d.data().label ?? "", sku: d.data().sku ?? "", quantity: d.data().quantity ?? 0 }));
      setVariants(v);
      const first = v.find((x) => x.quantity > 0) ?? v[0];
      if (first) setVariantId(first.id);
    });
  }, [shopId, product.id]);

  async function handleSell() {
    const unitPrice = parseFloat(price.replace(",", "."));
    if (!variantId || !Number.isFinite(unitPrice) || unitPrice < 0) { setError(t("sales.invalidPrice")); return; }
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) return;
    setSaving(true); setError("");
    try {
      await recordSale(shopId, [{ productId: product.id, productName: product.name, variantId, variantLabel: variant.label, quantity: qty, unitPrice }],
        { channel: "store", buyerName: "", buyerContact: "" }, actorUid, actorName);
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (e) { setError(translateError(e, t, "sales.atomicFailure")); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "1rem" }} onClick={onClose}>
      <div className="glass" style={{ width: "100%", maxWidth: 400, padding: "1.5rem", borderRadius: 18, display: "flex", flexDirection: "column", gap: "1rem" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", color: "var(--text-1)" }}>{t("dashboard.quickSellTitle", { name: product.name })}</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", display: "flex" }}><X size={18} /></button>
        </div>
        {done ? (
          <div style={{ textAlign: "center", padding: "1rem 0", color: "var(--green)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <CheckCircle size={36} />
            <span style={{ fontWeight: 600 }}>{t("dashboard.quickSellSuccess")}</span>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <label style={{ fontSize: "0.75rem", color: "var(--text-3)", fontWeight: 600 }}>{t("dashboard.quickSellVariant")}</label>
              <select className="input" value={variantId} onChange={(e) => setVariantId(e.target.value)} style={{ fontSize: "0.85rem" }}>
                {variants.map((v) => <option key={v.id} value={v.id}>{v.label} · {v.quantity}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.75rem", color: "var(--text-3)", fontWeight: 600 }}>{t("dashboard.quickSellQty")}</label>
                <input className="input" type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} style={{ fontSize: "0.85rem" }} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.75rem", color: "var(--text-3)", fontWeight: 600 }}>{t("dashboard.quickSellPrice")} ({BASE_CURRENCY})</label>
                <input className="input" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} style={{ fontSize: "0.85rem" }} />
              </div>
            </div>
            {error && <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--red)" }}>{error}</p>}
            <button className="btn-primary" onClick={handleSell} disabled={saving} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <ShoppingBag size={15} />{saving ? t("sales.confirming") : t("dashboard.quickSellConfirm")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CatalogSettingsCard({ shopId }: { shopId: string }) {
  const { t } = useI18n();
  const { catalogEnabled, channels, logoUrl, coverUrl, loading } = useShop(shopId);
  const [draft, setDraft] = useState<CatalogChannels | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const effectiveChannels = draft ?? channels;
  const channelsValid = hasAnyChannel(effectiveChannels);
  const catalogUrl = typeof window !== "undefined" ? `${window.location.origin}/catalog/${shopId}` : "";

  async function save(enabled: boolean) {
    setError(""); setSaving(true);
    try {
      await updateCatalogSettings(shopId, { enabled, channels: effectiveChannels });
      setDraft(null);
    } catch (err: unknown) {
      setError(translateError(err, t, "catalog.error"));
    } finally { setSaving(false); }
  }

  if (loading) return null;

  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-glow)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Store size={17} color="var(--accent-2)" />
          </div>
          <div>
            <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{t("catalog.settingsTitle")}</p>
            <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: 0 }}>{t("catalog.settingsDesc")}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: catalogEnabled ? "var(--green)" : "var(--text-3)" }}>
            {catalogEnabled ? t("catalog.on") : t("catalog.off")}
          </span>
          <button
            onClick={() => save(!catalogEnabled)}
            disabled={saving || (!catalogEnabled && !channelsValid)}
            aria-pressed={catalogEnabled}
            style={{
              width: 44, height: 24, borderRadius: 99, position: "relative", cursor: "pointer",
              border: "none", transition: "background 0.2s",
              background: catalogEnabled ? "var(--accent)" : "var(--bg-3)",
              opacity: saving ? 0.6 : 1,
            }}>
            <span style={{
              position: "absolute", top: 3, left: catalogEnabled ? 23 : 3, width: 18, height: 18,
              borderRadius: "50%", background: "white", transition: "left 0.2s",
            }} />
          </button>
        </div>
      </div>

      <div className="catalog-channels">
        {CATALOG_CHANNELS.map((channel) => {
          const value = effectiveChannels[channel];
          const invalid = value.trim() !== "" && !isValidChannel(channel, value);
          return (
            <input key={channel} className="input" type={channel === "whatsapp" ? "tel" : "text"} inputMode={channel === "whatsapp" ? "tel" : "text"}
              aria-label={t(`catalog.${channel}Placeholder`)} placeholder={t(`catalog.${channel}Placeholder`)} value={value} aria-invalid={invalid || undefined}
              onChange={(e) => setDraft({ ...effectiveChannels, [channel]: e.target.value })}
              style={invalid ? { borderColor: "var(--red)" } : undefined} />
          );
        })}
      </div>
      <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: 0 }}>{t("catalog.channelsHint")}</p>

      <CatalogBrandingFields shopId={shopId} logoUrl={logoUrl} coverUrl={coverUrl} />

      {catalogEnabled && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <a href={`/catalog/${shopId}`} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", color: "var(--accent-2)", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 9, padding: "0.5rem 0.8rem" }}>
            <ExternalLink size={13} /> {t("catalog.open")}
          </a>
          <button
            onClick={() => { navigator.clipboard.writeText(catalogUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", color: "var(--text-2)", background: "transparent", border: "1px solid var(--border)", borderRadius: 9, padding: "0.5rem 0.8rem", cursor: "pointer" }}>
            {copied ? <Check size={13} color="var(--green)" /> : <Copy size={13} />}
            {copied ? t("catalog.copied") : t("catalog.copyLink")}
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving || !channelsValid}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", color: "var(--text-2)", background: "transparent", border: "1px solid var(--border)", borderRadius: 9, padding: "0.5rem 0.8rem", cursor: saving || !channelsValid ? "default" : "pointer", opacity: saving || !channelsValid ? 0.6 : 1 }}>
            <RefreshCw size={13} /> {t("catalog.refreshStock")}
          </button>
        </div>
      )}
      {(() => {
        // While the catalog is off, a contact is optional. Once it is on, a
        // publishable channel is required or customers would have no way to
        // order, so the save stays disabled until one is valid.
        const needsChannel = catalogEnabled && !channelsValid;
        const disabled = saving || draft === null || needsChannel;
        return (
          <button onClick={() => save(catalogEnabled)} disabled={disabled}
            style={{ alignSelf: "flex-start", fontSize: "0.75rem", color: "var(--accent-2)", background: "none", border: "none", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, padding: 0 }}>
            {t("catalog.saveContact")}
          </button>
        );
      })()}
      {error && <p style={{ fontSize: "0.78rem", color: "var(--red)", margin: 0 }}>{error}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const { products, loading } = useProducts(profile?.shopId);
  const { money } = useShopMoney(profile?.shopId, INTL_LOCALES[locale]);
  const { sales } = useSales(profile?.shopId, 200);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [quickSellProduct, setQuickSellProduct] = useState<Product | null>(null);

  const categories = ["all", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];
  const lowStock = products.filter((p) => p.minStock > 0 && p.totalQuantity <= p.minStock);
  const totalItems = products.reduce((s, p) => s + p.totalQuantity, 0);
  const inventoryValue = products
    .filter((p) => p.costPrice && p.costPrice > 0)
    .reduce((s, p) => s + (p.costPrice ?? 0) * p.totalQuantity, 0);
  const hasValue = inventoryValue > 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRevenue = sales
    .filter((s) => s.createdAt && s.createdAt >= monthStart)
    .reduce((sum, s) => sum + s.total, 0);

  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "all" || p.category === category;
    return matchSearch && matchCat;
  });

  const pagingLabels = {
    loadMore: t("paging.loadMore"),
    loading: t("paging.loading"),
    showing: t("paging.showing"),
    of: t("paging.of"),
    page: t("paging.page"),
    prev: t("paging.prev"),
    next: t("paging.next"),
  };

  const paging = usePagination(filtered, [search, category, products.length]);

  if (loading) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>;

  const stats = [
    { icon: Package, label: t("dashboard.totalProducts"), value: products.length, color: "#6366f1", bg: "rgba(99,102,241,0.1)" },
    { icon: Layers, label: t("dashboard.totalItems"), value: totalItems, color: "#22d3ee", bg: "rgba(34,211,238,0.08)" },
    { icon: TrendingDown, label: t("dashboard.lowStock"), value: lowStock.length, color: lowStock.length > 0 ? "var(--amber)" : "var(--green)", bg: lowStock.length > 0 ? "var(--amber-dim)" : "var(--green-dim)" },
    ...(hasValue ? [{ icon: DollarSign, label: t("dashboard.inventoryValue"), value: money(inventoryValue, { maximumFractionDigits: 0 }), color: "#a855f7", bg: "rgba(168,85,247,0.1)" }] : []),
    ...(monthRevenue > 0 ? [{ icon: ShoppingBag, label: t("dashboard.monthRevenue"), value: money(monthRevenue, { minimumFractionDigits: 2 }), color: "var(--green)", bg: "var(--green-dim)" }] : []),
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
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`, gap: "0.875rem" }} className="dashboard-stats">
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

      {/* Shop settings (owner only) */}
      {profile?.role === "owner" && profile.shopId && (
        <>
          <CurrencySettingsCard shopId={profile.shopId} />
          <CatalogSettingsCard shopId={profile.shopId} />
        </>
      )}

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
          {paging.visible.map((product) => {
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
                      <Image src="/android-chrome-512x512.png" alt="" aria-hidden="true" width={42} height={42} style={{ width: 42, height: 42, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
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
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <button
                        onClick={(e) => { e.preventDefault(); setQuickSellProduct(product); }}
                        disabled={product.totalQuantity === 0}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "0.35rem 0.65rem", background: "var(--accent-glow)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, color: "var(--accent-2)", fontSize: "0.72rem", fontWeight: 600, cursor: product.totalQuantity === 0 ? "default" : "pointer", opacity: product.totalQuantity === 0 ? 0.4 : 1 }}>
                        <ShoppingBag size={12} />{t("dashboard.quickSell")}
                      </button>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--bg-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ArrowRight size={14} color="var(--text-3)" />
                      </div>
                    </div>
                  </div>
                </div>
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

      {quickSellProduct && profile && (
        <QuickSellModal
          product={quickSellProduct}
          shopId={profile.shopId}
          actorUid={profile.uid}
          actorName={profile.displayName}
          onClose={() => setQuickSellProduct(null)}
        />
      )}
    </div>
  );
}

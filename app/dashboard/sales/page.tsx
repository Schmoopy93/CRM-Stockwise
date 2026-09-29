"use client";

import { useState, lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth-context";
import { useProducts, useSales } from "@/lib/hooks";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { findProductByCode, PartialReceiptError, recordSale } from "@/lib/actions";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Product, ProductVariant, SaleChannel } from "@/lib/types";
import { Plus, Minus, ShoppingBag, CheckCircle, Barcode, Search, Trash2, AtSign, History } from "lucide-react";

const BarcodeScanner = lazy(() =>
  import("@/components/BarcodeScanner").then((m) => ({ default: m.BarcodeScanner }))
);

const CHANNELS: SaleChannel[] = ["instagram", "facebook", "store", "phone", "other"];

interface SaleEntry { product: Product; variants: ProductVariant[]; variantId: string; quantity: number; unitPrice: string; }

export default function SalesPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const intlLocale = INTL_LOCALES[locale];
  const { products } = useProducts(profile?.shopId);
  const { sales } = useSales(profile?.shopId);
  const [lines, setLines] = useState<SaleEntry[]>([]);
  const [search, setSearch] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<SaleChannel>("instagram");
  const [buyerName, setBuyerName] = useState("");
  const [buyerInstagram, setBuyerInstagram] = useState("");
  const [note, setNote] = useState("");

  const filtered = search.length > 1
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
    : [];

  const total = lines.reduce((sum, line) => sum + line.quantity * (parseFloat(line.unitPrice.replace(",", ".")) || 0), 0);

  async function addLine(product: Product, preferredVariantId?: string) {
    if (!profile) return;
    setError("");
    try {
      const existingLines = lines.filter((line) => line.product.id === product.id);
      let variants = existingLines[0]?.variants;
      if (!variants) {
        setLoadingVariants(true);
        const snap = await getDocs(collection(db, "shops", profile.shopId, "products", product.id, "variants"));
        variants = snap.docs.map((d) => ({
          id: d.id,
          label: d.data().label ?? "",
          sku: d.data().sku ?? "",
          quantity: d.data().quantity ?? 0,
        }));
      }
      if (variants.length === 0) {
        setError(t("receive.noVariants"));
        return;
      }
      const usedVariantIds = new Set(existingLines.map((line) => line.variantId));
      const selectedVariant = variants.find((variant) => variant.id === preferredVariantId && !usedVariantIds.has(variant.id))
        ?? variants.find((variant) => !usedVariantIds.has(variant.id) && variant.quantity > 0)
        ?? variants.find((variant) => !usedVariantIds.has(variant.id));
      if (!selectedVariant) {
        setError(t("receive.allVariantsAdded"));
        return;
      }
      setLines((prev) => [...prev, {
        product,
        variants,
        variantId: selectedVariant.id,
        quantity: 1,
        unitPrice: product.salePrice !== undefined ? String(product.salePrice) : "",
      }]);
    } catch {
      setError(t("receive.loadVariantsError"));
    } finally {
      setLoadingVariants(false);
    }
    setSearch("");
  }

  async function handleScan(code: string) {
    setShowScanner(false);
    if (!profile) return;
    try {
      const match = await findProductByCode(profile.shopId, products, code);
      if (match) {
        await addLine(match.product, match.variantId);
        return;
      }
      setError(t("receive.notFound", { code }));
      setTimeout(() => setError(""), 4000);
    } catch {
      setError(t("receive.loadVariantsError"));
    }
  }

  function updateQty(idx: number, delta: number) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l));
  }

  async function handleConfirm() {
    if (!profile || lines.length === 0) return;
    const unitPrices = lines.map((line) => {
      const price = parseFloat(line.unitPrice.replace(",", "."));
      return Number.isFinite(price) ? price : -1;
    });
    if (unitPrices.some((price) => price < 0)) {
      setError(t("sales.invalidPrice"));
      return;
    }
    setSaving(true); setError("");
    try {
      await recordSale(
        profile.shopId,
        lines.map((line, idx) => ({
          productId: line.product.id,
          productName: line.product.name,
          variantId: line.variantId,
          variantLabel: line.variants.find((v) => v.id === line.variantId)?.label ?? "",
          quantity: line.quantity,
          unitPrice: unitPrices[idx],
        })),
        { channel, buyerName, buyerInstagram, note },
        profile.uid,
        profile.displayName
      );
      setDone(true); setLines([]); setBuyerName(""); setBuyerInstagram(""); setNote("");
    } catch (cause) {
      if (cause instanceof PartialReceiptError) {
        const completed = new Set(cause.completedLineKeys);
        setLines((current) => current.filter((line) => !completed.has(`${line.product.id}/${line.variantId}`)));
        setError(t("receive.partialFailure", { n: completed.size }));
      } else {
        setError(translateError(cause, t, "sales.atomicFailure"));
      }
    }
    finally { setSaving(false); }
  }

  if (done) return (
    <div className="fade-up" style={{ maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <CheckCircle size={56} color="var(--green)" style={{ marginBottom: "1rem" }} />
      <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text-1)", margin: "0 0 0.5rem" }}>{t("sales.success")}</h2>
      <p style={{ color: "var(--text-2)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>{t("sales.successNote")}</p>
      <button className="btn-primary" onClick={() => setDone(false)}>{t("sales.newSale")}</button>
    </div>
  );

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: 640 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{t("sales.title")}</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-2)", marginTop: 4 }}>{t("sales.subtitle")}</p>
        </div>
        <button onClick={() => setShowScanner(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "0.55rem 1rem", background: "var(--accent-glow)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 10, color: "var(--accent-2)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>
          <Barcode size={15} /> {t("receive.scan")}
        </button>
      </div>

      <div style={{ position: "relative" }}>
        <Search size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
        <input className="input" placeholder={t("sales.searchAdd")} value={search} onChange={(e) => setSearch(e.target.value)} disabled={loadingVariants || saving} style={{ paddingLeft: "2.5rem" }} />
        {filtered.length > 0 && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
            {filtered.slice(0, 6).map((p) => (
              <button key={p.id} onClick={() => void addLine(p)} disabled={loadingVariants || saving}
                style={{ width: "100%", textAlign: "left", padding: "0.75rem 1rem", background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text-1)", fontSize: "0.875rem" }}
                onMouseOver={(e) => (e.currentTarget.style.background = "var(--bg-3)")}
                onMouseOut={(e) => (e.currentTarget.style.background = "none")}>
                <span style={{ fontWeight: 500 }}>{p.name}</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>{p.sku || "—"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div style={{ background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "0.82rem", color: "var(--red)" }}>{error}</div>}

      {lines.length === 0 ? (
        <div style={{ height: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px dashed var(--border)", borderRadius: 16, gap: "0.5rem", color: "var(--text-3)" }}>
          <ShoppingBag size={28} /><span style={{ fontSize: "0.875rem" }}>{t("sales.empty")}</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {lines.map((line, idx) => (
            <div key={`${line.product.id}/${line.variantId}`} className="glass receipt-line" style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
              <div className="receipt-line-info" style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-1)", margin: 0 }}>{line.product.name}</p>
                <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: "2px 0 0" }}>{t("receive.currentStock")}: {line.product.totalQuantity}</p>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.5rem" }}>
                  <select
                    className="input"
                    aria-label={t("receive.variant")}
                    value={line.variantId}
                    onChange={(event) => setLines((current) => current.map((item, i) => i === idx ? { ...item, variantId: event.target.value } : item))}
                    style={{ maxWidth: 220, padding: "0.4rem 0.6rem", fontSize: "0.78rem" }}
                  >
                    {line.variants.map((variant) => (
                      <option key={variant.id} value={variant.id} disabled={lines.some((other, otherIndex) => otherIndex !== idx && other.product.id === line.product.id && other.variantId === variant.id)}>
                        {variant.label} · {t("receive.variantStock", { qty: variant.quantity })}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label={t("sales.unitPrice")}
                    placeholder={t("sales.unitPrice")}
                    value={line.unitPrice}
                    onChange={(event) => setLines((current) => current.map((item, i) => i === idx ? { ...item, unitPrice: event.target.value } : item))}
                    style={{ width: 100, padding: "0.4rem 0.6rem", fontSize: "0.78rem" }}
                  />
                </div>
              </div>
              <div className="receipt-controls" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button onClick={() => updateQty(idx, -1)} style={{ width: 30, height: 30, background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Minus size={13} /></button>
                <input type="number" min="1" step="1" value={line.quantity} onChange={(e) => setLines((p) => p.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } : l))}
                  style={{ width: 56, background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.3rem 0.5rem", textAlign: "center", fontSize: "0.9rem", fontWeight: 700, color: "var(--text-1)", outline: "none" }} />
                <button onClick={() => updateQty(idx, 1)} style={{ width: 30, height: 30, background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={13} /></button>
                <button onClick={() => setLines((current) => current.filter((_, i) => i !== idx))} aria-label={t("receive.removeLine")} style={{ width: 30, height: 30, background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "var(--red)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "1.25rem", background: "var(--bg-3)", borderRadius: 14, border: "1px solid var(--border)" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "var(--text-1)", fontSize: "0.9rem" }}>{t("sales.buyer")}</p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <select className="input" aria-label={t("sales.channel")} value={channel} onChange={(e) => setChannel(e.target.value as SaleChannel)} style={{ width: 160, padding: "0.5rem 0.6rem", fontSize: "0.82rem" }}>
              {CHANNELS.map((ch) => <option key={ch} value={ch}>{t(`sales.channel.${ch}`)}</option>)}
            </select>
            <input className="input" placeholder={t("sales.buyerNamePlaceholder")} maxLength={100} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} disabled={saving} style={{ flex: 1, minWidth: 140, padding: "0.5rem 0.75rem", fontSize: "0.82rem" }} />
            <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
              {channel === "instagram" && <AtSign size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />}
              <input className="input" placeholder={channel === "instagram" ? t("sales.instagramPlaceholder") : t("sales.buyerInstagram")} maxLength={100}
                value={buyerInstagram} onChange={(e) => setBuyerInstagram(e.target.value)} disabled={saving}
                style={{ width: "100%", paddingLeft: channel === "instagram" ? "2rem" : "0.75rem", padding: "0.5rem 0.75rem", fontSize: "0.82rem" }} />
            </div>
          </div>
          <input className="input" placeholder={t("sales.notePlaceholder")} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: "var(--text-1)" }}>
                {t("sales.summary", { n: lines.length, qty: lines.reduce((s, l) => s + l.quantity, 0) })}
                {total > 0 && <span style={{ color: "var(--accent-2)" }}> · €{total.toLocaleString(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--text-2)" }}>{t("sales.summaryNote")}</p>
            </div>
            <button className="btn-primary" onClick={handleConfirm} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle size={15} />{saving ? t("sales.confirming") : t("sales.confirm")}
            </button>
          </div>
        </div>
      )}

      {sales.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "0.75rem" }}>
            <History size={15} color="var(--text-3)" />
            <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{t("sales.history")}</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {sales.map((sale) => (
              <div key={sale.id} className="glass" style={{ padding: "0.875rem 1.125rem", borderRadius: 12, display: "flex", alignItems: "center", gap: "0.875rem", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: "var(--text-1)" }}>
                    {sale.lines.map((line) => `${line.productName} ×${line.quantity}`).join(", ")}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: "0.72rem", color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{t(`sales.channel.${sale.channel}`)}</span>
                    {sale.buyerName && <span>· {sale.buyerName}</span>}
                    {sale.buyerInstagram && <span>· @{sale.buyerInstagram}</span>}
                    {sale.createdAt && <span>· {sale.createdAt.toLocaleString(intlLocale)}</span>}
                  </p>
                </div>
                <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--green)" }}>€{sale.total.toLocaleString(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}
    </div>
  );
}

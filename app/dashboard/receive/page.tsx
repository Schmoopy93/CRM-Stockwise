"use client";

import { useState, lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth-context";
import { useProducts } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";
import { PartialReceiptError, receiveStock } from "@/lib/actions";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Product, ProductVariant } from "@/lib/types";
import { Plus, Minus, PackagePlus, CheckCircle, Barcode, Search, Trash2 } from "lucide-react";

const BarcodeScanner = lazy(() =>
  import("@/components/BarcodeScanner").then((m) => ({ default: m.BarcodeScanner }))
);

interface ReceiptLine { product: Product; variants: ProductVariant[]; variantId: string; quantity: number; }

export default function ReceivePage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const { products } = useProducts(profile?.shopId);
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [search, setSearch] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const filtered = search.length > 1
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
    : [];

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
        ?? variants.find((variant) => !usedVariantIds.has(variant.id));
      if (!selectedVariant) {
        setError(t("receive.allVariantsAdded"));
        return;
      }
      setLines((prev) => [...prev, { product, variants, variantId: selectedVariant.id, quantity: 1 }]);
    } catch {
      setError(t("receive.loadVariantsError"));
    } finally {
      setLoadingVariants(false);
    }
    setSearch("");
  }

  function handleScan(code: string) {
    setShowScanner(false);
    const product = products.find((p) => p.sku === code || p.name === code);
    if (product) void addLine(product);
    else { setError(t("receive.notFound", { code })); setTimeout(() => setError(""), 4000); }
  }

  function updateQty(idx: number, delta: number) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l));
  }

  async function handleConfirm() {
    if (!profile || lines.length === 0) return;
    setSaving(true); setError("");
    try {
      await receiveStock(profile.shopId, lines.map((line) => ({
        productId: line.product.id,
        variantId: line.variantId,
        quantity: line.quantity,
      })), profile.uid, profile.displayName);
      setDone(true); setLines([]);
    } catch (cause) {
      if (cause instanceof PartialReceiptError) {
        const completed = new Set(cause.completedLineKeys);
        setLines((current) => current.filter((line) => !completed.has(`${line.product.id}/${line.variantId}`)));
        setError(t("receive.partialFailure", { n: completed.size }));
      } else {
        setError(t("receive.atomicFailure"));
      }
    }
    finally { setSaving(false); }
  }

  if (done) return (
    <div className="fade-up" style={{ maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <CheckCircle size={56} color="var(--green)" style={{ marginBottom: "1rem" }} />
      <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text-1)", margin: "0 0 0.5rem" }}>{t("receive.success")}</h2>
      <p style={{ color: "var(--text-2)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>{t("receive.successNote")}</p>
      <button className="btn-primary" onClick={() => setDone(false)}>{t("receive.newReceipt")}</button>
    </div>
  );

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: 640 }}>
      <div className="receipt-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{t("receive.title")}</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-2)", marginTop: 4 }}>{t("receive.subtitle")}</p>
        </div>
        <button onClick={() => setShowScanner(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "0.55rem 1rem", background: "var(--accent-glow)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 10, color: "var(--accent-2)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>
          <Barcode size={15} /> {t("receive.scan")}
        </button>
      </div>

      <div style={{ position: "relative" }}>
        <Search size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
        <input className="input" placeholder={t("receive.searchAdd")} value={search} onChange={(e) => setSearch(e.target.value)} disabled={loadingVariants || saving} style={{ paddingLeft: "2.5rem" }} />
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
          <PackagePlus size={28} /><span style={{ fontSize: "0.875rem" }}>{t("receive.empty")}</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {lines.map((line, idx) => (
            <div key={`${line.product.id}/${line.variantId}`} className="glass receipt-line" style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "1rem" }}>
              <div className="receipt-line-info" style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-1)", margin: 0 }}>{line.product.name}</p>
                <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: "2px 0 0" }}>{t("receive.currentStock")}: {line.product.totalQuantity}</p>
                <select
                  className="input"
                  aria-label={t("receive.variant")}
                  value={line.variantId}
                  onChange={(event) => setLines((current) => current.map((item, i) => i === idx ? { ...item, variantId: event.target.value } : item))}
                  style={{ maxWidth: 260, marginTop: "0.5rem", padding: "0.4rem 0.6rem", fontSize: "0.78rem" }}
                >
                  {line.variants.map((variant) => (
                    <option key={variant.id} value={variant.id} disabled={lines.some((other, otherIndex) => otherIndex !== idx && other.product.id === line.product.id && other.variantId === variant.id)}>
                      {variant.label} · {t("receive.variantStock", { qty: variant.quantity })}{variant.sku ? ` · ${variant.sku}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="receipt-controls" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button onClick={() => updateQty(idx, -1)} style={{ width: 30, height: 30, background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Minus size={13} /></button>
                <input type="number" min="1" step="1" value={line.quantity} onChange={(e) => setLines((p) => p.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } : l))}
                  style={{ width: 56, background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.3rem 0.5rem", textAlign: "center", fontSize: "0.9rem", fontWeight: 700, color: "var(--text-1)", outline: "none" }} />
                <button onClick={() => updateQty(idx, 1)} style={{ width: 30, height: 30, background: "var(--green-dim)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, color: "var(--green)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={13} /></button>
                <button onClick={() => setLines((current) => current.filter((_, i) => i !== idx))} aria-label={t("receive.removeLine")} style={{ width: 30, height: 30, background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "var(--red)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div className="receipt-summary" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem", background: "var(--bg-3)", borderRadius: 14, border: "1px solid var(--border)" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 600, color: "var(--text-1)" }}>{t("receive.summary", { n: lines.length, qty: lines.reduce((s, l) => s + l.quantity, 0) })}</p>
            <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--text-2)" }}>{t("receive.summaryNote")}</p>
          </div>
          <button className="btn-primary" onClick={handleConfirm} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle size={15} />{saving ? t("receive.confirming") : t("receive.confirm")}
          </button>
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

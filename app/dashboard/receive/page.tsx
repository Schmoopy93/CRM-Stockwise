"use client";

import { useState, lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth-context";
import { useProducts } from "@/lib/hooks";
import { translateError, useI18n } from "@/lib/i18n-context";
import { findProductByCode, PartialReceiptError, receiveStock } from "@/lib/actions";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Product, ProductVariant } from "@/lib/types";
import { AlertCircle, Barcode, CheckCircle, Minus, PackagePlus, Plus, Search, Trash2, X } from "lucide-react";
import styles from "./receive.module.css";
import Select from "@/components/Select";

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
        setError(translateError(cause, t, "receive.atomicFailure"));
      }
    }
    finally { setSaving(false); }
  }

  if (done) return (
    <div className={`fade-up ${styles.success}`}>
      <div className={styles.successIcon}>
        <CheckCircle size={30} />
      </div>
      <h2 className={styles.successTitle}>{t("receive.success")}</h2>
      <p className={styles.successBody}>{t("receive.successNote")}</p>
      <button className="btn-primary" onClick={() => setDone(false)}>{t("receive.newReceipt")}</button>
    </div>
  );

  return (
    <main className={`fade-up ${styles.page}`}>
      <header className={styles.header}>
        <div className={styles.headMain}>
          <h1 className={styles.title}>{t("receive.title")}</h1>
          <p className={styles.subtitle}>{t("receive.subtitle")}</p>
        </div>
        <button type="button" className={styles.scanBtn} onClick={() => setShowScanner(true)}>
          <Barcode size={15} />
          {t("receive.scan")}
        </button>
      </header>

      {error && (
        <div role="alert" className={styles.alert}>
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      <section className={`glass ${styles.composer}`} aria-label={t("receive.title")}>
        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} aria-hidden="true" />
          <input
            className={`input ${styles.searchInput}`}
            type="search"
            placeholder={t("receive.searchAdd")}
            aria-label={t("receive.searchAdd")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={loadingVariants || saving}
          />
          {loadingVariants ? (
            <span className={styles.searchBusy} aria-hidden="true" />
          ) : search ? (
            <button type="button" className={styles.searchClear} onClick={() => setSearch("")} aria-label={t("orders.clearSearch")}>
              <X size={15} />
            </button>
          ) : null}

          {filtered.length > 0 && (
            <ul className={styles.suggest} role="listbox" aria-label={t("receive.searchAdd")}>
              {filtered.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className={styles.suggestRow}
                    onClick={() => void addLine(p)}
                    disabled={loadingVariants || saving}
                  >
                    <span>
                      <span className={styles.suggestName}>{p.name}</span>
                      <span className={styles.suggestMeta}>{p.sku || "—"}</span>
                    </span>
                    <span className={styles.suggestAdd} aria-hidden="true"><Plus size={14} /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}><PackagePlus size={20} /></span>
            <p className={styles.emptyTitle}>{t("receive.empty")}</p>
          </div>
        ) : (
          <ul className={styles.lines}>
            {lines.map((line, idx) => (
              <li key={`${line.product.id}/${line.variantId}`} className={styles.line}>
                <div className={styles.lineHead}>
                  <div className={styles.lineInfo}>
                    <p className={styles.lineName}>{line.product.name}</p>
                    <p className={styles.lineStock}>
                      {t("receive.currentStock")}: {line.product.totalQuantity}
                    </p>
                  </div>
                </div>
                <div className={styles.lineFields}>
                  <Select
                    className={styles.variantSelect}
                    ariaLabel={t("receive.variant")}
                    value={line.variantId}
                    onChange={(next) => setLines((current) => current.map((item, i) => i === idx ? { ...item, variantId: next } : item))}
                    options={line.variants.map((variant) => ({
                      value: variant.id,
                      label: `${variant.label} · ${t("receive.variantStock", { qty: variant.quantity })}${variant.sku ? ` · ${variant.sku}` : ""}`,
                      disabled: lines.some((other, otherIndex) => otherIndex !== idx && other.product.id === line.product.id && other.variantId === variant.id),
                    }))}
                  />
                  <div className={styles.stepper}>
                    <button type="button" className={styles.stepBtn} onClick={() => updateQty(idx, -1)} aria-label={`${t("sales.quantity")} −`}>
                      <Minus size={13} />
                    </button>
                    <input
                      className={styles.stepInput}
                      type="number"
                      min="1"
                      step="1"
                      value={line.quantity}
                      aria-label={t("sales.quantity")}
                      onChange={(e) => setLines((p) => p.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } : l))}
                    />
                    <button type="button" className={styles.stepBtn} onClick={() => updateQty(idx, 1)} aria-label={`${t("sales.quantity")} +`}>
                      <Plus size={13} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => setLines((current) => current.filter((_, i) => i !== idx))}
                    aria-label={t("receive.removeLine")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {lines.length > 0 && (
          <div className={styles.summary}>
            <div className={styles.summaryMain}>
              <p className={styles.summaryTotal}>
                {t("receive.summary", { n: lines.length, qty: lines.reduce((s, l) => s + l.quantity, 0) })}
              </p>
              <p className={styles.summaryNote}>{t("receive.summaryNote")}</p>
            </div>
            <button className={`btn-primary ${styles.confirmBtn}`} onClick={handleConfirm} disabled={saving}>
              {saving ? <span className="spinner" aria-hidden="true" /> : <CheckCircle size={15} />}
              {saving ? t("receive.confirming") : t("receive.confirm")}
            </button>
          </div>
        )}
      </section>

      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}
    </main>
  );
}

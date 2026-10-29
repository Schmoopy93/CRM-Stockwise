"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { INTL_LOCALES, useI18n } from "@/lib/i18n-context";
import { useProducts, useShop } from "@/lib/hooks";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { exportToExcel, exportToPrint } from "@/lib/export";
import { ProductVariant } from "@/lib/types";
import { FileSpreadsheet, Printer, Download } from "lucide-react";
import styles from "./export.module.css";

export default function ExportPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const { products, loading } = useProducts(profile?.shopId);
  const { name: shopName } = useShop(profile?.shopId);
  const [exporting, setExporting] = useState(false);

  async function loadVariants() {
    if (!profile) return {};
    const result: Record<string, ProductVariant[]> = {};
    for (const p of products) {
      const snap = await getDocs(collection(db, "shops", profile.shopId, "products", p.id, "variants"));
      result[p.id] = snap.docs.map((d) => ({
        id: d.id,
        label: d.data().label ?? "",
        sku: d.data().sku ?? "",
        quantity: d.data().quantity ?? 0,
      }));
    }
    return result;
  }

  async function handleExcel() {
    setExporting(true);
    try {
      const variants = await loadVariants();
      exportToExcel(products, variants, shopName || undefined, locale);
    } finally {
      setExporting(false);
    }
  }

  async function handlePrint() {
    setExporting(true);
    try {
      const variants = await loadVariants();
      exportToPrint(products, variants, shopName || undefined, locale);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={`fade-up ${styles.page}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("export.title")}</h1>
        <p className={styles.subtitle}>{t("export.subtitle")}</p>
      </header>

      {/* Summary */}
      <div className={`glass ${styles.summary}`}>
        <div className={styles.summaryItem}>
          <p className={styles.summaryLabel}>{t("export.articles")}</p>
          <p className={styles.summaryValue}>{products.length}</p>
        </div>
        <div className={styles.summaryItem}>
          <p className={styles.summaryLabel}>{t("export.totalItems")}</p>
          <p className={styles.summaryValue}>
            {products.reduce((s, p) => s + p.totalQuantity, 0)}
          </p>
        </div>
        <div className={styles.summaryItem}>
          <p className={styles.summaryLabel}>{t("export.date")}</p>
          <p className={styles.summaryDate}>{new Date().toLocaleDateString(INTL_LOCALES[locale])}</p>
        </div>
      </div>

      {/* Export buttons */}
      <div className={styles.cards}>
        <button
          type="button"
          className={`glass ${styles.fileBtn}`}
          data-tone="green"
          onClick={handleExcel}
          disabled={exporting || loading || products.length === 0}
        >
          <span className={styles.fileIcon}>
            <FileSpreadsheet size={21} />
          </span>
          <span className={styles.fileBody}>
            <span className={styles.fileTitle}>{t("export.excel")}</span>
            <span className={styles.fileNote}>{t("export.excelNote")}</span>
          </span>
          <Download size={18} className={styles.fileArrow} aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`glass ${styles.fileBtn}`}
          data-tone="accent"
          onClick={handlePrint}
          disabled={exporting || loading || products.length === 0}
        >
          <span className={styles.fileIcon}>
            <Printer size={21} />
          </span>
          <span className={styles.fileBody}>
            <span className={styles.fileTitle}>{t("export.print")}</span>
            <span className={styles.fileNote}>{t("export.printNote")}</span>
          </span>
          <Printer size={18} className={styles.fileArrow} aria-hidden="true" />
        </button>
      </div>

      {exporting && (
        <p className={styles.loadingNote} role="status">{t("export.loading")}</p>
      )}
    </div>
  );
}

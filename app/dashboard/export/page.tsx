"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useProducts } from "@/lib/hooks";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { exportToExcel, exportToPrint } from "@/lib/export";
import { ProductVariant } from "@/lib/types";
import { FileSpreadsheet, Printer, Download } from "lucide-react";

export default function ExportPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const { products, loading } = useProducts(profile?.shopId);
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
      exportToExcel(products, variants, "Radnja", locale);
    } finally {
      setExporting(false);
    }
  }

  async function handlePrint() {
    setExporting(true);
    try {
      const variants = await loadVariants();
      exportToPrint(products, variants, "Radnja", locale);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fade-up" style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{t("export.title")}</h1>
        <p style={{ fontSize: "0.82rem", color: "var(--text-2)", marginTop: 4 }}>
          {t("export.subtitle")}
        </p>
      </div>

      {/* Summary */}
      <div className="glass export-summary" style={{ padding: "1.25rem 1.5rem", marginBottom: "1.5rem", display: "flex", gap: "2rem" }}>
        <div>
          <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: 0 }}>{t("export.articles")}</p>
          <p style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-1)", margin: 0, lineHeight: 1 }}>{products.length}</p>
        </div>
        <div>
          <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: 0 }}>{t("export.totalItems")}</p>
          <p style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-1)", margin: 0, lineHeight: 1 }}>
            {products.reduce((s, p) => s + p.totalQuantity, 0)}
          </p>
        </div>
        <div>
          <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: 0 }}>{t("export.date")}</p>
          <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>
            {new Date().toLocaleDateString(locale === "sr" ? "sr-RS" : locale === "ru" ? "ru-RU" : "en-US")}
          </p>
        </div>
      </div>

      {/* Export buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
        {/* Excel */}
        <button
          onClick={handleExcel}
          disabled={exporting || loading || products.length === 0}
          style={{
            display: "flex", alignItems: "center", gap: "1rem",
            padding: "1.25rem 1.5rem",
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: 14,
            cursor: "pointer",
            transition: "all 0.15s",
            textAlign: "left",
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = "rgba(34,197,94,0.14)")}
          onMouseOut={(e) => (e.currentTarget.style.background = "rgba(34,197,94,0.08)")}
        >
          <div style={{ width: 44, height: 44, background: "var(--green-dim)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <FileSpreadsheet size={22} color="var(--green)" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600, color: "var(--text-1)", margin: 0, fontSize: "0.95rem" }}>{t("export.excel")}</p>
            <p style={{ fontSize: "0.78rem", color: "var(--text-2)", margin: "2px 0 0" }}>
              {t("export.excelNote")}
            </p>
          </div>
          <Download size={18} color="var(--green)" />
        </button>

        {/* PDF/Print */}
        <button
          onClick={handlePrint}
          disabled={exporting || loading || products.length === 0}
          style={{
            display: "flex", alignItems: "center", gap: "1rem",
            padding: "1.25rem 1.5rem",
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: 14,
            cursor: "pointer",
            transition: "all 0.15s",
            textAlign: "left",
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.14)")}
          onMouseOut={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.08)")}
        >
          <div style={{ width: 44, height: 44, background: "var(--accent-glow)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Printer size={22} color="var(--accent-2)" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600, color: "var(--text-1)", margin: 0, fontSize: "0.95rem" }}>{t("export.print")}</p>
            <p style={{ fontSize: "0.78rem", color: "var(--text-2)", margin: "2px 0 0" }}>
              {t("export.printNote")}
            </p>
          </div>
          <Printer size={18} color="var(--accent-2)" />
        </button>
      </div>

      {exporting && (
        <p style={{ textAlign: "center", color: "var(--text-2)", fontSize: "0.82rem", marginTop: "1rem" }}>
          {t("export.loading")}
        </p>
      )}
    </div>
  );
}

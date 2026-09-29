"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useProducts } from "@/lib/hooks";
import { saveProduct } from "@/lib/actions";
import { parseProductImportFile, ParsedProductImportRow } from "@/lib/product-import";
import { CheckCircle2, ChevronDown, ChevronUp, Download, FileSpreadsheet, FileText, Upload, XCircle } from "lucide-react";

interface ImportResult {
  rowNumber: number;
  name: string;
  status: "ok" | "error";
  message?: string;
}

const TEMPLATE_ROWS = [
  ["name", "sku", "category", "min_stock", "cost_price", "sale_price", "supplier_name", "variant_label", "variant_sku", "quantity"],
  ["iPhone 15", "IPH15", "Phones", 2, 650, 899, "TechSupply", "Black / 128GB", "IPH15-BLK-128", 5],
  ["iPhone 15", "IPH15", "Phones", 2, 650, 899, "TechSupply", "White / 128GB", "IPH15-WHT-128", 3],
  ["T-Shirt Basic", "TSH-RED", "Clothing", 5, 8, 25, "", "Red / M", "TSH-RED-M", 10],
];

function groupRows(rows: ParsedProductImportRow[]) {
  const groups = new Map<string, ParsedProductImportRow[]>();
  for (const row of rows) {
    const key = row.sku.trim().toLocaleLowerCase() || row.name.trim().toLocaleLowerCase();
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

function downloadTemplate(format: "csv" | "xlsx") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(TEMPLATE_ROWS), "Products");
  if (format === "xlsx") {
    XLSX.writeFile(workbook, "inventory-import-template.xlsx");
    return;
  }
  const csv = XLSX.utils.sheet_to_csv(workbook.Sheets.Products);
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "inventory-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ImportPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const { products, loading: productsLoading } = useProducts(profile?.shopId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedProductImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [reading, setReading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const productGroups = useMemo(() => groupRows(rows), [rows]);
  const validationErrors = useMemo(() => {
    const errors = new Map<number, string[]>();
    for (const row of rows) if (row.errors.length) errors.set(row.rowNumber, [...row.errors]);

    for (const [, group] of productGroups) {
      const first = group[0];
      const seenVariantSkus = new Set<string>();
      for (const row of group) {
        if (
          row.name !== first.name
          || row.category !== first.category
          || row.minStock !== first.minStock
          || row.costPrice !== first.costPrice
          || row.salePrice !== first.salePrice
          || row.supplierName !== first.supplierName
        ) {
          errors.set(row.rowNumber, [...(errors.get(row.rowNumber) ?? []), "inconsistentProduct"]);
        }
        const variantKey = row.variantSku.trim().toLocaleLowerCase() || row.variantLabel.trim().toLocaleLowerCase();
        if (seenVariantSkus.has(variantKey)) {
          errors.set(row.rowNumber, [...(errors.get(row.rowNumber) ?? []), "duplicateVariant"]);
        }
        seenVariantSkus.add(variantKey);
      }

      const existing = products.find((product) => first.sku
        ? product.sku.trim().toLocaleLowerCase() === first.sku.trim().toLocaleLowerCase()
        : product.name.trim().toLocaleLowerCase() === first.name.trim().toLocaleLowerCase());
      if (existing) {
        for (const row of group) errors.set(row.rowNumber, [...(errors.get(row.rowNumber) ?? []), "productExists"]);
      }
    }
    return errors;
  }, [rows, productGroups, products]);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setDone(false);
    setResults([]);
    setRows([]);
    setParseErrors([]);
    setReading(true);
    const parsed = await parseProductImportFile(file);
    setRows(parsed.rows);
    setParseErrors(parsed.errors);
    setReading(false);
  }, []);

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  async function runImport() {
    if (!profile || rows.length === 0 || validationErrors.size > 0 || productsLoading) return;
    setImporting(true);
    setDone(false);
    const nextResults: ImportResult[] = [];

    for (const [, productRows] of productGroups) {
      const first = productRows[0];
      const variants = productRows.map((row) => ({
        id: "",
        label: row.variantLabel,
        sku: row.variantSku,
        quantity: row.quantity,
      }));
      try {
        await saveProduct(
          profile.shopId,
          null,
          first.name,
          first.sku,
          first.category,
          first.minStock,
          [],
          variants,
          [],
          {},
          first.costPrice,
          first.salePrice,
          first.supplierName ? { name: first.supplierName } : undefined
        );
        nextResults.push({ rowNumber: first.rowNumber, name: first.name, status: "ok" });
      } catch (error) {
        nextResults.push({
          rowNumber: first.rowNumber,
          name: first.name,
          status: "error",
          message: error instanceof Error ? error.message : t("import.unknownError"),
        });
      }
    }

    setResults(nextResults);
    setImporting(false);
    setDone(true);
  }

  const totalUnits = rows.reduce((sum, row) => sum + row.quantity, 0);
  const importedCount = results.filter((result) => result.status === "ok").length;
  const failedCount = results.filter((result) => result.status === "error").length;
  const numberFormat = new Intl.NumberFormat(locale === "sr" ? "sr-RS" : locale === "ru" ? "ru-RU" : "en-US");

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{t("import.title")}</h1>
        <p style={{ fontSize: "0.82rem", color: "var(--text-2)", marginTop: 4 }}>{t("import.subtitle")}</p>
      </div>

      <div className="glass" style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem", color: "var(--text-2)" }}>
          <FileText size={16} style={{ color: "var(--accent-2)" }} />
          <span>{t("import.templateHint")}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => downloadTemplate("csv")} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", padding: "0.45rem 0.875rem" }}>
            <Download size={14} /> CSV
          </button>
          <button onClick={() => downloadTemplate("xlsx")} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", padding: "0.45rem 0.875rem" }}>
            <FileSpreadsheet size={14} /> Excel (.xlsx)
          </button>
        </div>
      </div>

      <div
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className="import-dropzone"
        style={{ border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`, borderRadius: 16, padding: "2.5rem 2rem", textAlign: "center", cursor: reading ? "wait" : "pointer", background: dragOver ? "var(--accent-glow)" : "transparent", transition: "all 0.2s", opacity: reading ? 0.65 : 1 }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          style={{ display: "none" }}
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.target.value = ""; }}
        />
        <Upload size={28} style={{ color: "var(--text-3)", marginBottom: 12 }} />
        <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-1)", margin: 0 }}>
          {reading ? t("import.reading") : fileName || t("import.dropzone")}
        </p>
        <p style={{ fontSize: "0.78rem", color: "var(--text-3)", marginTop: 6 }}>{t("import.fileTypes")}</p>
      </div>

      {parseErrors.length > 0 && (
        <div role="alert" className="glass" style={{ padding: "1rem 1.25rem", color: "var(--red)", fontSize: "0.82rem" }}>
          {parseErrors.map((error) => <p key={error} style={{ margin: "0.2rem 0" }}>{t(`import.parseError.${error}`)}</p>)}
        </div>
      )}

      {rows.length > 0 && !done && (
        <div className="glass" style={{ padding: "1.25rem 1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", marginBottom: showPreview ? "1rem" : 0 }} onClick={() => setShowPreview((open) => !open)}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-1)" }}>
                {t("import.previewSummary", { products: productGroups.size, units: numberFormat.format(totalUnits) })}
              </span>
              <span className="badge" style={{ background: "var(--accent-glow)", color: "var(--accent-2)", border: "1px solid rgba(99,102,241,0.2)" }}>
                {t("import.rowsCount", { n: rows.length })}
              </span>
              {validationErrors.size > 0 && <span className="badge" style={{ background: "var(--red-dim)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.2)" }}>{t("import.invalidRows", { n: validationErrors.size })}</span>}
            </div>
            {showPreview ? <ChevronUp size={16} style={{ color: "var(--text-3)" }} /> : <ChevronDown size={16} style={{ color: "var(--text-3)" }} />}
          </div>

          {showPreview && (
            <div className="import-preview" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead><tr>
                  {["row", "name", "sku", "category", "variant", "quantity", "costPrice", "salePrice", "supplier", "status"].map((key) => (
                    <th key={key} style={{ textAlign: "left", padding: "0.5rem 0.65rem", color: "var(--text-3)", fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{t(`import.column.${key}`)}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rows.slice(0, 100).map((row) => {
                    const errors = validationErrors.get(row.rowNumber) ?? [];
                    return (
                      <tr key={row.rowNumber} style={{ borderBottom: "1px solid var(--border)", background: errors.length ? "var(--red-dim)" : undefined }}>
                        <td style={{ padding: "0.5rem 0.65rem", color: "var(--text-3)" }}>{row.rowNumber}</td>
                        <td style={{ padding: "0.5rem 0.65rem", color: "var(--text-1)", fontWeight: 500 }}>{row.name || "—"}</td>
                        <td style={{ padding: "0.5rem 0.65rem", color: "var(--text-3)", fontFamily: "monospace" }}>{row.sku || "—"}</td>
                        <td style={{ padding: "0.5rem 0.65rem", color: "var(--text-2)" }}>{row.category || "—"}</td>
                        <td style={{ padding: "0.5rem 0.65rem", color: "var(--text-2)" }}>{row.variantLabel || "—"}</td>
                        <td style={{ padding: "0.5rem 0.65rem", color: "var(--text-1)", fontWeight: 600 }}>{row.quantity}</td>
                        <td style={{ padding: "0.5rem 0.65rem", color: "var(--text-2)" }}>{row.costPrice ?? "—"}</td>
                        <td style={{ padding: "0.5rem 0.65rem", color: "var(--text-2)" }}>{row.salePrice ?? "—"}</td>
                        <td style={{ padding: "0.5rem 0.65rem", color: "var(--text-3)" }}>{row.supplierName ?? "—"}</td>
                        <td style={{ padding: "0.5rem 0.65rem", color: errors.length ? "var(--red)" : "var(--green)", maxWidth: 240 }}>{errors.length ? errors.map((error) => t(`import.validation.${error}`)).join(", ") : t("import.valid")}</td>
                      </tr>
                    );
                  })}
                  {rows.length > 100 && <tr><td colSpan={10} style={{ padding: "0.65rem", textAlign: "center", color: "var(--text-3)" }}>{t("import.moreRows", { n: rows.length - 100 })}</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: showPreview ? "1.25rem" : 0, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => void runImport()} disabled={importing || reading || productsLoading || validationErrors.size > 0} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 8, opacity: importing || productsLoading || validationErrors.size > 0 ? 0.6 : 1 }}>
              {importing ? <><span className="spinner" style={{ width: 14, height: 14 }} /> {t("import.importing")}</> : <><Upload size={15} /> {t("import.importButton", { n: productGroups.size })}</>}
            </button>
          </div>
        </div>
      )}

      {done && (
        <div className="glass fade-up" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", fontWeight: 600, color: "var(--green)" }}><CheckCircle2 size={18} /> {t("import.imported", { n: importedCount })}</div>
            {failedCount > 0 && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", fontWeight: 600, color: "var(--red)" }}><XCircle size={18} /> {t("import.failed", { n: failedCount })}</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {results.map((result) => (
              <div key={result.rowNumber} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "0.5rem 0", borderBottom: "1px solid var(--border)", fontSize: "0.82rem" }}>
                {result.status === "ok" ? <CheckCircle2 size={15} style={{ color: "var(--green)", flexShrink: 0, marginTop: 1 }} /> : <XCircle size={15} style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }} />}
                <div><span style={{ fontWeight: 600, color: "var(--text-1)" }}>{result.name}</span><span style={{ marginLeft: 8, color: "var(--text-3)" }}>{t("import.resultRow", { n: result.rowNumber })}</span>{result.message && <p style={{ fontSize: "0.75rem", color: "var(--red)", margin: "2px 0 0" }}>{result.message}</p>}</div>
              </div>
            ))}
          </div>
          <button onClick={() => { setRows([]); setResults([]); setDone(false); setFileName(""); setParseErrors([]); }} style={{ marginTop: "1rem", padding: "0.45rem 1rem", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, fontSize: "0.8rem", color: "var(--text-2)", cursor: "pointer" }}>{t("import.anotherFile")}</button>
        </div>
      )}

      {rows.length === 0 && parseErrors.length === 0 && (
        <div className="glass" style={{ padding: "1.25rem 1.5rem" }}>
          <h2 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-2)", margin: "0 0 0.875rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("import.guideTitle")}</h2>
          <p style={{ fontSize: "0.82rem", color: "var(--text-2)", margin: 0 }}>{t("import.guideIntro")}</p>
        </div>
      )}
    </div>
  );
}

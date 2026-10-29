"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/auth-context";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { useProducts } from "@/lib/hooks";
import { saveProduct } from "@/lib/actions";
import {
  applyImportColumnMapping,
  isAIImportColumnMapping,
  parseProductImportFile,
  parseProductImportRows,
  ParsedProductImportRow,
} from "@/lib/product-import";
import { CheckCircle2, ChevronDown, ChevronUp, Download, FileSpreadsheet, FileText, Sparkles, Upload, XCircle } from "lucide-react";
import styles from "./import.module.css";

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
  const { profile, user } = useAuth();
  const { locale, t } = useI18n();
  const { products, loading: productsLoading } = useProducts(profile?.shopId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedProductImportRow[]>([]);
  const [sourceMatrix, setSourceMatrix] = useState<unknown[][] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [reading, setReading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiApplied, setAiApplied] = useState(false);

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
    setSourceMatrix(null);
    setAiError("");
    setAiApplied(false);
    setReading(true);
    const parsed = await parseProductImportFile(file);
    setRows(parsed.rows);
    setParseErrors(parsed.errors);
    setSourceMatrix(parsed.matrix ?? null);
    setReading(false);
  }, []);

  async function suggestColumnMapping() {
    if (!user || !sourceMatrix?.[0]) return;
    setSuggesting(true);
    setAiError("");
    setAiApplied(false);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/ai/import-mapping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-app-locale": locale,
        },
        body: JSON.stringify({ headers: sourceMatrix[0], locale }),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error
          : t("import.aiError");
        throw new Error(message);
      }
      if (!result || typeof result !== "object" || !("mapping" in result) ||
        !isAIImportColumnMapping(result.mapping, sourceMatrix[0].length)) {
        throw new Error(t("import.aiError"));
      }
      const mappedMatrix = applyImportColumnMapping(sourceMatrix, result.mapping);
      const parsed = parseProductImportRows(mappedMatrix);
      setRows(parsed.rows);
      setParseErrors(parsed.errors);
      setAiApplied(parsed.errors.length === 0);
    } catch (cause) {
      setAiError(cause instanceof Error ? cause.message : t("import.aiError"));
    } finally {
      setSuggesting(false);
    }
  }

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
          message: translateError(error, t, "import.unknownError"),
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
  const numberFormat = new Intl.NumberFormat(INTL_LOCALES[locale]);

  return (
    <div className={`fade-up ${styles.page}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("import.title")}</h1>
        <p className={styles.subtitle}>{t("import.subtitle")}</p>
      </header>

      <div className={`glass ${styles.card} ${styles.templateCard}`}>
        <p className={styles.templateHint}>
          <FileText size={16} className={styles.templateIcon} />
          <span>{t("import.templateHint")}</span>
        </p>
        <div className={styles.templateActions}>
          <button onClick={() => downloadTemplate("csv")} className={styles.downloadBtn}>
            <Download size={14} /> CSV
          </button>
          <button onClick={() => downloadTemplate("xlsx")} className={styles.downloadBtn}>
            <FileSpreadsheet size={14} /> Excel (.xlsx)
          </button>
        </div>
      </div>

      <div
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`import-dropzone ${styles.dropzone}`}
        data-over={dragOver ? "" : undefined}
        data-busy={reading ? "" : undefined}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          className={styles.fileInput}
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.target.value = ""; }}
        />
        <Upload size={28} className={styles.dropIcon} />
        <p className={styles.dropTitle}>
          {reading ? t("import.reading") : fileName || t("import.dropzone")}
        </p>
        <p className={styles.dropTypes}>{t("import.fileTypes")}</p>
      </div>

      {parseErrors.length > 0 && (
        <div role="alert" className={`glass ${styles.card} ${styles.alertCard}`}>
          {parseErrors.map((error) => <p key={error}>{t(`import.parseError.${error}`)}</p>)}
        </div>
      )}

      {sourceMatrix && !done && (
        <div className={`glass ${styles.card} ${styles.aiCard}`}>
          <div className={styles.aiMain}>
            <p className={styles.aiTitle}>{t("import.aiTitle")}</p>
            <p className={styles.aiNote}>{t("import.aiPrivacy")}</p>
            {aiApplied && <p role="status" className={styles.aiStatus}>{t("import.aiApplied")}</p>}
            {aiError && <p role="alert" className={styles.aiError}>{aiError}</p>}
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={suggesting || reading || importing || !user}
            onClick={() => void suggestColumnMapping()}
          >
            {suggesting ? <span className={`spinner ${styles.btnSpinner}`} aria-hidden="true" /> : <Sparkles size={15} />}
            {suggesting ? t("import.aiWorking") : t("import.aiButton")}
          </button>
        </div>
      )}

      {rows.length > 0 && !done && (
        <div className={`glass ${styles.card}`}>
          <button type="button" className={styles.previewToggle} aria-expanded={showPreview} onClick={() => setShowPreview((open) => !open)}>
            <span className={styles.previewToggleMain}>
              <span className={styles.previewSummary}>
                {t("import.previewSummary", { products: productGroups.size, units: numberFormat.format(totalUnits) })}
              </span>
              <span className={`badge ${styles.badgeAccent}`}>
                {t("import.rowsCount", { n: rows.length })}
              </span>
              {validationErrors.size > 0 && (
                <span className={`badge ${styles.badgeDanger}`}>{t("import.invalidRows", { n: validationErrors.size })}</span>
              )}
            </span>
            {showPreview ? <ChevronUp size={16} className={styles.chevron} /> : <ChevronDown size={16} className={styles.chevron} />}
          </button>

          {showPreview && (
            <div className={`import-preview ${styles.tableWrap} ${styles.previewBody}`}>
              <table className={styles.table}>
                <thead><tr>
                  {["row", "name", "sku", "category", "variant", "quantity", "costPrice", "salePrice", "supplier", "status"].map((key) => (
                    <th key={key}>{t(`import.column.${key}`)}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rows.slice(0, 100).map((row) => {
                    const errors = validationErrors.get(row.rowNumber) ?? [];
                    return (
                      <tr key={row.rowNumber} data-invalid={errors.length ? "" : undefined}>
                        <td className={styles.cellRow}>{row.rowNumber}</td>
                        <td className={styles.cellName}>{row.name || "—"}</td>
                        <td className={styles.cellMono}>{row.sku || "—"}</td>
                        <td>{row.category || "—"}</td>
                        <td>{row.variantLabel || "—"}</td>
                        <td className={styles.cellStrong}>{row.quantity}</td>
                        <td>{row.costPrice ?? "—"}</td>
                        <td>{row.salePrice ?? "—"}</td>
                        <td className={styles.cellRow}>{row.supplierName ?? "—"}</td>
                        <td className={styles.cellStatus} data-ok={errors.length ? undefined : ""} data-error={errors.length ? "" : undefined}>
                          {errors.length ? errors.map((error) => t(`import.validation.${error}`)).join(", ") : t("import.valid")}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length > 100 && <tr><td colSpan={10} className={styles.moreRows}>{t("import.moreRows", { n: rows.length - 100 })}</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.previewActions} data-collapsed={showPreview ? undefined : ""}>
            <button onClick={() => void runImport()} disabled={importing || reading || productsLoading || validationErrors.size > 0} className={`btn-primary ${styles.importBtn}`}>
              {importing ? <><span className={`spinner ${styles.btnSpinner}`} aria-hidden="true" /> {t("import.importing")}</> : <><Upload size={15} /> {t("import.importButton", { n: productGroups.size })}</>}
            </button>
          </div>
        </div>
      )}

      {done && (
        <div className={`glass fade-up ${styles.doneCard}`}>
          <div className={styles.doneHead}>
            <div className={styles.doneStat} data-kind="ok"><CheckCircle2 size={18} /> {t("import.imported", { n: importedCount })}</div>
            {failedCount > 0 && <div className={styles.doneStat} data-kind="error"><XCircle size={18} /> {t("import.failed", { n: failedCount })}</div>}
          </div>
          <div className={styles.doneList}>
            {results.map((result) => (
              <div key={result.rowNumber} className={styles.doneRow}>
                {result.status === "ok"
                  ? <CheckCircle2 size={15} className={styles.doneIcon} data-kind="ok" />
                  : <XCircle size={15} className={styles.doneIcon} data-kind="error" />}
                <div>
                  <span className={styles.doneName}>{result.name}</span>
                  <span className={styles.doneRowMeta}>{t("import.resultRow", { n: result.rowNumber })}</span>
                  {result.message && <p className={styles.doneError}>{result.message}</p>}
                </div>
              </div>
            ))}
          </div>
          <button
            className={`btn-secondary ${styles.anotherBtn}`}
            onClick={() => { setRows([]); setResults([]); setDone(false); setFileName(""); setParseErrors([]); }}
          >
            {t("import.anotherFile")}
          </button>
        </div>
      )}

      {rows.length === 0 && parseErrors.length === 0 && (
        <div className={`glass ${styles.card}`}>
          <h2 className={styles.guideTitle}>{t("import.guideTitle")}</h2>
          <p className={styles.guideIntro}>{t("import.guideIntro")}</p>
        </div>
      )}
    </div>
  );
}

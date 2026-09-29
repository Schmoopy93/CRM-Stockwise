import * as XLSX from "xlsx";
import { AppLocale, Product, ProductCustomField, ProductVariant } from "./types";
import { getLocalizedOptionValue } from "./product-field-options";
import { INTL_LOCALES } from "./i18n-context";

const exportLabels: Record<AppLocale, Record<string, string>> = {
  sr: { product: "Artikal", sku: "SKU", category: "Kategorija", variant: "Varijanta", variantSku: "SKU varijante", quantity: "Količina", min: "Min. stanje", status: "Status", low: "⚠ Nisko", ok: "U redu", none: "—", title: "Stanje artikala", date: "Datum", products: "Artikala", total: "Ukupno komada", extra: "Dodatno" },
  en: { product: "Product", sku: "SKU", category: "Category", variant: "Variant", variantSku: "Variant SKU", quantity: "Quantity", min: "Min. stock", status: "Status", low: "⚠ Low", ok: "OK", none: "—", title: "Product stock", date: "Date", products: "Products", total: "Total units", extra: "Extra" },
  ru: { product: "Товар", sku: "Артикул", category: "Категория", variant: "Вариант", variantSku: "Артикул варианта", quantity: "Количество", min: "Мин. остаток", status: "Статус", low: "⚠ Мало", ok: "В норме", none: "—", title: "Остатки товаров", date: "Дата", products: "Товаров", total: "Всего единиц", extra: "Дополнительно" },
  de: { product: "Artikel", sku: "SKU", category: "Kategorie", variant: "Variante", variantSku: "Varianten-SKU", quantity: "Menge", min: "Min. Bestand", status: "Status", low: "⚠ Niedrig", ok: "OK", none: "—", title: "Artikelbestand", date: "Datum", products: "Artikel", total: "Gesamtanzahl", extra: "Zusätzlich" },
  es: { product: "Producto", sku: "SKU", category: "Categoría", variant: "Variante", variantSku: "SKU de variante", quantity: "Cantidad", min: "Stock mín.", status: "Estado", low: "⚠ Bajo", ok: "OK", none: "—", title: "Stock de productos", date: "Fecha", products: "Productos", total: "Unidades totales", extra: "Adicional" },
  it: { product: "Prodotto", sku: "SKU", category: "Categoria", variant: "Variante", variantSku: "SKU variante", quantity: "Quantità", min: "Scorta min.", status: "Stato", low: "⚠ Basso", ok: "OK", none: "—", title: "Giacenza prodotti", date: "Data", products: "Prodotti", total: "Totale unità", extra: "Extra" },
};

function fieldLabel(field: ProductCustomField, locale: AppLocale) {
  return field.labels?.[locale] ?? field.label;
}

function localizedValue(product: Product, key: string, locale: AppLocale, fallback: string | number) {
  const field = product.customFieldDefinitions?.find((definition) => definition.key === key);
  const value = product.customFieldValues?.[key];
  if (value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? ({ sr: "Da", en: "Yes", ru: "Да", de: "Ja", es: "Sí", it: "Sì" } as const)[locale] : ({ sr: "Ne", en: "No", ru: "Нет", de: "Nein", es: "No", it: "No" } as const)[locale];
  if (field?.type === "select") return getLocalizedOptionValue(field, String(value), locale);
  return value;
}

export function exportToExcel(
  products: Product[],
  variantMap: Record<string, ProductVariant[]>,
  shopName = "Radnja",
  locale: AppLocale = "sr"
) {
  const labels = exportLabels[locale];
  const rows: Record<string, string | number>[] = [];

  function customValues(product: Product) {
    return Object.fromEntries((product.customFieldDefinitions ?? []).map((field) => {
      const value = localizedValue(product, field.key, locale, "");
      return [`${labels.extra}: ${fieldLabel(field, locale)}`, value];
    }));
  }

  for (const product of products) {
    const variants = variantMap[product.id] ?? [];
    if (variants.length === 0) {
      rows.push({
        [labels.product]: product.name,
        [labels.sku]: product.sku,
        [labels.category]: product.category,
        [labels.variant]: labels.none,
        [labels.variantSku]: labels.none,
        [labels.quantity]: product.totalQuantity,
        [labels.min]: product.minStock,
        [labels.status]: product.minStock > 0 && product.totalQuantity <= product.minStock ? labels.low : labels.ok,
        ...customValues(product),
      });
    } else {
      for (const v of variants) {
        rows.push({
          [labels.product]: product.name,
          [labels.sku]: product.sku,
          [labels.category]: product.category,
          [labels.variant]: v.label,
          [labels.variantSku]: v.sku,
          [labels.quantity]: v.quantity,
          [labels.min]: product.minStock,
          [labels.status]: product.minStock > 0 && product.totalQuantity <= product.minStock ? labels.low : labels.ok,
          ...customValues(product),
        });
      }
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 28 }, { wch: 14 }, { wch: 16 },
    { wch: 22 }, { wch: 14 }, { wch: 10 },
    { wch: 12 }, { wch: 10 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, labels.title);

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${shopName}-stanje-${date}.xlsx`);
}

export function exportToPrint(
  products: Product[],
  variantMap: Record<string, ProductVariant[]>,
  shopName = "Radnja",
  locale: AppLocale = "sr"
) {
  const labels = exportLabels[locale];
  const date = new Date().toLocaleDateString(INTL_LOCALES[locale]);
  const customDefinitions = Array.from(new Map(products.flatMap((product) =>
    (product.customFieldDefinitions ?? []).map((field) => [fieldLabel(field, locale).toLocaleLowerCase(), field] as const)
  )).values());
  const customValue = (product: Product, column: ProductCustomField) => {
    const columnLabel = fieldLabel(column, locale).toLocaleLowerCase();
    const field = (product.customFieldDefinitions ?? []).find((definition) => fieldLabel(definition, locale).toLocaleLowerCase() === columnLabel);
    return field ? localizedValue(product, field.key, locale, labels.none) : labels.none;
  };
  const escapeHtml = (value: unknown) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const rows = products
    .flatMap((p) => {
      const variants = variantMap[p.id] ?? [];
      if (variants.length === 0) {
        return [{ name: p.name, sku: p.sku, category: p.category, variant: labels.none, quantity: p.totalQuantity, minStock: p.minStock, product: p, custom: p.customFieldValues ?? {} }];
      }
      return variants.map((v) => ({
        name: p.name, sku: p.sku, category: p.category,
        variant: v.label, quantity: v.quantity, minStock: p.minStock, product: p, custom: p.customFieldValues ?? {},
      }));
    });

  const html = `
    <!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${escapeHtml(labels.title)} - ${escapeHtml(shopName)}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 2cm; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      .meta { color: #666; margin-bottom: 20px; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f0f0f0; text-align: left; padding: 6px 8px; border-bottom: 2px solid #ccc; font-size: 11px; text-transform: uppercase; }
      td { padding: 6px 8px; border-bottom: 1px solid #e8e8e8; }
      tr:hover td { background: #fafafa; }
      .low { color: #d97706; font-weight: bold; }
      @media print { body { margin: 1cm; } }
    </style>
    </head><body>
    <h1>📦 ${escapeHtml(shopName)} — ${escapeHtml(labels.title)}</h1>
    <div class="meta">${escapeHtml(labels.date)}: ${date} · ${escapeHtml(labels.products)}: ${products.length} · ${escapeHtml(labels.total)}: ${products.reduce((s, p) => s + p.totalQuantity, 0)}</div>
    <table>
      <thead><tr>
        <th>${escapeHtml(labels.product)}</th><th>${escapeHtml(labels.sku)}</th><th>${escapeHtml(labels.category)}</th>
        <th>${escapeHtml(labels.variant)}</th><th>${escapeHtml(labels.quantity)}</th><th>${escapeHtml(labels.min)}</th>
        ${customDefinitions.map((field) => `<th>${escapeHtml(field.labels?.[locale] ?? field.label)}</th>`).join("")}
      </tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${escapeHtml(r.name)}</td>
            <td style="color:#888">${escapeHtml(r.sku || "—")}</td>
            <td>${escapeHtml(r.category || "—")}</td>
            <td>${escapeHtml(r.variant)}</td>
            <td class="${r.minStock > 0 && r.product.totalQuantity <= r.minStock ? "low" : ""}">${r.quantity}</td>
            <td style="color:#aaa">${r.minStock || "—"}</td>
            ${customDefinitions.map((field) => `<td>${escapeHtml(customValue(r.product, field))}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
    <script>window.onload = () => { window.print(); window.close(); }</script>
    </body></html>
  `;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

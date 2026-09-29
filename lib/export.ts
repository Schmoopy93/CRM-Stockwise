import * as XLSX from "xlsx";
import { AppLocale, Product, ProductCustomField, ProductVariant } from "./types";
import { getLocalizedOptionValue } from "./product-field-options";
import { INTL_LOCALES } from "./i18n-context";

const EXPORT_LOGO_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAMAAABlApw1AAADAFBMVEVHcEzf5OkaP1/r8PTs6urV3eOgrLnt8vUKJkMMKUept8AfQmAkR2XK0tmNn60kRGLg5eqYqLW5w8wfQWDo7fHM1Nulsr2QoK54jJygwtd/kqGMssohQmAhQmDAytF4jaK3wckYOlvbn4IYO1uBk6PCjnm6ydIqRmG9xcxwVlafrrquucKLnat5jJ0wTWh/WVSDlaSCqsOEmKkbJzwyMD4pSGapaleLnKp2iptdcoYvTmnQ2uDN2eGbqrY3UWt8oLgnR2Y7PEn29/dDXnZAW3RGYHmgrbkcO1kwS2M7WHGQVkhPaYBfdoovTmoyT2tKZXyVamBZQUNZcYYUK0bxvp/4x6ZacobPn4kpR2Rmeo1GNz5geIzK2OB1iJh4jJw3UWtYa4Bxhphgc4K82upYcIVEX3dNZHuTqrtbc4nBmYnZ4OYbNVBugZRFYXijs799TUaOn62Gna85VnCSo7FXfZhhdotPaH+rusWbssKmwdEoQV2OpbWzwMp9kqT56t2Dl6bBz9fKxr6ds8Nyh5qzzt3t0bh6jp+ToKvPtKzQpZe90d7Q3+j53snE09tieo7769v58+vU3eSkvs/oxa/DqKP12MQSNVYMK0oHIkAUOVshSmsOLk0OMlIWOFcGID0dRWcaQmMcPVooUnQTMlArV3kWPF4zYIE4ZYVQfp0pT268c1gwW3xCcJD+1rhynrpHc5JXg6IkT3E+bItah6c/Z4VhjaxPeZd9p8FtmLVhiaUEHjiEr8kqRFw4YH5Id5ipemtWf5s0WXenyt7DeV1EbIr9zq0uVHOXvdTFgWcUL0pdUVcgN1B3or+x0uVqk64gL0XPkXfNiW6ybVX638aQuNCLY1q2d2JkkrG4g3BXXmqaYVFCQlDgqYxpS0tRSVJAY394YmE3Rlk/VGczQFTutpbWlnrqrItCSlkvOUyhaltveYSvlozIppSceG18golLTluFhIfesJizh3cNITmjioHdvaixpZ2Gd3WelJGWuM5TdY1nbnd8cXGUiYh7laXEs6fJibJRAAAA53RSTlMAEP4JAQQLBv7+J/7+KhTtHzMb8xc+PkhB/h/+wt81uEj9/vgv/nyrV/5Qb1hU4/6H/qr+/rz+eJtF+kdlYG7+f/4q59iuh83+uv7+q+7Tx/7+7ev+/mb+1Cf+wa98aJs20f7+m5uG8tT+UN+4/rv+lvDyuP5U3JvZz5nbxPGBzpL+/vD5/t/3qt7Je97k5d+4/vDhy83////////////////////////////////////////////////////////////////////+//////////////////////////////////////4/Y6yvAAAU2klEQVR42uyWS2wT+R3HidkVTu2VUAUHyxKsLRnV5WAZVT4AlQUHFJWLKyXKhRMcViDRVdVIBSHRQqEqu4t2tw+nGTO1x57YHtvMTDzjx8gev2Mn8SO2cZyYGPJy3m8rhDwI9D9pe2ir3irZSPM5z+H7md/rf+QIDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw/P/4mWCxeOf7zpP2m5eFcqvfv1iY80/wkQHx8dzZS+utjykcb3eSiS8vgDkq9uHf344qt9PjXuoShq1O9LSa79L4UTl5uwPMfP3PV5SL9PHQhk/KOjfjwTSD26duHYf395+f5f/nSr6TbPxTt+yh5yu6hMoJRKSTM4nvEFSrFH107+p+j9b/pr8h812eo5+YucnSBCdrvLRuTUKUksllKDWkhTkuzTf1tIIP7z/lpBfqHJ2udeF0G4OAHSTrjs/lIsm41JUqVSSiLJPrp24pOj/2qeb14872ifjctPNtHfP3Hh1te/w5wh0s4JUBRDEnY8lc3eyGYlXCl2H1377a/PXG5puXz/2xfP+zs65uLxzs+aaHbvaNV/ZJKQ2U1SnIDHj/tJl90nyd64cSMb25VKd7Ve+v3T77779gXI399fG3AMPDneRPGpkD2HM4k+CHWRHo+H2z8ZPxViJCB+qhQIqBkbu/f+wQsQn8vfnnc4Ck9amia+h3C7QnaPT5pjIaM5hIP1w+2fQEAak5SkAS2D+yLsYXyQHwh0yOMOx+wfjjVF/Hta3D9KeUOhEOnJlKRMFIKcjBocM7A/szGp2oczblsu43V2PTiMzxnMDTg4gSY4u2fuMQmC8YMfPkqRJDWKB0pqhob6aEZdksQkUjWeiyT29lgGZ2zoxNqHx4f52wsOTuBsw//+2XsMYXOiVu8oDvpF7edaP5CKSXJOqM+tlqi1eM7L3l77sDNB+qUP91Dz7W2uBh2zoIGKjnyj79ip30RcVqvVZrOizgjO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";

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
    <h1><img src="${EXPORT_LOGO_DATA_URI}" alt="" width="22" height="22" style="vertical-align:-5px;border-radius:5px" /> ${escapeHtml(shopName)} — ${escapeHtml(labels.title)}</h1>
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

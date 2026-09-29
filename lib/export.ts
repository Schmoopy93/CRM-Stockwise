import * as XLSX from "xlsx";
import { Product, ProductVariant } from "./types";

export function exportToExcel(
  products: Product[],
  variantMap: Record<string, ProductVariant[]>,
  shopName = "Radnja"
) {
  const rows: Record<string, string | number>[] = [];

  for (const product of products) {
    const variants = variantMap[product.id] ?? [];
    if (variants.length === 0) {
      rows.push({
        "Artikal": product.name,
        "SKU": product.sku,
        "Kategorija": product.category,
        "Varijanta": "—",
        "SKU varijante": "—",
        "Količina": product.totalQuantity,
        "Min. stanje": product.minStock,
        "Status": product.minStock > 0 && product.totalQuantity <= product.minStock ? "⚠ Nisko" : "OK",
      });
    } else {
      for (const v of variants) {
        rows.push({
          "Artikal": product.name,
          "SKU": product.sku,
          "Kategorija": product.category,
          "Varijanta": v.label,
          "SKU varijante": v.sku,
          "Količina": v.quantity,
          "Min. stanje": product.minStock,
          "Status": product.minStock > 0 && product.totalQuantity <= product.minStock ? "⚠ Nisko" : "OK",
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
  XLSX.utils.book_append_sheet(wb, ws, "Stanje artikala");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${shopName}-stanje-${date}.xlsx`);
}

export function exportToPrint(
  products: Product[],
  variantMap: Record<string, ProductVariant[]>,
  shopName = "Radnja"
) {
  const date = new Date().toLocaleDateString("sr-RS");

  const rows = products
    .flatMap((p) => {
      const variants = variantMap[p.id] ?? [];
      if (variants.length === 0) {
        return [{ name: p.name, sku: p.sku, category: p.category, variant: "—", quantity: p.totalQuantity, minStock: p.minStock }];
      }
      return variants.map((v) => ({
        name: p.name, sku: p.sku, category: p.category,
        variant: v.label, quantity: v.quantity, minStock: p.minStock,
      }));
    });

  const html = `
    <!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>Stanje artikala - ${shopName}</title>
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
    <h1>📦 ${shopName} — Stanje artikala</h1>
    <div class="meta">Datum: ${date} · Ukupno artikala: ${products.length} · Ukupno komada: ${products.reduce((s, p) => s + p.totalQuantity, 0)}</div>
    <table>
      <thead><tr>
        <th>Artikal</th><th>SKU</th><th>Kategorija</th>
        <th>Varijanta</th><th>Količina</th><th>Min.</th>
      </tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${r.name}</td>
            <td style="color:#888">${r.sku || "—"}</td>
            <td>${r.category || "—"}</td>
            <td>${r.variant}</td>
            <td class="${r.minStock > 0 && r.quantity <= r.minStock ? "low" : ""}">${r.quantity}</td>
            <td style="color:#aaa">${r.minStock || "—"}</td>
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

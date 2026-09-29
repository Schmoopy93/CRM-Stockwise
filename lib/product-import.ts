import * as XLSX from "xlsx";

export interface ParsedProductImportRow {
  rowNumber: number;
  name: string;
  sku: string;
  category: string;
  minStock: number;
  costPrice?: number;
  salePrice?: number;
  supplierName?: string;
  variantLabel: string;
  variantSku: string;
  quantity: number;
  errors: string[];
}

export interface ProductImportParseResult {
  rows: ParsedProductImportRow[];
  errors: string[];
}

const MAX_IMPORT_ROWS = 5_000;

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "product", "product_name", "productname", "naziv", "naziv_artikla", "название", "название_товара", "товар"],
  sku: ["sku", "product_sku", "item_code", "code", "šifra", "sifra", "артикул"],
  category: ["category", "kategorija", "категория"],
  min_stock: ["min_stock", "minimum_stock", "minstock", "minimalno_stanje", "минимальный_остаток"],
  cost_price: ["cost_price", "costprice", "purchase_price", "purchaseprice", "nabavna_cena", "nabavna_cijena", "закупочная_цена"],
  sale_price: ["sale_price", "saleprice", "selling_price", "sellingprice", "prodajna_cena", "prodajna_cijena", "цена_продажи"],
  supplier_name: ["supplier_name", "suppliername", "supplier", "dobavljac", "dobavljač", "поставщик"],
  variant_label: ["variant_label", "variantlabel", "variant", "size_color", "naziv_varijante", "вариант"],
  variant_sku: ["variant_sku", "variantsku", "sku_varijante", "артикул_варианта"],
  quantity: ["quantity", "qty", "stock", "kolicina", "količina", "количество", "остаток"],
};

const HEADER_LOOKUP = new Map(
  Object.entries(HEADER_ALIASES).flatMap(([canonical, aliases]) =>
    aliases.map((alias) => [normalizeHeader(alias), canonical] as const)
  )
);

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLocaleLowerCase().replace(/[\s-]+/g, "_");
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const text = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseProductImportRows(matrix: unknown[][]): ProductImportParseResult {
  if (matrix.length < 2) return { rows: [], errors: ["fileTooShort"] };

  const headers = matrix[0].map((cell) => HEADER_LOOKUP.get(normalizeHeader(String(cell ?? ""))) ?? "");
  const required = ["name", "variant_label", "quantity"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length > 0) return { rows: [], errors: ["missingHeaders", ...missing] };

  const duplicateHeaders = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicateHeaders.length > 0) return { rows: [], errors: ["duplicateHeaders"] };

  const rows = matrix.slice(1).map((cells, index): ParsedProductImportRow => {
    const value = (key: string) => {
      const column = headers.indexOf(key);
      return column < 0 ? "" : String(cells[column] ?? "").trim();
    };
    const name = value("name");
    const sku = value("sku");
    const category = value("category");
    const variantLabel = value("variant_label");
    const variantSku = value("variant_sku");
    const supplierName = value("supplier_name");
    const rawMinStock = value("min_stock");
    const rawCostPrice = value("cost_price");
    const rawSalePrice = value("sale_price");
    const rawQuantity = value("quantity");
    const minStock = rawMinStock ? parseNumber(rawMinStock) : 0;
    const costPrice = rawCostPrice ? parseNumber(rawCostPrice) : undefined;
    const salePrice = rawSalePrice ? parseNumber(rawSalePrice) : undefined;
    const quantity = parseNumber(rawQuantity);
    const errors: string[] = [];

    if (!name) errors.push("nameRequired");
    if (!variantLabel) errors.push("variantRequired");
    if (quantity === undefined || !Number.isSafeInteger(quantity) || quantity < 0) errors.push("quantityInvalid");
    if (minStock === undefined || !Number.isSafeInteger(minStock) || minStock < 0) errors.push("minStockInvalid");
    if (rawCostPrice && (costPrice === undefined || costPrice < 0)) errors.push("costPriceInvalid");
    if (rawSalePrice && (salePrice === undefined || salePrice < 0)) errors.push("salePriceInvalid");

    return {
      rowNumber: index + 2,
      name,
      sku,
      category,
      minStock: minStock ?? 0,
      ...(costPrice !== undefined ? { costPrice } : {}),
      ...(salePrice !== undefined ? { salePrice } : {}),
      ...(supplierName ? { supplierName } : {}),
      variantLabel,
      variantSku,
      quantity: quantity ?? 0,
      errors,
    };
  }).filter((row) => row.name || row.sku || row.variantLabel || row.quantity !== 0 || row.errors.length > 0);

  const groups = new Map<string, ParsedProductImportRow[]>();
  for (const row of rows) {
    const key = row.sku.toLocaleLowerCase() || row.name.toLocaleLowerCase();
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length > 200) group.forEach((row) => row.errors.push("tooManyVariants"));
    if (!Number.isSafeInteger(group.reduce((sum, row) => sum + row.quantity, 0))) {
      group.forEach((row) => row.errors.push("totalQuantityInvalid"));
    }
  }

  if (rows.length === 0) return { rows: [], errors: ["noRows"] };
  return { rows, errors: [] };
}

export async function parseProductImportFile(file: File): Promise<ProductImportParseResult> {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (!extension || !["csv", "xls", "xlsx"].includes(extension)) {
    return { rows: [], errors: ["unsupportedFile"] };
  }
  if (file.size === 0) return { rows: [], errors: ["emptyFile"] };
  if (file.size > 10 * 1024 * 1024) return { rows: [], errors: ["fileTooLarge"] };

  try {
    const bytes = await file.arrayBuffer();
    let workbook: XLSX.WorkBook;
    if (extension === "csv") {
      const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
      const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
      const delimiters = [",", ";", "\t"];
      const counts = new Map(delimiters.map((delimiter) => [delimiter, 0]));
      let quoted = false;
      for (let index = 0; index < firstLine.length; index++) {
        if (firstLine[index] === '"') {
          if (quoted && firstLine[index + 1] === '"') index++;
          else quoted = !quoted;
        } else if (!quoted && counts.has(firstLine[index])) {
          counts.set(firstLine[index], (counts.get(firstLine[index]) ?? 0) + 1);
        }
      }
      const delimiter = delimiters.reduce((best, candidate) =>
        (counts.get(candidate) ?? 0) > (counts.get(best) ?? 0) ? candidate : best
      );
      workbook = XLSX.read(text, { type: "string", FS: delimiter, raw: false, cellDates: false });
    } else {
      workbook = XLSX.read(bytes, { type: "array", raw: false, cellDates: false });
    }
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return { rows: [], errors: ["emptyFile"] };
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    if (matrix.length - 1 > MAX_IMPORT_ROWS) return { rows: [], errors: ["tooManyRows"] };
    return parseProductImportRows(matrix);
  } catch {
    return { rows: [], errors: ["fileReadError"] };
  }
}

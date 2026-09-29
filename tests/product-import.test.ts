import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseProductImportFile, parseProductImportRows } from "../lib/product-import.ts";

test("parses multiple variants and numeric fields from spreadsheet rows", () => {
  const result = parseProductImportRows([
    ["name", "sku", "category", "min_stock", "cost_price", "sale_price", "supplier_name", "variant_label", "variant_sku", "quantity"],
    ["Summer Dress", "DR-1", "Clothing", "3", "12.5", "39.99", "Supplier A", "Blue / S", "DR-1-BS", "4"],
    ["Summer Dress", "DR-1", "Clothing", "3", "12.5", "39.99", "Supplier A", "Red / M", "DR-1-RM", "2"],
  ]);

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].rowNumber, 2);
  assert.equal(result.rows[0].costPrice, 12.5);
  assert.equal(result.rows[0].salePrice, 39.99);
  assert.equal(result.rows[1].quantity, 2);
  assert.equal(result.rows[1].errors.length, 0);
});

test("recognizes Serbian and Russian required column names", () => {
  const result = parseProductImportRows([
    ["Название", "Артикул", "Вариант", "Количество"],
    ["Платье", "DR-1", "Красный / M", "3"],
  ]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].name, "Платье");
  assert.equal(result.rows[0].sku, "DR-1");
  assert.equal(result.rows[0].quantity, 3);
});

test("requires mandatory columns and reports invalid quantities", () => {
  const missing = parseProductImportRows([["name", "sku"], ["Phone", "PH-1"]]);
  assert.equal(missing.errors[0], "missingHeaders");

  const invalid = parseProductImportRows([
    ["name", "variant_label", "quantity"],
    ["Phone", "Black", "-1"],
    ["Phone", "White", "1.5"],
  ]);
  assert.ok(invalid.rows.every((row) => row.errors.includes("quantityInvalid")));
});

test("rejects duplicate recognized headers", () => {
  const result = parseProductImportRows([
    ["name", "product_name", "variant_label", "quantity"],
    ["Phone", "Phone", "Black", "1"],
  ]);
  assert.equal(result.errors[0], "duplicateHeaders");
});

test("reads an XLSX workbook through the same import pipeline", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["name", "variant_label", "quantity"],
    ["Perfume", "100 ml", 7],
  ]), "Products");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const file = new File([bytes], "products.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const result = await parseProductImportFile(file);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].name, "Perfume");
  assert.equal(result.rows[0].quantity, 7);
});

test("reads semicolon-delimited CSV files exported by localized spreadsheet apps", async () => {
  const csv = [
    "name;variant_label;quantity;cost_price",
    '"Summer, dress";"Blue / M";4;12,50',
  ].join("\r\n");
  const file = new File([csv], "products.csv", { type: "text/csv;charset=utf-8" });
  const result = await parseProductImportFile(file);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].name, "Summer, dress");
  assert.equal(result.rows[0].quantity, 4);
  assert.equal(result.rows[0].costPrice, 12.5);
});

test("reads legacy XLS workbooks", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["name", "variant_label", "quantity"],
    ["Sunglasses", "Black", 2],
  ]), "Products");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xls" });
  const file = new File([bytes], "products.xls", { type: "application/vnd.ms-excel" });
  const result = await parseProductImportFile(file);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].name, "Sunglasses");
  assert.equal(result.rows[0].quantity, 2);
});
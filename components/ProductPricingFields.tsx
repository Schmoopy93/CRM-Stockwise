"use client";

import { Product } from "@/lib/types";
import { useI18n } from "@/lib/i18n-context";

export interface ProductPricingValues {
  costPrice: string;
  salePrice: string;
  compareAtPrice: string;
  supplierName: string;
  supplierContact: string;
}

export const emptyPricing: ProductPricingValues = { costPrice: "", salePrice: "", compareAtPrice: "", supplierName: "", supplierContact: "" };

export function pricingFromProduct(product: Product): ProductPricingValues {
  return {
    costPrice: product.costPrice !== undefined ? String(product.costPrice) : "",
    salePrice: product.salePrice !== undefined ? String(product.salePrice) : "",
    compareAtPrice: product.compareAtPrice !== undefined ? String(product.compareAtPrice) : "",
    supplierName: product.supplier?.name ?? "",
    supplierContact: product.supplier?.contact ?? "",
  };
}

export function parsePrice(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed.replace(",", ".")) : undefined;
}

interface ProductPricingFieldsProps {
  values: ProductPricingValues;
  onChange: (values: ProductPricingValues) => void;
}

const labelStyle = { display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-3)", marginBottom: 6 } as const;

export default function ProductPricingFields({ values, onChange }: ProductPricingFieldsProps) {
  const { t } = useI18n();

  function update(field: keyof ProductPricingValues, value: string) {
    onChange({ ...values, [field]: value });
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <h2 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-2)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {t("product.pricingSupplier")}
      </h2>
      <div className="product-variant-fields" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label style={labelStyle}>{t("product.costPrice")} (€)</label>
          <input className="input" type="text" inputMode="decimal" placeholder={t("product.optional")} value={values.costPrice} onChange={(e) => update("costPrice", e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>{t("product.salePrice")} (€)</label>
          <input className="input" type="text" inputMode="decimal" placeholder={t("product.optional")} value={values.salePrice} onChange={(e) => update("salePrice", e.target.value)} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>{t("product.compareAtPrice")} (€)</label>
          <input className="input" type="text" inputMode="decimal" placeholder={t("product.optional")} value={values.compareAtPrice} onChange={(e) => update("compareAtPrice", e.target.value)} />
          <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: "5px 0 0" }}>{t("product.compareAtPriceHint")}</p>
        </div>
        <div>
          <label style={labelStyle}>{t("product.supplier")}</label>
          <input className="input" type="text" placeholder={t("product.optional")} value={values.supplierName} onChange={(e) => update("supplierName", e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>{t("product.supplierContact")}</label>
          <input className="input" type="text" placeholder={t("product.optional")} value={values.supplierContact} onChange={(e) => update("supplierContact", e.target.value)} />
        </div>
      </div>
    </section>
  );
}

"use client";

import { Product } from "@/lib/types";
import { useI18n } from "@/lib/i18n-context";
import { BASE_CURRENCY } from "@/lib/currency";
import { Banknote } from "lucide-react";

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

export default function ProductPricingFields({ values, onChange }: ProductPricingFieldsProps) {
  const { t } = useI18n();

  function update(field: keyof ProductPricingValues, value: string) {
    onChange({ ...values, [field]: value });
  }

  return (
    <section className="pform-card">
      <div className="pform-card-head">
        <span className="pform-card-icon"><Banknote size={15} /></span>
        <h2 className="pform-card-title">{t("product.pricingSupplier")}</h2>
      </div>
      <p className="pform-card-hint">{t("product.pricingHint")}</p>
      <div className="pform-grid">
        <div>
          <label className="pform-label" htmlFor="product-cost-price">{t("product.costPrice")} ({BASE_CURRENCY})</label>
          <input id="product-cost-price" className="input" type="text" inputMode="decimal" value={values.costPrice} onChange={(e) => update("costPrice", e.target.value)} required />
        </div>
        <div>
          <label className="pform-label" htmlFor="product-sale-price">{t("product.salePrice")} ({BASE_CURRENCY})</label>
          <input id="product-sale-price" className="input" type="text" inputMode="decimal" value={values.salePrice} onChange={(e) => update("salePrice", e.target.value)} required />
        </div>
        <div className="pform-span-full">
          <label className="pform-label" htmlFor="product-compare-at-price">{t("product.compareAtPrice")} ({BASE_CURRENCY})</label>
          <input id="product-compare-at-price" className="input" type="text" inputMode="decimal" placeholder={t("product.optional")} value={values.compareAtPrice} onChange={(e) => update("compareAtPrice", e.target.value)} />
          <p className="pform-hint">{t("product.compareAtPriceHint")}</p>
        </div>
        <div>
          <label className="pform-label" htmlFor="product-supplier">{t("product.supplier")}</label>
          <input id="product-supplier" className="input" type="text" placeholder={t("product.optional")} value={values.supplierName} onChange={(e) => update("supplierName", e.target.value)} />
        </div>
        <div>
          <label className="pform-label" htmlFor="product-supplier-contact">{t("product.supplierContact")}</label>
          <input id="product-supplier-contact" className="input" type="text" placeholder={t("product.optional")} value={values.supplierContact} onChange={(e) => update("supplierContact", e.target.value)} />
        </div>
      </div>
    </section>
  );
}

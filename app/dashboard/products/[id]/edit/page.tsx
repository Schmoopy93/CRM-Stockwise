"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { translateError, useI18n } from "@/lib/i18n-context";
import { useProduct, useProducts, useVariants } from "@/lib/hooks";
import { saveProduct } from "@/lib/actions";
import { ProductCustomField, ProductVariant } from "@/lib/types";
import ProductCustomFields from "@/components/ProductCustomFields";
import ProductImages, { ProductImageSlot } from "@/components/ProductImages";
import ProductPricingFields, { emptyPricing, parsePrice, pricingFromProduct } from "@/components/ProductPricingFields";
import { ArrowLeft, Boxes, Eye, Layers, Package, Plus, Trash2 } from "lucide-react";

function newVariant(): ProductVariant { return { id: "", label: "", sku: "", quantity: 0 }; }

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useI18n();
  const { product, loading } = useProduct(profile?.shopId, id);
  const existingVariants = useVariants(profile?.shopId, id);
  const { products } = useProducts(profile?.shopId);
  const existingCategories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))),
    [products]
  );

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [minStock, setMinStock] = useState(0);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<ProductCustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | number | boolean>>({});
  const [variants, setVariants] = useState<ProductVariant[]>([newVariant()]);
  const [imageSlots, setImageSlots] = useState<ProductImageSlot[]>([]);
  const [pricing, setPricing] = useState(emptyPricing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [catalogHidden, setCatalogHidden] = useState(false);

  useEffect(() => {
    if (product) {
      // Firebase snapshot is the source of truth when the edit page loads.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(product.name);
      setSku(product.sku);
      setCategory(product.category);
      setMinStock(product.minStock);
      setImageSlots((product.images?.length ? product.images : product.imageUrl ? [product.imageUrl] : []).map((url) => ({ file: null, url })));
      setCustomFieldDefinitions(product.customFieldDefinitions ?? []);
      setCustomFieldValues(product.customFieldValues ?? {});
      setCatalogHidden(product.catalogHidden === true);
      setPricing(pricingFromProduct(product));
    }
  }, [product]);

  useEffect(() => {
    // Variants arrive asynchronously from the Firestore subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (existingVariants.length > 0) setVariants(existingVariants);
  }, [existingVariants]);

  function updateVariant(i: number, field: keyof ProductVariant, value: string | number) {
    setVariants((p) => p.map((v, idx) => idx === i ? { ...v, [field]: value } : v));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(""); setSaving(true);
    try {
      const savedId = await saveProduct(
        profile.shopId, id, name, sku, category, minStock, imageSlots, variants, customFieldDefinitions, customFieldValues,
        parsePrice(pricing.costPrice), parsePrice(pricing.salePrice),
        { name: pricing.supplierName, contact: pricing.supplierContact, notes: product?.supplier?.notes },
        catalogHidden,
        parsePrice(pricing.compareAtPrice)
      );
      router.replace(`/dashboard/products/${savedId}`);
    } catch (err: unknown) {
      setError(translateError(err, t, "product.saveError"));
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>;

  return (
    <div className="fade-up">
      <div className="pform-head">
        <Link href={`/dashboard/products/${id}`} className="pform-back">
          <ArrowLeft size={14} /> {t("back")}
        </Link>
        <h1 className="pform-title">{t("product.editTitle")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="product-form">
        <div className="product-form-main">
          <ProductImages slots={imageSlots} onChange={setImageSlots} />

          <section className="pform-card">
            <div className="pform-card-head">
              <span className="pform-card-icon"><Package size={15} /></span>
              <h2 className="pform-card-title">{t("product.basics")}</h2>
            </div>
            <p className="pform-card-hint">{t("product.basicsHint")}</p>
            <div className="pform-grid">
              <div className="pform-span-full">
                <label className="pform-label" htmlFor="product-name">{t("product.name")}</label>
                <input id="product-name" className="input" type="text" placeholder={t("product.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="pform-label" htmlFor="product-sku">{t("product.sku")}</label>
                <input id="product-sku" className="input" type="text" placeholder={t("product.optional")} value={sku} onChange={(e) => setSku(e.target.value)} />
              </div>
              <div>
                <label className="pform-label" htmlFor="product-category">{t("product.category")}</label>
                <input id="product-category" className="input" type="text" placeholder={t("product.categoryPlaceholder")} value={category} onChange={(e) => setCategory(e.target.value)} list="product-categories" />
              </div>
            </div>
            <datalist id="product-categories">
              {existingCategories.map((existing) => <option key={existing} value={existing} />)}
            </datalist>
          </section>

          <ProductCustomFields
            existingCategories={existingCategories}
            category={category}
            name={name}
            definitions={customFieldDefinitions}
            values={customFieldValues}
            onDefinitionsChange={setCustomFieldDefinitions}
            onValuesChange={setCustomFieldValues}
          />

          <section className="pform-card">
            <div className="pform-card-head">
              <span className="pform-card-icon"><Layers size={15} /></span>
              <h2 className="pform-card-title">{t("product.variants")}</h2>
              <div className="pform-card-actions">
                <button type="button" className="pform-btn" onClick={() => setVariants((p) => [...p, newVariant()])}>
                  <Plus size={13} /> {t("product.addVariant")}
                </button>
              </div>
            </div>
            <p className="pform-card-hint">{t("product.variantsHint")} {t("product.quantityLockedHint")}</p>
            <div className="product-form-variants">
              {variants.map((variant, i) => (
                <div key={i} className="pform-variant">
                  <div className="pform-variant-head">
                    <span className="pform-variant-num">{t("product.variantNumber", { n: i + 1 })}</span>
                    {variants.length > 1 && (
                      <button type="button" className="pform-icon-btn" aria-label={t("product.removeVariant", { n: i + 1 })} onClick={() => setVariants((p) => p.filter((_, idx) => idx !== i))}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="product-variant-fields">
                    <input className="input" type="text" placeholder={t("product.variantName")} value={variant.label} required aria-label={t("product.variantName")}
                      onChange={(e) => updateVariant(i, "label", e.target.value)} />
                    <input className="input" type="number" placeholder={t("product.quantity")} value={variant.quantity} disabled aria-label={t("product.quantity")} />
                    <input className="input pform-span-full" type="text" placeholder={t("product.variantSkuPlaceholder")} value={variant.sku} aria-label={t("product.variantSkuPlaceholder")}
                      onChange={(e) => updateVariant(i, "sku", e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="product-form-side">
          <section className="pform-card">
            <div className="pform-card-head">
              <span className="pform-card-icon"><Boxes size={15} /></span>
              <h2 className="pform-card-title">{t("product.minStock")}</h2>
            </div>
            <p className="pform-card-hint">{t("product.minStockHint")}</p>
            <input className="input" type="number" min="0" value={minStock} aria-label={t("product.minStock")} onChange={(e) => setMinStock(parseInt(e.target.value) || 0)} />
          </section>

          <ProductPricingFields values={pricing} onChange={setPricing} />

          <section className="pform-card">
            <div className="pform-card-head">
              <span className="pform-card-icon"><Eye size={15} /></span>
              <h2 className="pform-card-title">{t("catalog.productVisible")}</h2>
            </div>
            <label className="pform-toggle">
              <input type="checkbox" checked={!catalogHidden} onChange={(e) => setCatalogHidden(!e.target.checked)} />
              <span>{t("catalog.productVisibleHint")}</span>
            </label>
          </section>

          {error && <div className="pform-error">{error}</div>}

          <button className="btn-primary pform-submit" type="submit" disabled={saving}>
            {saving ? t("product.saving") : t("product.saveBtn")}
          </button>
        </aside>
      </form>
    </div>
  );
}

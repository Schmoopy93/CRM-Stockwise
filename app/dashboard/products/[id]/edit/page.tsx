"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useProduct, useVariants } from "@/lib/hooks";
import { saveProduct } from "@/lib/actions";
import { ProductCustomField, ProductVariant } from "@/lib/types";
import ProductCustomFields from "@/components/ProductCustomFields";
import ProductImages, { ProductImageSlot } from "@/components/ProductImages";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

function newVariant(): ProductVariant { return { id: "", label: "", sku: "", quantity: 0 }; }

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useI18n();
  const { product, loading } = useProduct(profile?.shopId, id);
  const existingVariants = useVariants(profile?.shopId, id);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [minStock, setMinStock] = useState(0);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<ProductCustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | number | boolean>>({});
  const [variants, setVariants] = useState<ProductVariant[]>([newVariant()]);
  const [imageSlots, setImageSlots] = useState<ProductImageSlot[]>([]);
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
      const savedId = await saveProduct(profile.shopId, id, name, sku, category, minStock, imageSlots, variants, customFieldDefinitions, customFieldValues, undefined, undefined, undefined, catalogHidden);
      router.replace(`/dashboard/products/${savedId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("product.saveError"));
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>;

  const fields = [
    { label: t("product.name"), value: name, setter: setName, required: true, placeholder: t("product.namePlaceholder") },
    { label: t("product.sku"), value: sku, setter: setSku, required: false, placeholder: t("product.optional") },
    { label: t("product.category"), value: category, setter: setCategory, required: false, placeholder: t("product.categoryPlaceholder") },
  ];

  return (
    <div className="fade-up" style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.75rem" }}>
        <Link href={`/dashboard/products/${id}`} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.82rem", color: "var(--text-2)", textDecoration: "none" }}>
          <ArrowLeft size={14} /> {t("back")}
        </Link>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{t("product.editTitle")}</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <ProductImages slots={imageSlots} onChange={setImageSlots} />

        {/* Fields */}
        {fields.map(({ label, value, setter, required, placeholder }) => (
          <div key={label}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
            <input className="input" type="text" placeholder={placeholder} value={value} onChange={(e) => setter(e.target.value)} required={required} />
          </div>
        ))}

        <ProductCustomFields
          category={category}
          name={name}
          definitions={customFieldDefinitions}
          values={customFieldValues}
          onDefinitionsChange={setCustomFieldDefinitions}
          onValuesChange={setCustomFieldValues}
        />

        <div>
          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("product.minStock")}</label>
          <input className="input" type="number" min="0" value={minStock} onChange={(e) => setMinStock(parseInt(e.target.value) || 0)} />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.82rem", color: "var(--text-2)" }}>
          <input type="checkbox" checked={!catalogHidden} onChange={(e) => setCatalogHidden(!e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
          <span>{t("catalog.productVisible")}<span style={{ display: "block", fontSize: "0.7rem", color: "var(--text-3)" }}>{t("catalog.productVisibleHint")}</span></span>
        </label>

        {/* Variants */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("product.variants")}</label>
            <button type="button" onClick={() => setVariants((p) => [...p, newVariant()])}
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", color: "var(--accent-2)", background: "none", border: "none", cursor: "pointer" }}>
              <Plus size={13} /> {t("product.addVariant")}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {variants.map((variant, i) => (
              <div key={i} style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 10, padding: "0.875rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.625rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-3)", fontWeight: 600 }}>{t("product.variantNumber", { n: i + 1 })}</span>
                  {variants.length > 1 && (
                    <button type="button" aria-label={t("product.removeVariant", { n: i + 1 })} onClick={() => setVariants((p) => p.filter((_, idx) => idx !== i))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", display: "flex", alignItems: "center" }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div className="product-variant-fields" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <input
                    type="text" placeholder={t("product.variantName")} value={variant.label} required
                    onChange={(e) => updateVariant(i, "label", e.target.value)}
                    style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.75rem", fontSize: "0.82rem", color: "var(--text-1)", outline: "none" }}
                  />
                  <input
                    type="number" placeholder={t("product.quantity")} min="0" value={variant.quantity}
                    onChange={(e) => updateVariant(i, "quantity", parseInt(e.target.value) || 0)}
                    style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.75rem", fontSize: "0.82rem", color: "var(--text-1)", outline: "none" }}
                  />
                  <input
                    type="text" placeholder={t("product.variantSkuPlaceholder")} value={variant.sku}
                    onChange={(e) => updateVariant(i, "sku", e.target.value)}
                    style={{ gridColumn: "span 2", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.75rem", fontSize: "0.82rem", color: "var(--text-1)", outline: "none" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <div style={{ background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "0.82rem", color: "var(--red)" }}>{error}</div>}

        <button className="btn-primary" type="submit" disabled={saving} style={{ width: "100%", padding: "0.8rem", marginTop: "0.25rem" }}>
          {saving ? t("product.saving") : t("product.saveBtn")}
        </button>
      </form>
    </div>
  );
}

"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { saveProduct } from "@/lib/actions";
import { ProductCustomField, ProductVariant } from "@/lib/types";
import ProductCustomFields from "@/components/ProductCustomFields";
import { ArrowLeft, Plus, Trash2, ImageIcon } from "lucide-react";

function newVariant(): ProductVariant { return { id: "", label: "", sku: "", quantity: 0 }; }

export default function NewProductPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useI18n();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [minStock, setMinStock] = useState(0);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<ProductCustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | number | boolean>>({});
  const [variants, setVariants] = useState<ProductVariant[]>([newVariant()]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function updateVariant(i: number, field: keyof ProductVariant, value: string | number) {
    setVariants((p) => p.map((v, idx) => idx === i ? { ...v, [field]: value } : v));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(""); setSaving(true);
    try {
      const savedId = await saveProduct(profile.shopId, null, name, sku, category, minStock, imageFile, "", variants, customFieldDefinitions, customFieldValues);
      router.replace(`/dashboard/products/${savedId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("product.saveError"));
    } finally { setSaving(false); }
  }

  const fields = [
    { label: t("product.name"), value: name, setter: setName, required: true, placeholder: t("product.namePlaceholder") },
    { label: t("product.sku"), value: sku, setter: setSku, required: false, placeholder: t("product.optional") },
    { label: t("product.category"), value: category, setter: setCategory, required: false, placeholder: t("product.categoryPlaceholder") },
  ];

  return (
    <div className="fade-up" style={{ maxWidth: 540 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.75rem" }}>
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.82rem", color: "var(--text-2)", textDecoration: "none" }}>
          <ArrowLeft size={14} /> {t("back")}
        </Link>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{t("product.newTitle")}</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("product.image")}</label>
          <div
            onClick={() => fileRef.current?.click()}
            style={{ height: 130, background: "var(--bg-3)", border: "1px dashed var(--border-hover)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden" }}
          >
            {imagePreview ? (
                <Image src={imagePreview} alt={t("product.image")} width={200} height={130} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--text-3)" }}>
                <ImageIcon size={28} />
                <span style={{ fontSize: "0.78rem" }}>{t("product.imageClick")}</span>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)); } }} />
        </div>

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
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", display: "flex" }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                  <div className="product-variant-fields" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <input type="text" placeholder={t("product.variantName")} value={variant.label} required
                    onChange={(e) => updateVariant(i, "label", e.target.value)}
                    style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.75rem", fontSize: "0.82rem", color: "var(--text-1)", outline: "none" }} />
                  <input type="number" placeholder={t("product.quantity")} min="0" value={variant.quantity}
                    onChange={(e) => updateVariant(i, "quantity", parseInt(e.target.value) || 0)}
                    style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.75rem", fontSize: "0.82rem", color: "var(--text-1)", outline: "none" }} />
                  <input type="text" placeholder={t("product.variantSkuPlaceholder")} value={variant.sku}
                    onChange={(e) => updateVariant(i, "sku", e.target.value)}
                    style={{ gridColumn: "span 2", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.75rem", fontSize: "0.82rem", color: "var(--text-1)", outline: "none" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <div style={{ background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "0.82rem", color: "var(--red)" }}>{error}</div>}

        <button className="btn-primary" type="submit" disabled={saving} style={{ width: "100%", padding: "0.8rem" }}>
          {saving ? t("product.saving") : t("product.createBtn")}
        </button>
      </form>
    </div>
  );
}

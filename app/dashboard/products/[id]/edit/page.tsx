"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useProduct, useVariants } from "@/lib/hooks";
import { saveProduct } from "@/lib/actions";
import { ProductVariant } from "@/lib/types";
import { ArrowLeft, Plus, Trash2, ImageIcon } from "lucide-react";

function newVariant(): ProductVariant { return { id: "", label: "", sku: "", quantity: 0 }; }

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { product, loading } = useProduct(profile?.shopId, id);
  const existingVariants = useVariants(profile?.shopId, id);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [minStock, setMinStock] = useState(0);
  const [variants, setVariants] = useState<ProductVariant[]>([newVariant()]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (product) { setName(product.name); setSku(product.sku); setCategory(product.category); setMinStock(product.minStock); setImagePreview(product.imageUrl); }
  }, [product]);

  useEffect(() => {
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
      const savedId = await saveProduct(profile.shopId, id, name, sku, category, minStock, imageFile, !imageFile ? imagePreview : "", variants);
      router.replace(`/dashboard/products/${savedId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Greška");
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>;

  const fields = [
    { label: "Naziv", value: name, setter: setName, required: true, placeholder: "Naziv artikla" },
    { label: "SKU", value: sku, setter: setSku, required: false, placeholder: "Opciono" },
    { label: "Kategorija", value: category, setter: setCategory, required: false, placeholder: "Npr. Elektronika" },
  ];

  return (
    <div className="fade-up" style={{ maxWidth: 540 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.75rem" }}>
        <Link href={`/dashboard/products/${id}`} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.82rem", color: "var(--text-2)", textDecoration: "none" }}>
          <ArrowLeft size={14} /> Nazad
        </Link>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>Uredi artikal</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* Image */}
        <div>
          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Slika</label>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              height: 130,
              background: "var(--bg-3)",
              border: "1px dashed var(--border-hover)",
              borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              overflow: "hidden",
              transition: "border-color 0.15s",
            }}
          >
            {imagePreview ? (
              <Image src={imagePreview} alt="preview" width={200} height={130} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--text-3)" }}>
                <ImageIcon size={28} />
                <span style={{ fontSize: "0.78rem" }}>Klikni za upload</span>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)); } }} />
        </div>

        {/* Fields */}
        {fields.map(({ label, value, setter, required, placeholder }) => (
          <div key={label}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
            <input className="input" type="text" placeholder={placeholder} value={value} onChange={(e) => setter(e.target.value)} required={required} />
          </div>
        ))}

        <div>
          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Minimalno stanje</label>
          <input className="input" type="number" min="0" value={minStock} onChange={(e) => setMinStock(parseInt(e.target.value) || 0)} />
        </div>

        {/* Variants */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Varijante</label>
            <button type="button" onClick={() => setVariants((p) => [...p, newVariant()])}
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", color: "var(--accent-2)", background: "none", border: "none", cursor: "pointer" }}>
              <Plus size={13} /> Dodaj varijantu
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {variants.map((variant, i) => (
              <div key={i} style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 10, padding: "0.875rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.625rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-3)", fontWeight: 600 }}>VARIJANTA {i + 1}</span>
                  {variants.length > 1 && (
                    <button type="button" onClick={() => setVariants((p) => p.filter((_, idx) => idx !== i))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", display: "flex", alignItems: "center" }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <input
                    type="text" placeholder="Naziv varijante" value={variant.label} required
                    onChange={(e) => updateVariant(i, "label", e.target.value)}
                    style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.75rem", fontSize: "0.82rem", color: "var(--text-1)", outline: "none" }}
                  />
                  <input
                    type="number" placeholder="Količina" min="0" value={variant.quantity}
                    onChange={(e) => updateVariant(i, "quantity", parseInt(e.target.value) || 0)}
                    style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.75rem", fontSize: "0.82rem", color: "var(--text-1)", outline: "none" }}
                  />
                  <input
                    type="text" placeholder="SKU varijante (opciono)" value={variant.sku}
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
          {saving ? "Čuvam..." : "Sačuvaj izmjene"}
        </button>
      </form>
    </div>
  );
}

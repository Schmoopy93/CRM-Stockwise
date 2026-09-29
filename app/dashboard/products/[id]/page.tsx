"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { getLocalizedOptionValue } from "@/lib/product-field-templates";
import { useProduct, useVariants, useStockEvents } from "@/lib/hooks";
import { adjustStock, deleteProduct } from "@/lib/actions";
import { ArrowLeft, Pencil, Trash2, Minus, Plus, Clock, TrendingUp, TrendingDown } from "lucide-react";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const { product, loading } = useProduct(profile?.shopId, id);
  const variants = useVariants(profile?.shopId, id);
  const events = useStockEvents(profile?.shopId, id);

  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [customDelta, setCustomDelta] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleAdjust(variantId: string, delta: number) {
    if (!profile) return;
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) return;
    if (Math.abs(delta) >= 10 && !confirm(`Promjena od ${delta > 0 ? "+" : ""}${delta} komada. Nastavi?`)) return;
    setAdjusting(variantId);
    setError("");
    try {
      await adjustStock(profile.shopId, id, variant, delta, profile.uid, profile.displayName);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Greška");
    } finally {
      setAdjusting(null);
    }
  }

  async function handleCustomAdjust(variantId: string, positive: boolean) {
    const val = parseInt(customDelta[variantId] ?? "0", 10);
    if (!val || isNaN(val)) return;
    await handleAdjust(variantId, positive ? val : -val);
    setCustomDelta((p) => ({ ...p, [variantId]: "" }));
  }

  async function handleDelete() {
    if (!profile || !confirm("Obriši artikal? Ova akcija je nepovratna.")) return;
    setDeleting(true);
    try {
      await deleteProduct(profile.shopId, id);
      router.replace("/dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Greška pri brisanju");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!product) {
    return (
      <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-2)" }}>
        Artikal nije pronađen.{" "}
        <Link href="/dashboard" style={{ color: "var(--accent-2)" }}>Nazad</Link>
      </div>
    );
  }

  const isLow = product.minStock > 0 && product.totalQuantity <= product.minStock;

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: 720 }}>

      {/* Breadcrumb + actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link
          href="/dashboard"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: "0.82rem", color: "var(--text-2)",
            textDecoration: "none", transition: "color 0.15s",
          }}
        >
          <ArrowLeft size={14} /> Nazad
        </Link>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link
            href={`/dashboard/products/${id}/edit`}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "0.45rem 0.875rem",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: "0.8rem", color: "var(--text-2)",
              textDecoration: "none", transition: "all 0.15s",
            }}
          >
            <Pencil size={13} /> Uredi
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "0.45rem 0.875rem",
              background: "var(--red-dim)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8,
              fontSize: "0.8rem", color: "var(--red)",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <Trash2 size={13} /> Obriši
          </button>
        </div>
      </div>

      {/* Product hero */}
      <div className="glass" style={{ padding: "1.5rem", display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            width={80}
            height={80}
            style={{ width: 80, height: 80, borderRadius: 14, objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 80, height: 80,
              background: "var(--bg-3)",
              borderRadius: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 32, flexShrink: 0,
            }}
          >
            📦
          </div>
        )}
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0, color: "var(--text-1)" }}>{product.name}</h1>
          {product.sku && <p style={{ fontSize: "0.8rem", color: "var(--text-3)", margin: "4px 0 0" }}>SKU: {product.sku}</p>}
          {product.category && (
            <span
              className="badge"
              style={{ marginTop: 8, background: "var(--accent-glow)", color: "var(--accent-2)", border: "1px solid rgba(99,102,241,0.2)" }}
            >
              {product.category}
            </span>
          )}
          <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem" }}>
            <div>
              <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: 0 }}>Ukupno stanje</p>
              <p style={{ fontSize: "2rem", fontWeight: 700, margin: 0, color: isLow ? "var(--amber)" : "var(--text-1)", lineHeight: 1 }}>
                {product.totalQuantity}
              </p>
            </div>
            {product.minStock > 0 && (
              <div>
                <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: 0 }}>Min. stanje</p>
                <p style={{ fontSize: "2rem", fontWeight: 700, margin: 0, color: "var(--text-3)", lineHeight: 1 }}>
                  {product.minStock}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "0.82rem", color: "var(--red)" }}>
          {error}
        </div>
      )}

      {product.customFieldDefinitions?.length > 0 && (
        <section className="glass" style={{ padding: "1.25rem 1.5rem" }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 0.875rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("product.customDetails")}
          </h2>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.875rem", margin: 0 }}>
            {product.customFieldDefinitions.map((field) => {
              const value = product.customFieldValues?.[field.key];
              return (
                <div key={field.key}>
                  <dt style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>{field.labels?.[locale] ?? field.label}</dt>
                  <dd style={{ fontSize: "0.9rem", color: "var(--text-1)", margin: "3px 0 0", overflowWrap: "anywhere" }}>
                    {value === undefined || value === "" ? "—" : typeof value === "boolean" ? value ? t("yes") : t("no") : field.type === "select" ? getLocalizedOptionValue(field, String(value), locale) : String(value)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      )}

      {/* Variants */}
      <div>
        <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Varijante
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {variants.map((variant) => (
            <div
              key={variant.id}
              className="glass"
              style={{ padding: "1rem 1.25rem" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 120 }}>
                  <p style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-1)", margin: 0 }}>{variant.label}</p>
                  {variant.sku && <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: "2px 0 0" }}>{variant.sku}</p>}
                </div>

                {/* Quantity */}
                <span style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-1)", minWidth: 48, textAlign: "right" }}>
                  {variant.quantity}
                </span>

                {/* Controls */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    onClick={() => handleAdjust(variant.id, -1)}
                    disabled={adjusting === variant.id || variant.quantity <= 0}
                    style={{
                      width: 32, height: 32,
                      background: "var(--red-dim)",
                      border: "1px solid rgba(239,68,68,0.15)",
                      borderRadius: 8,
                      color: "var(--red)",
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                      opacity: adjusting === variant.id || variant.quantity <= 0 ? 0.4 : 1,
                    }}
                  >
                    <Minus size={14} />
                  </button>

                  <input
                    type="number"
                    min="1"
                    placeholder="n"
                    value={customDelta[variant.id] ?? ""}
                    onChange={(e) => setCustomDelta((p) => ({ ...p, [variant.id]: e.target.value }))}
                    style={{
                      width: 56,
                      background: "var(--bg-3)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "0.35rem 0.5rem",
                      textAlign: "center",
                      fontSize: "0.85rem",
                      color: "var(--text-1)",
                      outline: "none",
                    }}
                  />

                  <button
                    onClick={() => handleAdjust(variant.id, 1)}
                    disabled={adjusting === variant.id}
                    style={{
                      width: 32, height: 32,
                      background: "var(--green-dim)",
                      border: "1px solid rgba(34,197,94,0.15)",
                      borderRadius: 8,
                      color: "var(--green)",
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                      opacity: adjusting === variant.id ? 0.4 : 1,
                    }}
                  >
                    <Plus size={14} />
                  </button>

                  {customDelta[variant.id] && (
                    <>
                      <button
                        onClick={() => handleCustomAdjust(variant.id, false)}
                        disabled={adjusting === variant.id}
                        style={{
                          padding: "0.3rem 0.6rem",
                          background: "var(--red-dim)",
                          border: "1px solid rgba(239,68,68,0.2)",
                          borderRadius: 7,
                          fontSize: "0.78rem",
                          color: "var(--red)",
                          cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 3,
                        }}
                      >
                        <TrendingDown size={12} /> −n
                      </button>
                      <button
                        onClick={() => handleCustomAdjust(variant.id, true)}
                        disabled={adjusting === variant.id}
                        style={{
                          padding: "0.3rem 0.6rem",
                          background: "var(--green-dim)",
                          border: "1px solid rgba(34,197,94,0.2)",
                          borderRadius: 7,
                          fontSize: "0.78rem",
                          color: "var(--green)",
                          cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 3,
                        }}
                      >
                        <TrendingUp size={12} /> +n
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* History */}
      {events.length > 0 && (
        <div>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-2)", margin: "0 0 0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={14} /> Historija promjena
          </h2>
          <div className="glass" style={{ overflow: "hidden" }}>
            {events.map((event, i) => (
              <div
                key={event.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.875rem 1.25rem",
                  borderBottom: i < events.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <div>
                  <p style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-1)", margin: 0 }}>{event.variantLabel}</p>
                  <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: "2px 0 0" }}>
                    {event.actorName} · {event.createdAt ? event.createdAt.toLocaleString("sr-RS") : "—"}
                  </p>
                </div>
                <span
                  className="badge"
                  style={{
                    background: event.delta > 0 ? "var(--green-dim)" : "var(--red-dim)",
                    color: event.delta > 0 ? "var(--green)" : "var(--red)",
                    border: `1px solid ${event.delta > 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    letterSpacing: 0,
                  }}
                >
                  {event.delta > 0 ? "+" : ""}{event.delta}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

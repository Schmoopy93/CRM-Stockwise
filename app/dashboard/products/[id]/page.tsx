"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { getLocalizedOptionValue } from "@/lib/product-field-options";
import { useProduct, useVariants, useStockEvents } from "@/lib/hooks";
import { usePagination } from "@/lib/use-pagination";
import ListPagination from "@/components/ListPagination";
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

  const pagingLabels = {
    loadMore: t("paging.loadMore"),
    loading: t("paging.loading"),
    showing: t("paging.showing"),
    of: t("paging.of"),
    page: t("paging.page"),
    prev: t("paging.prev"),
    next: t("paging.next"),
  };

  const historyPaging = usePagination(events, [events.length, id], 10);
  const variantsPaging = usePagination(variants, [variants.length, id], 8);

  async function handleAdjust(variantId: string, delta: number) {
    if (!profile) return;
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) return;
    if (Math.abs(delta) >= 10 && !confirm(t("product.confirmLarge", { delta: `${delta > 0 ? "+" : ""}${delta}` }))) return;
    setAdjusting(variantId);
    setError("");
    try {
      await adjustStock(profile.shopId, id, variant, delta, profile.uid, profile.displayName);
    } catch (e: unknown) {
      setError(translateError(e, t, "stock.insufficient"));
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
    if (!profile || !confirm(t("product.deleteConfirm"))) return;
    setDeleting(true);
    try {
      await deleteProduct(profile.shopId, id);
      router.replace("/dashboard");
    } catch (e: unknown) {
      setError(translateError(e, t, "product.deleteError"));
      setDeleting(false);
    }
  }

  const fmtLocale = INTL_LOCALES[locale];

  if (loading) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>;

  if (!product) return (
    <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-2)" }}>
      {t("product.notFound")}{" "}
      <Link href="/dashboard" style={{ color: "var(--accent-2)" }}>{t("back")}</Link>
    </div>
  );

  const isLow = product.minStock > 0 && product.totalQuantity <= product.minStock;

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 720 }}>

      {/* Breadcrumb + actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <Link href="/dashboard/products" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "var(--text-2)", textDecoration: "none" }}>
          <ArrowLeft size={14} /> {t("back")}
        </Link>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link
            href={`/dashboard/products/${id}/edit`}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "0.45rem 0.875rem", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, fontSize: "0.8rem", color: "var(--text-2)", textDecoration: "none", transition: "all 0.15s" }}
          >
            <Pencil size={13} /> {t("product.edit")}
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "0.45rem 0.875rem", background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: "0.8rem", color: "var(--red)", cursor: "pointer", transition: "all 0.15s" }}
          >
            <Trash2 size={13} /> {t("delete")}
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="glass" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
          {product.imageUrl ? (
            <Image src={product.imageUrl} alt={product.name} width={72} height={72} style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <Image src="/android-chrome-512x512.png" alt="" aria-hidden="true" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "var(--text-1)", wordBreak: "break-word" }}>{product.name}</h1>
            {product.sku && <p style={{ fontSize: "0.78rem", color: "var(--text-3)", margin: "3px 0 0", fontFamily: "monospace" }}>SKU: {product.sku}</p>}
            {product.category && (
              <span className="badge" style={{ marginTop: 8, background: "var(--accent-glow)", color: "var(--accent-2)", border: "1px solid rgba(99,102,241,0.2)" }}>
                {product.category}
              </span>
            )}
          </div>
        </div>

        {/* Stock numbers */}
        <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
          <div>
            <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{t("product.totalStock")}</p>
            <p style={{ fontSize: "2rem", fontWeight: 800, margin: "2px 0 0", color: isLow ? "var(--amber)" : "var(--text-1)", lineHeight: 1, letterSpacing: "-0.02em" }}>
              {product.totalQuantity}
            </p>
          </div>
          {product.minStock > 0 && (
            <div>
              <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{t("product.minStockLabel")}</p>
              <p style={{ fontSize: "2rem", fontWeight: 800, margin: "2px 0 0", color: "var(--text-3)", lineHeight: 1, letterSpacing: "-0.02em" }}>
                {product.minStock}
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "0.82rem", color: "var(--red)" }}>
          {error}
        </div>
      )}

      {/* Pricing */}
      {(product.costPrice !== undefined || product.salePrice !== undefined || product.supplier?.name) && (
        <section className="glass" style={{ padding: "1.1rem 1.25rem" }}>
          <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", margin: "0 0 0.75rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            {t("product.pricingSupplier")}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.875rem" }}>
            {product.costPrice !== undefined && (
              <div>
                <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: 0 }}>{t("product.costPrice")}</p>
                <p style={{ fontSize: "1.1rem", fontWeight: 700, margin: "3px 0 0", color: "var(--text-1)" }}>
                  {product.costPrice.toLocaleString(fmtLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
                {product.salePrice !== undefined && product.costPrice > 0 && (
                  <p style={{ fontSize: "0.7rem", color: "var(--green)", margin: "2px 0 0" }}>
                    {t("product.margin")}: {(((product.salePrice - product.costPrice) / product.costPrice) * 100).toFixed(0)}%
                  </p>
                )}
              </div>
            )}
            {product.salePrice !== undefined && (
              <div>
                <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: 0 }}>{t("product.salePrice")}</p>
                <p style={{ fontSize: "1.1rem", fontWeight: 700, margin: "3px 0 0", color: "var(--text-1)" }}>
                  {product.salePrice.toLocaleString(fmtLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
              </div>
            )}
            {product.costPrice !== undefined && (
              <div>
                <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: 0 }}>{t("product.stockValue")}</p>
                <p style={{ fontSize: "1.1rem", fontWeight: 700, margin: "3px 0 0", color: "#a855f7" }}>
                  {(product.costPrice * product.totalQuantity).toLocaleString(fmtLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
              </div>
            )}
            {product.supplier?.name && (
              <div>
                <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: 0 }}>{t("product.supplier")}</p>
                <p style={{ fontSize: "0.9rem", fontWeight: 600, margin: "3px 0 0", color: "var(--text-1)" }}>{product.supplier.name}</p>
                {product.supplier.contact && <p style={{ fontSize: "0.75rem", color: "var(--accent-2)", margin: "2px 0 0" }}>{product.supplier.contact}</p>}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Custom fields */}
      {product.customFieldDefinitions?.length > 0 && (
        <section className="glass" style={{ padding: "1.1rem 1.25rem" }}>
          <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", margin: "0 0 0.75rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            {t("product.customDetails")}
          </p>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", margin: 0 }}>
            {product.customFieldDefinitions.map((field) => {
              const value = product.customFieldValues?.[field.key];
              return (
                <div key={field.key}>
                  <dt style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>{field.labels?.[locale] ?? field.label}</dt>
                  <dd style={{ fontSize: "0.875rem", color: "var(--text-1)", margin: "3px 0 0", overflowWrap: "anywhere" }}>
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
        <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", margin: "0 0 0.625rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {t("product.variants")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {variantsPaging.visible.map((variant) => (
            <div key={variant.id} className="glass" style={{ padding: "1rem 1.1rem" }}>
              {/* Top: name + qty */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-1)", margin: 0 }}>{variant.label}</p>
                  {variant.sku && <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: "2px 0 0", fontFamily: "monospace" }}>{variant.sku}</p>}
                </div>
                <span style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-1)", lineHeight: 1, letterSpacing: "-0.02em", flexShrink: 0 }}>
                  {variant.quantity}
                </span>
              </div>

              {/* Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  onClick={() => handleAdjust(variant.id, -1)}
                  disabled={adjusting === variant.id || variant.quantity <= 0}
                  aria-label="-1"
                  style={{ width: 36, height: 36, background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 9, color: "var(--red)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: adjusting === variant.id || variant.quantity <= 0 ? 0.4 : 1 }}
                >
                  <Minus size={15} />
                </button>

                <input
                  type="number"
                  min="1"
                  placeholder="n"
                  value={customDelta[variant.id] ?? ""}
                  onChange={(e) => setCustomDelta((p) => ({ ...p, [variant.id]: e.target.value }))}
                  style={{ width: 60, background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 9, padding: "0.4rem 0.5rem", textAlign: "center", fontSize: "0.875rem", color: "var(--text-1)", outline: "none" }}
                />

                <button
                  onClick={() => handleAdjust(variant.id, 1)}
                  disabled={adjusting === variant.id}
                  aria-label="+1"
                  style={{ width: 36, height: 36, background: "var(--green-dim)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 9, color: "var(--green)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: adjusting === variant.id ? 0.4 : 1 }}
                >
                  <Plus size={15} />
                </button>

                {customDelta[variant.id] && (
                  <>
                    <button
                      onClick={() => handleCustomAdjust(variant.id, false)}
                      disabled={adjusting === variant.id}
                      style={{ height: 36, padding: "0 0.75rem", background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 9, fontSize: "0.8rem", color: "var(--red)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
                    >
                      <TrendingDown size={13} /> −n
                    </button>
                    <button
                      onClick={() => handleCustomAdjust(variant.id, true)}
                      disabled={adjusting === variant.id}
                      style={{ height: 36, padding: "0 0.75rem", background: "var(--green-dim)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 9, fontSize: "0.8rem", color: "var(--green)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
                    >
                      <TrendingUp size={13} /> +n
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <ListPagination
          page={variantsPaging.page}
          totalPages={variantsPaging.totalPages}
          totalItems={variantsPaging.totalItems}
          shown={variantsPaging.visible.length}
          hasMore={variantsPaging.hasMore}
          onLoadMore={variantsPaging.loadMore}
          onGoToPage={variantsPaging.goToPage}
          labels={pagingLabels}
        />
      </div>

      {/* History */}
      {events.length > 0 && (
        <div>
          <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", margin: "0 0 0.625rem", textTransform: "uppercase", letterSpacing: "0.07em", display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={13} /> {t("product.history")}
          </p>
          <div className="glass" style={{ overflow: "hidden" }}>
            {historyPaging.visible.map((event, i) => (
              <div
                key={event.id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", padding: "0.75rem 1.1rem", borderBottom: i < historyPaging.visible.length - 1 ? "1px solid var(--border)" : "none" }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.variantLabel}</p>
                  <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: "2px 0 0" }}>
                    {event.actorName} · {event.createdAt ? event.createdAt.toLocaleString(fmtLocale) : "—"}
                  </p>
                </div>
                <span
                  className="badge"
                  style={{
                    background: event.delta > 0 ? "var(--green-dim)" : "var(--red-dim)",
                    color: event.delta > 0 ? "var(--green)" : "var(--red)",
                    border: `1px solid ${event.delta > 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                    fontSize: "0.82rem", fontWeight: 700, letterSpacing: 0, flexShrink: 0,
                  }}
                >
                  {event.delta > 0 ? "+" : ""}{event.delta}
                </span>
              </div>
            ))}
          </div>
          <ListPagination
            page={historyPaging.page}
            totalPages={historyPaging.totalPages}
            totalItems={historyPaging.totalItems}
            shown={historyPaging.visible.length}
            hasMore={historyPaging.hasMore}
            onLoadMore={historyPaging.loadMore}
            onGoToPage={historyPaging.goToPage}
            labels={pagingLabels}
          />
        </div>
      )}
    </div>
  );
}

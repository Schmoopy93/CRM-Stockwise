"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { getLocalizedOptionValue } from "@/lib/product-field-options";
import { useProduct, useVariants, useStockEvents, useShopMoney } from "@/lib/hooks";
import { usePagination } from "@/lib/use-pagination";
import ListPagination from "@/components/ListPagination";
import { adjustStock, deleteProduct } from "@/lib/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ArrowLeft, Pencil, Trash2, Minus, Plus, Clock, TrendingUp, TrendingDown } from "lucide-react";
import styles from "./product-detail.module.css";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const { product, loading } = useProduct(profile?.shopId, id);
  const variants = useVariants(profile?.shopId, id);
  const events = useStockEvents(profile?.shopId, id);
  const { money } = useShopMoney(profile?.shopId, INTL_LOCALES[locale]);

  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [customDelta, setCustomDelta] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    | { type: "delete" }
    | { type: "stock"; variantId: string; delta: number }
    | null
  >(null);

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

  async function requestAdjust(variantId: string, delta: number) {
    if (Math.abs(delta) >= 10) {
      setConfirmAction({ type: "stock", variantId, delta });
      return;
    }
    await handleAdjust(variantId, delta);
  }

  async function handleCustomAdjust(variantId: string, positive: boolean) {
    const val = parseInt(customDelta[variantId] ?? "0", 10);
    if (!val || isNaN(val)) return;
    await requestAdjust(variantId, positive ? val : -val);
    setCustomDelta((p) => ({ ...p, [variantId]: "" }));
  }

  async function handleDelete() {
    if (!profile) return;
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

  if (loading) return <div className={styles.loading}><div className="spinner" /></div>;

  if (!product) return (
    <div className={styles.missing}>
      <p>{t("product.notFound")}</p>
      <Link href="/dashboard" className="pform-back">
        <ArrowLeft size={14} /> {t("back")}
      </Link>
    </div>
  );

  const isLow = product.minStock > 0 && product.totalQuantity <= product.minStock;

  return (
    <div className={`fade-up ${styles.page}`}>
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.type === "delete" ? t("product.deleteConfirmTitle") : t("product.confirmLargeTitle")}
        description={
          confirmAction?.type === "delete"
            ? t("product.deleteConfirm")
            : t("product.confirmLarge", { delta: `${confirmAction && confirmAction.delta > 0 ? "+" : ""}${confirmAction?.delta ?? 0}` })
        }
        confirmText={confirmAction?.type === "delete" ? t("delete") : t("confirm")}
        cancelText={t("cancel")}
        destructive={confirmAction?.type === "delete"}
        onConfirm={async () => {
          if (!confirmAction) return;
          setConfirmAction(null);
          if (confirmAction.type === "delete") {
            await handleDelete();
            return;
          }
          await handleAdjust(confirmAction.variantId, confirmAction.delta);
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <div className={styles.topBar}>
        <Link href="/dashboard/products" className="pform-back">
          <ArrowLeft size={14} /> {t("back")}
        </Link>
        <div className={styles.topActions}>
          <Link href={`/dashboard/products/${id}/edit`} className="btn-secondary">
            <Pencil size={13} /> {t("product.edit")}
          </Link>
          <button className={styles.deleteBtn} onClick={() => setConfirmAction({ type: "delete" })} disabled={deleting}>
            <Trash2 size={13} /> {t("delete")}
          </button>
        </div>
      </div>

      <section className={`glass ${styles.hero}`}>
        <div className={styles.heroMain}>
          {product.imageUrl ? (
            <Image src={product.imageUrl} alt={product.name} width={72} height={72} className={styles.heroImage} />
          ) : (
            <Image src="/android-chrome-512x512.png" alt="" aria-hidden="true" width={72} height={72} className={styles.heroImage} />
          )}
          <div className={styles.heroBody}>
            <h1 className={styles.heroTitle}>{product.name}</h1>
            {product.sku && <p className={styles.heroSku}>SKU: {product.sku}</p>}
            {product.category && <span className={`badge ${styles.heroCategory}`}>{product.category}</span>}
          </div>
        </div>

        <div className={styles.stockRow}>
          <div>
            <p className={styles.stockLabel}>{t("product.totalStock")}</p>
            <p className={styles.stockValue} data-low={isLow ? "" : undefined}>{product.totalQuantity}</p>
          </div>
          {product.minStock > 0 && (
            <div>
              <p className={styles.stockLabel}>{t("product.minStockLabel")}</p>
              <p className={styles.stockValue} data-muted="">{product.minStock}</p>
            </div>
          )}
        </div>
      </section>

      {error && <div role="alert" className={styles.alert}>{error}</div>}

      {product.description && (
        <section className={`glass ${styles.section}`}>
          <h2 className={styles.sectionTitle}>{t("product.description")}</h2>
          <p className={styles.description}>{product.description}</p>
        </section>
      )}

      {(product.costPrice !== undefined || product.salePrice !== undefined || product.supplier?.name) && (
        <section className={`glass ${styles.section}`}>
          <h2 className={styles.sectionTitle}>{t("product.pricingSupplier")}</h2>
          <div className={styles.factGrid}>
            {product.costPrice !== undefined && (
              <div>
                <p className={styles.factLabel}>{t("product.costPrice")}</p>
                <p className={styles.factValue}>{money(product.costPrice)}</p>
                {product.salePrice !== undefined && product.costPrice > 0 && (
                  <p className={styles.factNote}>
                    {t("product.margin")}: {(((product.salePrice - product.costPrice) / product.costPrice) * 100).toFixed(0)}%
                  </p>
                )}
              </div>
            )}
            {product.salePrice !== undefined && (
              <div>
                <p className={styles.factLabel}>{t("product.salePrice")}</p>
                <p className={styles.factValue}>{money(product.salePrice)}</p>
              </div>
            )}
            {product.costPrice !== undefined && (
              <div>
                <p className={styles.factLabel}>{t("product.stockValue")}</p>
                <p className={styles.factValue} data-tone="violet">{money(product.costPrice * product.totalQuantity)}</p>
              </div>
            )}
            {product.supplier?.name && (
              <div>
                <p className={styles.factLabel}>{t("product.supplier")}</p>
                <p className={styles.factValue} data-size="sm">{product.supplier.name}</p>
                {product.supplier.contact && <p className={styles.factLink}>{product.supplier.contact}</p>}
              </div>
            )}
          </div>
        </section>
      )}

      {product.customFieldDefinitions?.length > 0 && (
        <section className={`glass ${styles.section}`}>
          <h2 className={styles.sectionTitle}>{t("product.customDetails")}</h2>
          <dl className={styles.defList}>
            {product.customFieldDefinitions.map((field) => {
              const value = product.customFieldValues?.[field.key];
              return (
                <div key={field.key}>
                  <dt className={styles.defLabel}>{field.labels?.[locale] ?? field.label}</dt>
                  <dd className={styles.defValue}>
                    {value === undefined || value === "" ? "—" : typeof value === "boolean" ? value ? t("yes") : t("no") : field.type === "select" ? getLocalizedOptionValue(field, String(value), locale) : String(value)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      )}

      <section>
        <h2 className={styles.sectionTitle}>{t("product.variants")}</h2>
        <div className={styles.variantList}>
          {variantsPaging.visible.map((variant) => (
            <div key={variant.id} className={`glass ${styles.variantCard}`}>
              <div className={styles.variantTop}>
                <div className={styles.variantMain}>
                  <p className={styles.variantName}>{variant.label}</p>
                  {variant.sku && <p className={styles.variantSku}>{variant.sku}</p>}
                </div>
                <span className={styles.variantQty}>{variant.quantity}</span>
              </div>

              <div className={styles.controls}>
                <button
                  onClick={() => requestAdjust(variant.id, -1)}
                  disabled={adjusting === variant.id || variant.quantity <= 0}
                  aria-label="-1"
                  className={styles.stepBtn}
                  data-kind="minus"
                >
                  <Minus size={15} />
                </button>

                <input
                  type="number"
                  min="1"
                  placeholder="n"
                  aria-label={t("sales.quantity")}
                  value={customDelta[variant.id] ?? ""}
                  onChange={(e) => setCustomDelta((p) => ({ ...p, [variant.id]: e.target.value }))}
                  className={styles.qtyInput}
                />

                <button
                  onClick={() => requestAdjust(variant.id, 1)}
                  disabled={adjusting === variant.id}
                  aria-label="+1"
                  className={styles.stepBtn}
                  data-kind="plus"
                >
                  <Plus size={15} />
                </button>

                {customDelta[variant.id] && (
                  <>
                    <button
                      onClick={() => handleCustomAdjust(variant.id, false)}
                      disabled={adjusting === variant.id}
                      className={styles.applyBtn}
                      data-kind="minus"
                    >
                      <TrendingDown size={13} /> −n
                    </button>
                    <button
                      onClick={() => handleCustomAdjust(variant.id, true)}
                      disabled={adjusting === variant.id}
                      className={styles.applyBtn}
                      data-kind="plus"
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
      </section>

      {events.length > 0 && (
        <section>
          <h2 className={styles.sectionTitle}>
            <Clock size={13} /> {t("product.history")}
          </h2>
          <div className={`glass ${styles.historyCard}`}>
            {historyPaging.visible.map((event) => (
              <div key={event.id} className={styles.historyRow}>
                <div className={styles.historyMain}>
                  <p className={styles.historyLabel}>{event.variantLabel}</p>
                  <p className={styles.historyMeta}>
                    {event.actorName} · {event.createdAt ? event.createdAt.toLocaleString(fmtLocale) : "—"}
                  </p>
                </div>
                <span className={`badge ${styles.delta}`} data-kind={event.delta > 0 ? "in" : "out"}>
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
        </section>
      )}
    </div>
  );
}

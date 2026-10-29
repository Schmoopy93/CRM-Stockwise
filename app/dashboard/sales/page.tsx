"use client";

import { useState, lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth-context";
import { useProducts, useSales, useShopMoney } from "@/lib/hooks";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { findProductByCode, PartialReceiptError, recordSale, stornoSale, linkSaleToCustomer } from "@/lib/actions";
import CustomerPicker from "@/components/CustomerPicker";
import Select from "@/components/Select";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Product, ProductVariant, Sale, SaleChannel } from "@/lib/types";
import { BASE_CURRENCY } from "@/lib/currency";
import { AlertCircle, AtSign, Barcode, CheckCircle, History, Minus, Plus, Search, ShoppingBag, Trash2, Undo2, UserRound, X } from "lucide-react";
import styles from "./sales.module.css";

const BarcodeScanner = lazy(() =>
  import("@/components/BarcodeScanner").then((m) => ({ default: m.BarcodeScanner }))
);

const CHANNELS: SaleChannel[] = ["instagram", "facebook", "store", "phone", "other"];

interface SaleEntry { product: Product; variants: ProductVariant[]; variantId: string; quantity: number; unitPrice: string; }

export default function SalesPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const intlLocale = INTL_LOCALES[locale];
  const { products } = useProducts(profile?.shopId);
  const { sales, loading: salesLoading, hasMore, loadMore } = useSales(profile?.shopId);
  // Sales are recorded in the base currency — what was actually charged — and
  // only the display converts, so a rate change never rewrites past revenue.
  const { money, currency } = useShopMoney(profile?.shopId, intlLocale);
  const [lines, setLines] = useState<SaleEntry[]>([]);
  const [search, setSearch] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<SaleChannel>("instagram");
  const [buyerName, setBuyerName] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [note, setNote] = useState("");
  const [stornoId, setStornoId] = useState("");
  const [stornoBusy, setStornoBusy] = useState(false);
  const [stornoRestored, setStornoRestored] = useState<{ saleId: string; keys: string[] } | null>(null);

  const stornoedIds = new Set(sales.flatMap((sale) => (sale.stornoOf ? [sale.stornoOf] : [])));

  async function handleStorno(sale: Sale) {
    if (!profile || stornoBusy) return;
    setStornoBusy(true);
    setError("");
    try {
      const skip = stornoRestored?.saleId === sale.id ? stornoRestored.keys : [];
      await stornoSale(profile.shopId, sale, profile.uid, profile.displayName, skip);
      setStornoId("");
      setStornoRestored(null);
    } catch (cause) {
      if (cause instanceof PartialReceiptError) {
        setStornoRestored({ saleId: sale.id, keys: cause.completedLineKeys });
        setError(t("sales.stornoPartial", { n: cause.completedLineKeys.length }));
      } else {
        setError(translateError(cause, t, "sales.stornoFailure"));
      }
    } finally {
      setStornoBusy(false);
    }
  }

  const filtered = search.length > 1
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
    : [];

  const total = lines.reduce((sum, line) => sum + line.quantity * (parseFloat(line.unitPrice.replace(",", ".")) || 0), 0);

  async function addLine(product: Product, preferredVariantId?: string) {
    if (!profile) return;
    setError("");
    try {
      const existingLines = lines.filter((line) => line.product.id === product.id);
      let variants = existingLines[0]?.variants;
      if (!variants) {
        setLoadingVariants(true);
        const snap = await getDocs(collection(db, "shops", profile.shopId, "products", product.id, "variants"));
        variants = snap.docs.map((d) => ({
          id: d.id,
          label: d.data().label ?? "",
          sku: d.data().sku ?? "",
          quantity: d.data().quantity ?? 0,
        }));
      }
      if (variants.length === 0) {
        setError(t("receive.noVariants"));
        return;
      }
      const usedVariantIds = new Set(existingLines.map((line) => line.variantId));
      const selectedVariant = variants.find((variant) => variant.id === preferredVariantId && !usedVariantIds.has(variant.id))
        ?? variants.find((variant) => !usedVariantIds.has(variant.id) && variant.quantity > 0)
        ?? variants.find((variant) => !usedVariantIds.has(variant.id));
      if (!selectedVariant) {
        setError(t("receive.allVariantsAdded"));
        return;
      }
      setLines((prev) => [...prev, {
        product,
        variants,
        variantId: selectedVariant.id,
        quantity: 1,
        unitPrice: product.salePrice !== undefined ? String(product.salePrice) : "",
      }]);
    } catch {
      setError(t("receive.loadVariantsError"));
    } finally {
      setLoadingVariants(false);
    }
    setSearch("");
  }

  async function handleScan(code: string) {
    setShowScanner(false);
    if (!profile) return;
    try {
      const match = await findProductByCode(profile.shopId, products, code);
      if (match) {
        await addLine(match.product, match.variantId);
        return;
      }
      setError(t("receive.notFound", { code }));
      setTimeout(() => setError(""), 4000);
    } catch {
      setError(t("receive.loadVariantsError"));
    }
  }

  function updateQty(idx: number, delta: number) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l));
  }

  async function handleConfirm() {
    if (!profile || lines.length === 0) return;
    const unitPrices = lines.map((line) => {
      const price = parseFloat(line.unitPrice.replace(",", "."));
      return Number.isFinite(price) ? price : -1;
    });
    if (unitPrices.some((price) => price < 0)) {
      setError(t("sales.invalidPrice"));
      return;
    }
    setSaving(true); setError("");
    try {
      await recordSale(
        profile.shopId,
        lines.map((line, idx) => ({
          productId: line.product.id,
          productName: line.product.name,
          variantId: line.variantId,
          variantLabel: line.variants.find((v) => v.id === line.variantId)?.label ?? "",
          quantity: line.quantity,
          unitPrice: unitPrices[idx],
        })),
        { channel, buyerName, buyerContact, customerId, note },
        profile.uid,
        profile.displayName
      );
      setDone(true); setLines([]); setBuyerName(""); setBuyerContact(""); setCustomerId(""); setNote("");
    } catch (cause) {
      if (cause instanceof PartialReceiptError) {
        const completed = new Set(cause.completedLineKeys);
        setLines((current) => current.filter((line) => !completed.has(`${line.product.id}/${line.variantId}`)));
        setError(t("receive.partialFailure", { n: completed.size }));
      } else {
        setError(translateError(cause, t, "sales.atomicFailure"));
      }
    }
    finally { setSaving(false); }
  }

  if (done) return (
    <div className={`fade-up ${styles.success}`}>
      <div className={styles.successIcon}>
        <CheckCircle size={30} />
      </div>
      <h2 className={styles.successTitle}>{t("sales.success")}</h2>
      <p className={styles.successBody}>{t("sales.successNote")}</p>
      <button className="btn-primary" onClick={() => setDone(false)}>{t("sales.newSale")}</button>
    </div>
  );

  return (
    <main className={`fade-up ${styles.page}`}>
      <header className={styles.header}>
        <div className={styles.headMain}>
          <h1 className={styles.title}>{t("sales.title")}</h1>
          <p className={styles.subtitle}>{t("sales.subtitle")}</p>
        </div>
        <button type="button" className={styles.scanBtn} onClick={() => setShowScanner(true)}>
          <Barcode size={15} />
          {t("receive.scan")}
        </button>
      </header>

      {error && (
        <div role="alert" className={styles.alert}>
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      <div className={styles.layout}>
        <section className={`glass ${styles.composer}`} aria-label={t("sales.title")}>
          <div className={styles.searchWrap}>
            <Search size={16} className={styles.searchIcon} aria-hidden="true" />
            <input
              className={`input ${styles.searchInput}`}
              type="search"
              placeholder={t("sales.searchAdd")}
              aria-label={t("sales.searchAdd")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={loadingVariants || saving}
            />
            {loadingVariants ? (
              <span className={styles.searchBusy} aria-hidden="true" />
            ) : search ? (
              <button type="button" className={styles.searchClear} onClick={() => setSearch("")} aria-label={t("orders.clearSearch")}>
                <X size={15} />
              </button>
            ) : null}

            {filtered.length > 0 && (
              <ul className={styles.suggest} role="listbox" aria-label={t("sales.searchAdd")}>
                {filtered.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      className={styles.suggestRow}
                      onClick={() => void addLine(p)}
                      disabled={loadingVariants || saving}
                    >
                      <span>
                        <span className={styles.suggestName}>{p.name}</span>
                        <span className={styles.suggestMeta}>{p.sku || "—"}</span>
                      </span>
                      <span className={styles.suggestAdd} aria-hidden="true"><Plus size={14} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lines.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}><ShoppingBag size={20} /></span>
              <p className={styles.emptyTitle}>{t("sales.empty")}</p>
              <p className={styles.emptyBody}>{t("receive.empty")}</p>
            </div>
          ) : (
            <ul className={styles.lines}>
              {lines.map((line, idx) => {
                const unit = parseFloat(line.unitPrice.replace(",", "."));
                const lineTotal = Number.isFinite(unit) ? unit * line.quantity : null;
                return (
                  <li key={`${line.product.id}/${line.variantId}`} className={styles.line}>
                    <div className={styles.lineHead}>
                      <div className={styles.lineInfo}>
                        <p className={styles.lineName}>{line.product.name}</p>
                        <p className={styles.lineStock}>
                          {t("receive.currentStock")}: {line.product.totalQuantity}
                        </p>
                      </div>
                      <span className={styles.lineTotal} data-empty={lineTotal === null || undefined}>
                        {lineTotal === null ? "—" : money(lineTotal, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className={styles.lineFields}>
                      <Select
                        className={styles.variantSelect}
                        ariaLabel={t("receive.variant")}
                        value={line.variantId}
                        onChange={(next) => setLines((current) => current.map((item, i) => i === idx ? { ...item, variantId: next } : item))}
                        options={line.variants.map((variant) => ({
                          value: variant.id,
                          label: `${variant.label} · ${t("receive.variantStock", { qty: variant.quantity })}`,
                          disabled: lines.some((other, otherIndex) => otherIndex !== idx && other.product.id === line.product.id && other.variantId === variant.id),
                        }))}
                      />
                      <input
                        className={`input ${styles.priceInput}`}
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label={`${t("sales.unitPrice")} (${BASE_CURRENCY})`}
                        placeholder={`${t("catalog.price")} (${BASE_CURRENCY})`}
                        value={line.unitPrice}
                        onChange={(event) => setLines((current) => current.map((item, i) => i === idx ? { ...item, unitPrice: event.target.value } : item))}
                      />
                      <div className={styles.stepper}>
                        <button type="button" className={styles.stepBtn} onClick={() => updateQty(idx, -1)} aria-label={`${t("sales.quantity")} −`}>
                          <Minus size={13} />
                        </button>
                        <input
                          className={styles.stepInput}
                          type="number"
                          min="1"
                          step="1"
                          value={line.quantity}
                          aria-label={t("sales.quantity")}
                          onChange={(e) => setLines((p) => p.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } : l))}
                        />
                        <button type="button" className={styles.stepBtn} onClick={() => updateQty(idx, 1)} aria-label={`${t("sales.quantity")} +`}>
                          <Plus size={13} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => setLines((current) => current.filter((_, i) => i !== idx))}
                        aria-label={t("receive.removeLine")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {lines.length > 0 && (
            <div className={styles.checkout}>
              <h2 className={styles.sectionLabel}>
                <UserRound size={13} aria-hidden="true" />
                {t("sales.buyer")}
              </h2>
              <div className={styles.fields}>
                <Select
                  className={styles.control}
                  ariaLabel={t("sales.channel")}
                  value={channel}
                  onChange={(next) => setChannel(next as SaleChannel)}
                  options={CHANNELS.map((ch) => ({ value: ch, label: t(`sales.channel.${ch}`) }))}
                />
                <input
                  className={`input ${styles.control}`}
                  placeholder={t("sales.buyerNamePlaceholder")}
                  aria-label={t("sales.buyerNamePlaceholder")}
                  maxLength={100}
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  disabled={saving}
                />
                <div className={styles.contactWrap}>
                  {channel === "instagram" && <AtSign size={14} className={styles.contactIcon} aria-hidden="true" />}
                  <input
                    className={`input ${styles.control} ${styles.contactInput}`}
                    data-icon={channel === "instagram" || undefined}
                    placeholder={channel === "instagram" ? t("sales.instagramPlaceholder") : t("sales.buyerContact")}
                    aria-label={channel === "instagram" ? t("sales.instagramPlaceholder") : t("sales.buyerContact")}
                    maxLength={100}
                    value={buyerContact}
                    onChange={(e) => setBuyerContact(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className={styles.fieldNote}>
                  <input
                    className={`input ${styles.control} ${styles.noteInput}`}
                    placeholder={t("sales.notePlaceholder")}
                    aria-label={t("sales.notePlaceholder")}
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
              {/* Attribution is separate from the buyer fields above: those record
                  what was typed at the till, this records who the shop already knows
                  the person to be, which is what makes their history findable. */}
              {profile && (
                <div className={styles.linker}>
                  <CustomerPicker shopId={profile.shopId} value={customerId} onChange={setCustomerId} />
                </div>
              )}
              <div className={styles.confirmRow}>
                <div className={styles.summary}>
                  <p className={styles.summaryTotal}>{money(total, { minimumFractionDigits: 2 })}</p>
                  <p className={styles.summaryMeta}>
                    {t("sales.summary", { n: lines.length, qty: lines.reduce((s, l) => s + l.quantity, 0) })}
                  </p>
                  <p className={styles.summaryNote}>
                    {currency === BASE_CURRENCY ? t("sales.summaryNote") : t("sales.unitPriceBaseNote", { base: BASE_CURRENCY, currency })}
                  </p>
                </div>
                <button className={`btn-primary ${styles.confirmBtn}`} onClick={handleConfirm} disabled={saving}>
                  {saving ? <span className="spinner" aria-hidden="true" /> : <CheckCircle size={15} />}
                  {saving ? t("sales.confirming") : t("sales.confirm")}
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className={styles.history} aria-label={t("sales.history")}>
          <header className={styles.historyHead}>
            <span className={styles.historyIcon}><History size={15} /></span>
            <h2 className={styles.historyTitle}>{t("sales.history")}</h2>
            {!salesLoading && <span className={styles.countPill}>{sales.length}</span>}
          </header>

          <div className={styles.historyBody}>
            {salesLoading ? (
              <div className={styles.skeletons} aria-label={t("loading")} aria-busy="true">
                {[0, 1, 2].map((index) => <div key={index} className={styles.skeleton} />)}
              </div>
            ) : sales.length === 0 ? (
              <div className={styles.historyEmpty}>
                <span className={styles.emptyIcon}><History size={18} /></span>
                <p className={styles.emptyTitle}>{t("sales.historyEmpty")}</p>
              </div>
            ) : (
              <ul className={styles.saleList}>
                {sales.map((sale) => {
                  const isStorno = Boolean(sale.stornoOf);
                  const isStornoed = stornoedIds.has(sale.id);
                  const confirming = stornoId === sale.id;
                  return (
                    <li key={sale.id}>
                      <article className={`glass ${styles.saleCard}`} data-storno={isStorno || undefined}>
                        <div className={styles.saleTop}>
                          <div className={styles.saleMain}>
                            <p className={styles.saleLines}>
                              {isStorno && <span className={styles.stornoTab}>{t("sales.stornoBadge")}</span>}
                              {sale.lines.map((line) => `${line.productName} ×${line.quantity}`).join(", ")}
                            </p>
                            <p className={styles.saleMeta}>
                              <span className={styles.channelTag}>{t(`sales.channel.${sale.channel}`)}</span>
                              {sale.sourceOrderCode && (
                                <>
                                  <span className={styles.metaSep} aria-hidden="true">·</span>
                                  <span>{t("sales.catalogOrder", { code: sale.sourceOrderCode })}</span>
                                </>
                              )}
                              {sale.buyerName && (
                                <>
                                  <span className={styles.metaSep} aria-hidden="true">·</span>
                                  <span>{sale.buyerName}</span>
                                </>
                              )}
                              {sale.buyerContact && (
                                <>
                                  <span className={styles.metaSep} aria-hidden="true">·</span>
                                  <span>{sale.channel === "instagram" ? `@${sale.buyerContact}` : sale.buyerContact}</span>
                                </>
                              )}
                              {sale.createdAt && (
                                <>
                                  <span className={styles.metaSep} aria-hidden="true">·</span>
                                  <time dateTime={sale.createdAt.toISOString()}>{sale.createdAt.toLocaleString(intlLocale)}</time>
                                </>
                              )}
                            </p>
                          </div>
                          <div className={styles.saleAmount}>
                            <span className={styles.saleTotal}>
                              {isStorno ? `−${money(sale.total, { minimumFractionDigits: 2 })}` : money(sale.total, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        <div className={styles.saleFoot}>
                          {profile && !sale.sourceOrderId && !isStorno && (
                            <div className={styles.linker}>
                              <CustomerPicker
                                shopId={profile.shopId}
                                value={sale.customerId ?? ""}
                                onChange={(cid) => void linkSaleToCustomer(profile.shopId, sale.id, cid || null)}
                              />
                            </div>
                          )}
                          {isStornoed && <p className={styles.voidNote}>{t("sales.stornoedBadge")}</p>}
                          {!isStorno && !isStornoed && (confirming ? (
                            <div className={styles.stornoPanel}>
                              <p className={styles.stornoQuestion}>{t("sales.stornoConfirm")}</p>
                              <button type="button" className={styles.stornoConfirm} onClick={() => void handleStorno(sale)} disabled={stornoBusy}>
                                {stornoBusy ? t("sales.stornoBusy") : t("sales.storno")}
                              </button>
                              <button type="button" className={styles.cancelBtn} onClick={() => { setStornoId(""); setStornoRestored(null); }} disabled={stornoBusy}>
                                {t("cancel")}
                              </button>
                            </div>
                          ) : (
                            <button type="button" className={styles.stornoBtn} onClick={() => { setStornoId(sale.id); setStornoRestored(null); setError(""); }}>
                              <Undo2 size={12} />
                              {t("sales.storno")}
                            </button>
                          ))}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}

            {hasMore && sales.length > 0 && (
              <div className="list-pagination">
                <p className="list-pagination-count">{t("paging.showing")} {sales.length}</p>
                <div className="list-pagination-actions">
                  <button type="button" className="list-pagination-more" onClick={loadMore}>{t("paging.loadMore")}</button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}
    </main>
  );
}

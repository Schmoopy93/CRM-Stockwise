"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { Check, Loader2, Minus, Package, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { INTL_LOCALES, Locale, translateError, useI18n } from "@/lib/i18n-context";
import { buildOrderMessage, CatalogChannels } from "@/lib/catalog-channels";
import type { PriceTools } from "@/lib/currency";
import { CatalogItem, CatalogStatEvent } from "@/lib/types";
import { placeCatalogOrder } from "@/lib/actions";
import { catalogLink, MAX_QUANTITY } from "./catalog-store";
import { itemImages } from "./catalog-card";
import OrderChannels, { availableChannels } from "./order-channels";

export interface ResolvedCartLine {
  item: CatalogItem;
  variant: string;
  variantId?: string;
  quantity: number;
}

export default function CatalogCart({ lines, locale, prices, shopId, channels, onQuantity, onClear, onOrderPlaced, onClose, onNotify, onTrack }: {
  lines: ResolvedCartLine[];
  locale: Locale;
  prices: PriceTools;
  shopId: string;
  channels: CatalogChannels;
  onQuantity: (itemId: string, variant: string, quantity: number, variantId?: string) => void;
  onClear: () => void;
  onOrderPlaced: () => void;
  onClose: () => void;
  onNotify: (message: string) => void;
  onTrack: (event: CatalogStatEvent) => void;
}) {
  const { t } = useI18n();
  const intl = INTL_LOCALES[locale];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [placing, setPlacing] = useState(false);
  const [placedCode, setPlacedCode] = useState("");
  const [placedMessage, setPlacedMessage] = useState("");
  const [placeError, setPlaceError] = useState("");
  const channelList = availableChannels(channels);
  const priced = lines.every((line) => line.item.salePrice !== undefined);
  const total = lines.reduce((sum, line) => sum + (line.item.salePrice ?? 0) * line.quantity, 0);
  const orderLines = lines.map((line) => ({
    name: line.item.name,
    variant: line.variant,
    quantity: line.quantity,
    unitPrice: line.item.salePrice === undefined ? undefined : prices.toCurrency(line.item.salePrice),
  }));
  const baseMessage = buildOrderMessage(orderLines, catalogLink(shopId, locale), intl, t, prices.currency);
  const message = placedMessage || baseMessage;

  async function place() {
    if (placing || !name.trim() || !email.trim() || !phone.trim() || !address.trim() || !city.trim() || !priced || lines.length === 0) return;
    setPlacing(true); setPlaceError("");
    try {
      // Sent in the currency the customer was quoted, and tagged with it, so the
      // shop reads back the same figure the customer agreed to.
      const code = await placeCatalogOrder(shopId, {
        lines: lines.map((line) => ({
          productId: line.item.id,
          ...(line.variantId ? { variantId: line.variantId } : {}),
          productName: line.item.name,
          variantLabel: line.variant,
          quantity: line.quantity,
          ...(line.item.salePrice !== undefined
            ? {
                unitPrice: prices.toCurrency(line.item.salePrice),
                baseUnitPrice: line.item.salePrice,
              }
            : {}),
        })),
        customerName: name,
        customerContact: phone,
        customerEmail: email,
        customerAddress: address,
        customerCity: city,
        note: "",
        channel: "catalog",
      }, prices.currency);
      setPlacedMessage([
        baseMessage,
        `${t("catalog.orderCodeLabel")}: ${code}`,
        `${t("catalog.orderName")}: ${name}`,
        `${t("catalog.orderEmail")}: ${email}`,
        `${t("catalog.orderPhone")}: ${phone}`,
        `${t("catalog.orderAddress")}: ${address}`,
        `${t("catalog.orderCity")}: ${city}`,
      ].join("\n"));
      setPlacedCode(code);
      onOrderPlaced();
      onNotify(t("catalog.orderSaved", { code }));
    } catch (cause) {
      setPlaceError(translateError(cause, t, "catalog.orderFailed"));
    } finally { setPlacing(false); }
  }

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="cat-overlay cat-drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label={t("catalog.cart")}>
      <aside className="cat-drawer">
        <header className="cat-drawer-head">
          <p className="cat-drawer-title">
            <ShoppingBag size={18} />
            {t("catalog.cart")}
            {lines.length > 0 && <span className="cat-drawer-badge">{lines.reduce((sum, line) => sum + line.quantity, 0)}</span>}
          </p>
          <button type="button" onClick={onClose} aria-label={t("catalog.close")} className="cat-modal-close cat-drawer-close">
            <X size={16} />
          </button>
        </header>

        {lines.length === 0 && !placedCode ? (
          <div className="cat-empty cat-cart-empty">
            <ShoppingBag size={30} strokeWidth={1.5} />
            {t("catalog.cartEmpty")}
          </div>
        ) : placedCode ? (
          <div className="cat-order-confirmation">
            <div className="cat-order-success-mark"><Check size={22} /></div>
            <p className="cat-order-success">{t("catalog.orderSaved", { code: placedCode })}</p>
            {channelList.length > 0 && (
              <>
                <p className="cat-modal-section">{t("catalog.cartSend")}</p>
                <OrderChannels channels={channels} message={message} onCopied={() => onNotify(t("catalog.messageCopied"))} onChannelClick={onTrack} />
                {channelList.some((channel) => channel !== "whatsapp") && <p className="cat-hint">{t("catalog.copyHint")}</p>}
              </>
            )}
            <button type="button" className="cat-drawer-clear" onClick={onClose}>
              {t("catalog.close")}
            </button>
          </div>
        ) : (
          <>
            <ul className="cat-drawer-list">
              {lines.map(({ item, variant, variantId, quantity }) => {
                const image = itemImages(item)[0];
                return (
                  <li key={`${item.id}-${variantId ?? variant}`} className="cat-line">
                    <div className="cat-line-media">
                      {image ? <Image src={image} alt="" fill sizes="64px" quality={90} style={{ objectFit: "contain" }} /> : <Package size={24} strokeWidth={1.4} aria-hidden="true" />}
                    </div>
                    <div className="cat-line-info">
                      <p className="cat-line-name">{item.name}</p>
                      {variant && <p className="cat-line-variant">{variant}</p>}
                      <div className="cat-line-row">
                        <div className="cat-stepper" data-size="sm" role="group" aria-label={t("catalog.quantity")}>
                          <button type="button" onClick={() => onQuantity(item.id, variant, quantity - 1, variantId)} aria-label={t("catalog.decrease")}><Minus size={13} /></button>
                          <span>{quantity}</span>
                          <button type="button" onClick={() => onQuantity(item.id, variant, quantity + 1, variantId)} disabled={quantity >= MAX_QUANTITY} aria-label={t("catalog.increase")}><Plus size={13} /></button>
                        </div>
                        {item.salePrice !== undefined && <span className="cat-line-price">{prices.money(item.salePrice * quantity)}</span>}
                      </div>
                    </div>
                    <button type="button" className="cat-line-remove" onClick={() => onQuantity(item.id, variant, 0, variantId)} aria-label={`${t("catalog.remove")} — ${item.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>

            <footer className="cat-drawer-foot">
              {priced && (
                <p className="cat-drawer-total">
                  <span>{t("catalog.total")}</span>
                  <strong>{prices.money(total)}</strong>
                </p>
              )}

              {!placedCode && (
                <form className="cat-order-form" onSubmit={(event) => { event.preventDefault(); void place(); }}>
                  <div className="cat-order-heading">
                    <span className="cat-order-heading-icon"><Package size={16} /></span>
                    <div>
                      <p className="cat-modal-section">{t("catalog.orderSection")}</p>
                      <p className="cat-order-intro">{t("catalog.orderHint")}</p>
                    </div>
                  </div>
                  <div className="cat-order-fields">
                    <label className="cat-order-field">
                      <span>{t("catalog.orderName")}</span>
                      <input
                        className="input cat-order-input" type="text" autoComplete="name"
                        placeholder={t("catalog.orderName")}
                        value={name} onChange={(e) => setName(e.target.value)} maxLength={100}
                        required
                      />
                    </label>
                    <label className="cat-order-field">
                      <span>{t("catalog.orderEmail")}</span>
                      <input
                        className="input cat-order-input" type="email" autoComplete="email"
                        placeholder={t("catalog.orderEmail")}
                        value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254}
                        required
                      />
                    </label>
                    <label className="cat-order-field">
                      <span>{t("catalog.orderPhone")}</span>
                      <input
                        className="input cat-order-input" type="tel" autoComplete="tel"
                        placeholder={t("catalog.orderPhone")}
                        value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={100}
                        required
                      />
                    </label>
                    <label className="cat-order-field">
                      <span>{t("catalog.orderCity")}</span>
                      <input
                        className="input cat-order-input" type="text" autoComplete="address-level2"
                        placeholder={t("catalog.orderCity")}
                        value={city} onChange={(e) => setCity(e.target.value)} maxLength={100}
                        required
                      />
                    </label>
                    <label className="cat-order-field cat-order-field-wide">
                      <span>{t("catalog.orderAddress")}</span>
                      <input
                        className="input cat-order-input" type="text" autoComplete="street-address"
                        placeholder={t("catalog.orderAddress")}
                        value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200}
                        required
                      />
                    </label>
                  </div>
                  <button
                    type="submit" className="btn-primary cat-order-button" disabled={placing || !name.trim() || !email.trim() || !phone.trim() || !address.trim() || !city.trim() || !priced}
                  >
                    {placing ? <Loader2 size={15} className="cat-spin" /> : <Check size={15} />}
                    {placing ? t("catalog.orderPlacing") : t("catalog.orderPlace")}
                  </button>
                  {!priced && <p className="cat-hint cat-order-note">{t("catalog.orderPriceRequired")}</p>}
                  {placeError && <p className="cat-order-error">{placeError}</p>}
                </form>
              )}

              {channelList.length > 0 && (
                <>
                  <p className="cat-modal-section">{t("catalog.cartSend")}</p>
                  <OrderChannels channels={channels} message={message} onCopied={() => onNotify(t("catalog.messageCopied"))} onChannelClick={onTrack} />
                  {channelList.some((channel) => channel !== "whatsapp") && <p className="cat-hint">{t("catalog.copyHint")}</p>}
                </>
              )}
              <button type="button" className="cat-drawer-clear" onClick={onClear}>
                <Trash2 size={13} />
                {t("catalog.cartClear")}
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>,
    document.body
  );
}

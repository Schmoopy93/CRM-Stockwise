"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Minus, Plus, Share2, ShoppingBag, X } from "lucide-react";
import { INTL_LOCALES, Locale, useI18n } from "@/lib/i18n-context";
import { buildOrderMessage, CatalogChannels } from "@/lib/catalog-channels";
import type { PriceTools } from "@/lib/currency";
import { CatalogItem, CatalogStatEvent } from "@/lib/types";
import { catalogLink, MAX_QUANTITY } from "./catalog-store";
import { fieldText, itemImages, saleDiscount } from "./catalog-card";
import OrderChannels, { availableChannels } from "./order-channels";

export default function CatalogDetail({ item, locale, prices, shopId, channels, onClose, onAdd, onNotify, onTrack }: {
  item: CatalogItem;
  locale: Locale;
  prices: PriceTools;
  shopId: string;
  channels: CatalogChannels;
  onClose: () => void;
  onAdd: (variant: string, quantity: number) => void;
  onNotify: (message: string) => void;
  onTrack: (event: CatalogStatEvent) => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [variant, setVariant] = useState(item.variants.length === 1 ? item.variants[0] : "");
  const [quantity, setQuantity] = useState(1);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const images = itemImages(item);
  const discount = saleDiscount(item);
  const intl = INTL_LOCALES[locale];
  const needsVariant = item.variants.length > 0 && !variant;
  const channelList = availableChannels(channels);
  const copiesMessage = channelList.some((channel) => channel !== "whatsapp");
  // The message quotes what the customer sees, so the price goes through the
  // same conversion as the card rather than the stored base amount.
  const message = buildOrderMessage(
    [{ name: item.name, variant, quantity, unitPrice: item.salePrice === undefined ? undefined : prices.toCurrency(item.salePrice) }],
    catalogLink(shopId, locale, item.id),
    intl,
    t,
    prices.currency
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") scrollTo(Math.max(0, index - 1));
      if (e.key === "ArrowRight") scrollTo(Math.min(images.length - 1, index + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, index, onClose]);

  function scrollTo(i: number) {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  async function share() {
    const url = catalogLink(shopId, locale, item.id);
    onTrack("share");
    if (typeof navigator.share === "function") {
      await navigator.share({ title: item.name, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url).then(() => onNotify(t("catalog.linkCopied")), () => undefined);
  }

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label={item.name}
      className="cat-overlay"
    >
      <div className="cat-modal">
        <button onClick={onClose} aria-label={t("catalog.close")} className="cat-modal-close">
          <X size={16} />
        </button>

        <div className="cat-modal-slider">
          <div
            ref={scrollerRef}
            className="cat-modal-swipe"
            onScroll={(e) => {
              const el = e.currentTarget;
              setIndex(Math.min(images.length - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
            }}
          >
            {images.length > 0 ? images.map((src, i) => (
              <div key={i} className="cat-modal-slide">
                <Image src={src} alt={`${item.name} — ${i + 1}`} fill sizes="(max-width: 760px) 100vw, 520px" quality={90} style={{ objectFit: "cover" }} loading={i === 0 ? "eager" : "lazy"} />
              </div>
            )) : (
              <div className="cat-modal-slide" aria-hidden="true"><Image src="/android-chrome-512x512.png" alt="" width={512} height={512} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
            )}
          </div>
          {images.length > 1 && (
            <>
              <span className="cat-modal-count">{index + 1}/{images.length}</span>
              {index > 0 && (
                <button onClick={() => scrollTo(index - 1)} aria-label={t("catalog.prevImage")} className="cat-modal-arrow" data-side="left"><ChevronLeft size={18} /></button>
              )}
              {index < images.length - 1 && (
                <button onClick={() => scrollTo(index + 1)} aria-label={t("catalog.nextImage")} className="cat-modal-arrow" data-side="right"><ChevronRight size={18} /></button>
              )}
              <div className="cat-modal-dots">
                {images.map((_, i) => (
                  <button key={i} onClick={() => scrollTo(i)} aria-label={t("catalog.imageOf", { n: i + 1, total: images.length })} className="cat-modal-dot" data-active={i === index || undefined} />
                ))}
              </div>
              <div className="cat-modal-thumbs">
                {images.map((src, i) => (
                  <button key={i} onClick={() => scrollTo(i)} aria-label={t("catalog.imageOf", { n: i + 1, total: images.length })} className="cat-modal-thumb" data-active={i === index || undefined}>
                    <Image src={src} alt="" fill sizes="56px" style={{ objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="cat-modal-body">
          <div className="cat-modal-top">
            {item.category ? <span className="cat-modal-eyebrow">{item.category}</span> : <span />}
            <button type="button" onClick={share} className="cat-modal-share">
              <Share2 size={14} />
              {t("catalog.share")}
            </button>
          </div>
          <h2 className="cat-modal-title">{item.name}</h2>
          {item.salePrice !== undefined && (
            <p className="cat-modal-price">
              {prices.money(item.salePrice)}
              {discount > 0 && item.compareAtPrice !== undefined && (
                <>
                  <s className="cat-modal-old">{prices.money(item.compareAtPrice)}</s>
                  <span className="cat-badge" data-kind="sale">-{discount}%</span>
                </>
              )}
            </p>
          )}

          {item.variants.length > 0 && (
            <div className="cat-modal-group">
              <p className="cat-modal-section">{needsVariant ? t("catalog.chooseVariant") : t("catalog.variants")}</p>
              <div className="cat-variant-list" role="radiogroup" aria-label={t("catalog.variants")}>
                {item.variants.map((label) => (
                  <button key={label} type="button" role="radio" aria-checked={variant === label}
                    className="cat-variant" data-active={variant === label || undefined} onClick={() => setVariant(label)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {item.fields.length > 0 && (
            <div className="cat-modal-group">
              <p className="cat-modal-section">{t("product.customDetails")}</p>
              <div className="cat-modal-fields">
                {item.fields.map((field, i) => {
                  const { label, value } = fieldText(field, locale, t);
                  return (
                    <div key={i} className="cat-modal-field">
                      <span>{label}</span>
                      <span>{value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="cat-modal-actions">
            <div className="cat-buy-row">
              <div className="cat-stepper" role="group" aria-label={t("catalog.quantity")}>
                <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label={t("catalog.decrease")}><Minus size={15} /></button>
                <span aria-live="polite">{quantity}</span>
                <button type="button" onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))} disabled={quantity >= MAX_QUANTITY} aria-label={t("catalog.increase")}><Plus size={15} /></button>
              </div>
              <button type="button" className="btn-primary cat-add-btn" disabled={needsVariant} onClick={() => { onAdd(variant, quantity); onClose(); }}>
                <ShoppingBag size={16} />
                {t("catalog.addToCart")}
              </button>
            </div>

            {channelList.length > 0 && (
              <>
                <p className="cat-modal-section" style={{ marginTop: "0.25rem" }}>{t("catalog.orderNow")}</p>
                <OrderChannels channels={channels} message={message} disabled={needsVariant} onCopied={() => onNotify(t("catalog.messageCopied"))} onChannelClick={onTrack} />
                {(needsVariant || copiesMessage) && (
                  <p className="cat-hint">{needsVariant ? t("catalog.chooseVariant") : t("catalog.copyHint")}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

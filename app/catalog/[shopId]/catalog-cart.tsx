"use client";

import { useEffect } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { INTL_LOCALES, Locale, useI18n } from "@/lib/i18n-context";
import { buildOrderMessage, CatalogChannels, formatCatalogPrice } from "@/lib/catalog-channels";
import { CatalogItem, CatalogStatEvent } from "@/lib/types";
import { catalogLink, MAX_QUANTITY } from "./catalog-store";
import { itemImages } from "./catalog-card";
import OrderChannels, { availableChannels } from "./order-channels";

export interface ResolvedCartLine {
  item: CatalogItem;
  variant: string;
  quantity: number;
}

export default function CatalogCart({ lines, locale, shopId, channels, onQuantity, onClear, onClose, onNotify, onTrack }: {
  lines: ResolvedCartLine[];
  locale: Locale;
  shopId: string;
  channels: CatalogChannels;
  onQuantity: (itemId: string, variant: string, quantity: number) => void;
  onClear: () => void;
  onClose: () => void;
  onNotify: (message: string) => void;
  onTrack: (event: CatalogStatEvent) => void;
}) {
  const { t } = useI18n();
  const intl = INTL_LOCALES[locale];
  const channelList = availableChannels(channels);
  const priced = lines.every((line) => line.item.salePrice !== undefined);
  const total = lines.reduce((sum, line) => sum + (line.item.salePrice ?? 0) * line.quantity, 0);
  const message = buildOrderMessage(
    lines.map((line) => ({ name: line.item.name, variant: line.variant, quantity: line.quantity, unitPrice: line.item.salePrice })),
    catalogLink(shopId, locale),
    intl,
    t
  );

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
          <button type="button" onClick={onClose} aria-label={t("catalog.close")} className="cat-modal-close" style={{ position: "static" }}>
            <X size={16} />
          </button>
        </header>

        {lines.length === 0 ? (
          <div className="cat-empty" style={{ margin: "1.25rem", flex: 1 }}>
            <ShoppingBag size={30} strokeWidth={1.5} />
            {t("catalog.cartEmpty")}
          </div>
        ) : (
          <>
            <ul className="cat-drawer-list">
              {lines.map(({ item, variant, quantity }) => {
                const image = itemImages(item)[0];
                return (
                  <li key={`${item.id}-${variant}`} className="cat-line">
                    <div className="cat-line-media">
                      {image ? <Image src={image} alt="" fill sizes="64px" quality={90} style={{ objectFit: "cover" }} /> : <Image src="/android-chrome-512x512.png" alt="" aria-hidden="true" width={64} height={64} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                    </div>
                    <div className="cat-line-info">
                      <p className="cat-line-name">{item.name}</p>
                      {variant && <p className="cat-line-variant">{variant}</p>}
                      <div className="cat-line-row">
                        <div className="cat-stepper" data-size="sm" role="group" aria-label={t("catalog.quantity")}>
                          <button type="button" onClick={() => onQuantity(item.id, variant, quantity - 1)} aria-label={t("catalog.decrease")}><Minus size={13} /></button>
                          <span>{quantity}</span>
                          <button type="button" onClick={() => onQuantity(item.id, variant, quantity + 1)} disabled={quantity >= MAX_QUANTITY} aria-label={t("catalog.increase")}><Plus size={13} /></button>
                        </div>
                        {item.salePrice !== undefined && <span className="cat-line-price">{formatCatalogPrice(item.salePrice * quantity, intl)}</span>}
                      </div>
                    </div>
                    <button type="button" className="cat-line-remove" onClick={() => onQuantity(item.id, variant, 0)} aria-label={`${t("catalog.remove")} — ${item.name}`}>
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
                  <strong>{formatCatalogPrice(total, intl)}</strong>
                </p>
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

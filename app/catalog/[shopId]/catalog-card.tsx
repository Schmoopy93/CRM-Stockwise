"use client";

import Image from "next/image";
import { Images, Package, Plus } from "lucide-react";
import { Locale, useI18n } from "@/lib/i18n-context";
import type { PriceTools } from "@/lib/currency";
import { CatalogField, CatalogItem } from "@/lib/types";

export function itemImages(item: CatalogItem) {
  return item.images.length > 0 ? item.images : item.imageUrl ? [item.imageUrl] : [];
}

export function saleDiscount(item: CatalogItem) {
  if (item.salePrice === undefined || item.compareAtPrice === undefined || item.compareAtPrice <= item.salePrice) return 0;
  return Math.max(1, Math.round((1 - item.salePrice / item.compareAtPrice) * 100));
}

export function fieldText(field: CatalogField, locale: Locale, t: (key: string) => string) {
  const label = field.labels?.[locale as never] || field.label;
  const value = typeof field.value === "boolean" ? t(field.value ? "yes" : "no") : field.values?.[locale] ?? String(field.value);
  return { label, value };
}

export default function CatalogCard({ item, locale, prices, index, onOpen, onQuickAdd }: {
  item: CatalogItem;
  locale: Locale;
  prices: PriceTools;
  index: number;
  onOpen: () => void;
  onQuickAdd: () => void;
}) {
  const { t } = useI18n();
  const images = itemImages(item);
  const discount = saleDiscount(item);

  return (
    <article className="cat-card" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
      <button type="button" className="cat-card-hit" onClick={onOpen} aria-label={item.name} />
      <div className="cat-card-media">
        {images[0] ? (
          <Image src={images[0]} alt={item.name} fill sizes="(max-width: 760px) 50vw, 240px" quality={90} style={{ objectFit: "contain" }} />
        ) : (
          <div className="cat-card-placeholder" aria-hidden="true"><Package size={40} strokeWidth={1.25} /></div>
        )}
        <div className="cat-card-shade" aria-hidden="true" />
        {item.category && <span className="cat-card-cat">{item.category}</span>}
        {(discount > 0 || item.isNew) && (
          <div className="cat-card-badges">
            {discount > 0 && <span className="cat-badge" data-kind="sale">-{discount}%</span>}
            {item.isNew && <span className="cat-badge" data-kind="new">{t("catalog.badgeNew")}</span>}
          </div>
        )}
        {images.length > 1 && (
          <span className="cat-card-count">
            <Images size={11} />
            {images.length}
          </span>
        )}
      </div>

      <div className="cat-card-body">
        <p className="cat-card-name">{item.name}</p>

        {item.fields.length > 0 && (
          <p className="cat-card-fields">
            {item.fields.slice(0, 2).map((field) => {
              const { label, value } = fieldText(field, locale, t);
              return `${label}: ${value}`;
            }).join(" · ")}
          </p>
        )}

        {item.variants.length > 0 && (
          <div className="cat-card-pills">
            {item.variants.slice(0, 4).map((variant) => (
              <span key={variant} className="cat-card-pill">{variant}</span>
            ))}
            {item.variants.length > 4 && <span className="cat-card-pill">+{item.variants.length - 4}</span>}
          </div>
        )}

        <div className="cat-card-foot">
          {item.salePrice !== undefined ? (
            <span className="cat-card-prices">
              <span className="cat-card-price" data-sale={discount > 0 || undefined}>{prices.money(item.salePrice)}</span>
              {discount > 0 && item.compareAtPrice !== undefined && (
                <s className="cat-card-old">{prices.money(item.compareAtPrice)}</s>
              )}
            </span>
          ) : <span />}
          <button type="button" className="cat-card-add" onClick={onQuickAdd} aria-label={`${t("catalog.addToCart")} — ${item.name}`}>
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </article>
  );
}

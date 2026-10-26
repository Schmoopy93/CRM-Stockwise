"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { useDialogFocus } from "./use-dialog-focus";

export interface CatalogFilterControlsProps {
  inStockOnly: boolean;
  onToggleStock: () => void;
  showPrice: boolean;
  currency: string;
  minPrice: string;
  maxPrice: string;
  onMinPrice: (value: string) => void;
  onMaxPrice: (value: string) => void;
}

export function CatalogFilterControls({
  inStockOnly,
  onToggleStock,
  showPrice,
  currency,
  minPrice,
  maxPrice,
  onMinPrice,
  onMaxPrice,
}: CatalogFilterControlsProps) {
  const { t } = useI18n();

  return (
    <div className="cat-filter-controls">
      <button
        type="button"
        className="cat-stock-toggle"
        data-active={inStockOnly || undefined}
        aria-pressed={inStockOnly}
        onClick={onToggleStock}
      >
        <span className="cat-stock-check" aria-hidden="true">
          {inStockOnly && <Check size={12} strokeWidth={3} />}
        </span>
        {t("catalog.onlyAvailable")}
      </button>

      {showPrice && (
        <div className="cat-price-filter">
          <p className="cat-price-label">
            <span>{t("catalog.price")}</span>
            <span className="cat-price-currency">{currency}</span>
          </p>
          <div className="cat-price-inputs">
            <label className="cat-price-field">
              <span>{t("catalog.priceFrom")}</span>
              <input
                className="input cat-price-input"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={minPrice}
                onChange={(event) => onMinPrice(event.target.value)}
              />
            </label>
            <span className="cat-price-dash" aria-hidden="true">–</span>
            <label className="cat-price-field">
              <span>{t("catalog.priceTo")}</span>
              <input
                className="input cat-price-input"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={maxPrice}
                onChange={(event) => onMaxPrice(event.target.value)}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CatalogFilterSheet({
  onClose,
  onClear,
  canClear,
  resultCount,
  ...controls
}: CatalogFilterControlsProps & {
  onClose: () => void;
  onClear: () => void;
  canClear: boolean;
  resultCount: number;
}) {
  const { t } = useI18n();
  const dialogRef = useDialogFocus<HTMLDivElement>();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="cat-overlay cat-filter-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cat-filters-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="cat-filter-sheet" ref={dialogRef} tabIndex={-1}>
        <header className="cat-filter-head">
          <h2 className="cat-filter-title" id="cat-filters-title">
            <SlidersHorizontal size={17} />
            {t("catalog.filters")}
          </h2>
          <button type="button" onClick={onClose} className="cat-modal-close cat-drawer-close" aria-label={t("catalog.close")}>
            <X size={16} />
          </button>
        </header>

        <div className="cat-filter-sheet-body">
          <CatalogFilterControls {...controls} />
        </div>

        <footer className="cat-filter-foot">
          <button type="button" className="cat-filter-clear" onClick={onClear} disabled={!canClear}>
            {t("catalog.clearFilters")}
          </button>
          <button type="button" className="cat-filter-apply" onClick={onClose}>
            {t("catalog.applyFilters", { n: resultCount })}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

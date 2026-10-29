"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, LayoutGrid, X } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { useDialogFocus } from "@/components/use-dialog-focus";

export default function CatalogCategorySheet({ categories, category, onSelect, onClose }: {
  categories: ReadonlyArray<readonly [string, number]>;
  category: string;
  onSelect: (category: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // The list can be taller than the sheet; start at the current selection.
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>("[data-active]");
    if (!list || !active) return;
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.top < listRect.top || activeRect.bottom > listRect.bottom) {
      list.scrollTop += activeRect.top - listRect.top - 8;
    }
  }, []);

  return createPortal(
    <div className="cat-overlay cat-filter-overlay" role="dialog" aria-modal="true" aria-labelledby="cat-categories-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="cat-filter-sheet cat-category-sheet" ref={dialogRef} tabIndex={-1}>
        <header className="cat-filter-head">
          <h2 className="cat-filter-title" id="cat-categories-title">
            <LayoutGrid size={17} />
            {t("catalog.categoriesLabel")}
          </h2>
          <button type="button" onClick={onClose} className="cat-modal-close cat-drawer-close" aria-label={t("catalog.close")}>
            <X size={16} />
          </button>
        </header>

        <div className="cat-category-sheet-list" ref={listRef}>
          {categories.map(([cat, count]) => {
            const active = category === cat;
            return (
              <button key={cat} type="button" className="cat-category-option" data-active={active || undefined}
                aria-pressed={active} onClick={() => { onSelect(cat); onClose(); }}>
                <span className="cat-category-option-name">{cat === "all" ? t("all") : cat}</span>
                <span className="cat-category-option-count">{count}</span>
                <span className="cat-category-option-mark" aria-hidden="true">
                  {active && <Check size={12} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

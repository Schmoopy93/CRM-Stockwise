"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

type Props = {
  page: number;
  totalPages: number;
  totalItems: number;
  shown: number;
  hasMore: boolean;
  loading?: boolean;
  onLoadMore: () => void;
  onGoToPage: (page: number) => void;
  labels: {
    loadMore: string;
    loading: string;
    showing: string;
    of: string;
    page: string;
    prev: string;
    next: string;
  };
};

/**
 * Shared list footer: "Load more" button plus compact page numbers.
 * Renders nothing when there is nothing to page through.
 */
export default function ListPagination({
  page,
  totalPages,
  totalItems,
  shown,
  hasMore,
  loading = false,
  onLoadMore,
  onGoToPage,
  labels,
}: Props) {
  if (totalItems === 0) return null;

  // Page numbers with ellipses: 1 … p-1 p p+1 … last
  const pages: Array<number | "gap"> = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== "gap") pages.push("gap");
  }

  return (
    <div className="list-pagination">
      <p className="list-pagination-count">
        {labels.showing} {shown} {labels.of} {totalItems}
      </p>

      <div className="list-pagination-actions">
        {hasMore && (
          <button className="btn-secondary list-pagination-more" onClick={onLoadMore} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : null}
            {loading ? labels.loading : labels.loadMore}
          </button>
        )}

        {totalPages > 1 && (
          <nav className="list-pagination-pages" aria-label={labels.page}>
            <button
              className="list-page-btn"
              onClick={() => onGoToPage(page - 1)}
              disabled={page <= 1}
              aria-label={labels.prev}
            >
              <ChevronLeft size={14} />
            </button>

            {pages.map((p, i) =>
              p === "gap" ? (
                <span key={`gap-${i}`} className="list-page-gap">…</span>
              ) : (
                <button
                  key={p}
                  className="list-page-btn"
                  data-active={p === page}
                  aria-current={p === page ? "page" : undefined}
                  onClick={() => onGoToPage(p)}
                >
                  {p}
                </button>
              )
            )}

            <button
              className="list-page-btn"
              onClick={() => onGoToPage(page + 1)}
              disabled={page >= totalPages}
              aria-label={labels.next}
            >
              <ChevronRight size={14} />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}

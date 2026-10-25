"use client";

import { useMemo, useState } from "react";

export const PAGE_SIZE = 12;

/**
 * Client-side pagination for already-loaded arrays.
 * Each page shows exactly `pageSize` items; navigation jumps between pages.
 * Resets to the first page whenever `deps` change (search, filters, sort...).
 */
export function usePagination<T>(items: T[], deps: unknown[] = [], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [prevDeps, setPrevDeps] = useState(deps);

  if (deps.length !== prevDeps.length || deps.some((dep, i) => !Object.is(dep, prevDeps[i]))) {
    setPrevDeps(deps);
    setPage(1);
  }

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);

  const visible = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize],
  );

  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    setPage(clamped);
  };

  return {
    visible,
    page: currentPage,
    totalPages,
    totalItems,
    // hasMore and loadMore kept for API compatibility; hasMore signals there are
    // further pages but ListPagination uses goToPage for navigation now.
    hasMore: currentPage < totalPages,
    loadMore: () => goToPage(currentPage + 1),
    goToPage,
    setPage,
  };
}

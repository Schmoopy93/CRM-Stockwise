"use client";

import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE = 12;

/**
 * Client-side pagination + "load more" for already-loaded arrays.
 * Resets to the first page whenever `deps` change (search, filters, sort...).
 */
export function usePagination<T>(items: T[], deps: unknown[] = [], pageSize = PAGE_SIZE) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [page, setPage] = useState(1);

  // Reset whenever the result set changes.
  useEffect(() => {
    setVisibleCount(pageSize);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Clamp if the list shrinks (e.g. items removed) while a later page is active.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visible = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleCount < totalItems;

  const loadMore = () => {
    const next = Math.min(visibleCount + pageSize, totalItems);
    setVisibleCount(next);
    setPage(Math.max(1, Math.ceil(next / pageSize)));
  };

  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    setPage(clamped);
    setVisibleCount(clamped * pageSize);
  };

  return {
    visible,
    page,
    totalPages,
    totalItems,
    hasMore,
    loadMore,
    goToPage,
    setPage,
  };
}

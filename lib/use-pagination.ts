"use client";

import { useMemo, useState } from "react";

export const PAGE_SIZE = 12;

/**
 * Client-side pagination + "load more" for already-loaded arrays.
 * Resets to the first page whenever `deps` change (search, filters, sort...).
 */
export function usePagination<T>(items: T[], deps: unknown[] = [], pageSize = PAGE_SIZE) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [page, setPage] = useState(1);
  const [prevDeps, setPrevDeps] = useState(deps);

  if (deps.length !== prevDeps.length || deps.some((dep, i) => !Object.is(dep, prevDeps[i]))) {
    setPrevDeps(deps);
    setVisibleCount(pageSize);
    setPage(1);
  }

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);

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
    page: currentPage,
    totalPages,
    totalItems,
    hasMore,
    loadMore,
    goToPage,
    setPage,
  };
}

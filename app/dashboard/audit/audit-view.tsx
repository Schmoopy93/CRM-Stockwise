"use client";

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Filter,
  Inbox,
  Scale,
  Search,
  Tag,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { INTL_LOCALES, useI18n } from "@/lib/i18n-context";
import { usePagination } from "@/lib/use-pagination";
import ListPagination from "@/components/ListPagination";
import Select from "@/components/Select";
import type { Product, StockEvent } from "@/lib/types";
import {
  AUDIT_EVENT_LIMIT,
  AUDIT_REASONS,
  auditCsv,
  auditFileName,
  auditReason,
  auditRelativeTime,
  auditSummary,
  filterAuditEvents,
  groupAuditEventsByDay,
  localDayKey,
  sortAuditEvents,
  type AuditDirection,
  type AuditLookup,
  type AuditReason,
  type AuditSort,
  type AuditSummary,
} from "@/lib/audit";
import styles from "./audit.module.css";

const PAGE_SIZE = 20;

const DIRECTION_KEYS: Record<AuditDirection, string> = {
  all: "audit.directionAll",
  in: "audit.directionIn",
  out: "audit.directionOut",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0].charAt(0) + (parts[1]?.charAt(0) ?? "")).toUpperCase();
}

function timeLabel(date: Date | null, intlLocale: string) {
  if (!date) return "—";
  return date.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(date: Date | null, intlLocale: string) {
  if (!date) return "—";
  return date.toLocaleDateString(intlLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface DetailsProps {
  event: StockEvent;
  intlLocale: string;
  copied: boolean;
  onCopy: (id: string) => void;
  t: (key: string) => string;
}

/** Opened on demand, so relative time is only computed on the client. */
function EventDetails({ event, intlLocale, copied, onCopy, t }: DetailsProps) {
  return (
    <div className={styles.detailPanel} id={`audit-details-${event.id}`}>
      <div className={styles.detailGrid}>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>{t("audit.timeExact")}</span>
          <span className={styles.detailValue}>
            {event.createdAt ? (
              <>
                {event.createdAt.toLocaleDateString(intlLocale, { day: "2-digit", month: "2-digit", year: "numeric" })}{" "}
                {event.createdAt.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                <em className={styles.relative}>· {auditRelativeTime(event.createdAt, intlLocale)}</em>
              </>
            ) : "—"}
          </span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>{t("audit.eventId")}</span>
          <span className={styles.detailValue}>
            <code className={styles.mono}>{event.id}</code>
            <button type="button" className={styles.copyBtn} onClick={() => onCopy(event.id)}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? t("audit.copied") : t("audit.copyId")}
            </button>
          </span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>{t("audit.productId")}</span>
          <span className={styles.detailValue}><code className={styles.mono}>{event.productId || "—"}</code></span>
        </div>
        {event.variantId && (
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>{t("audit.variantId")}</span>
            <span className={styles.detailValue}><code className={styles.mono}>{event.variantId}</code></span>
          </div>
        )}
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>{t("audit.actorId")}</span>
          <span className={styles.detailValue}><code className={styles.mono}>{event.actorUid || "—"}</code></span>
        </div>
      </div>
    </div>
  );
}

/** Presentation only: the dashboard page supplies the live snapshot, which
 * keeps search, filtering, sorting and the export testable on their own. */
export default function AuditView({ events, products }: { events: StockEvent[]; products: Product[] }) {
  const { locale, t } = useI18n();
  const intlLocale = INTL_LOCALES[locale];

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [reason, setReason] = useState<AuditReason | "all">("all");
  const [direction, setDirection] = useState<AuditDirection>("all");
  const [actorUid, setActorUid] = useState("all");
  const [productId, setProductId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<AuditSort>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const productNames = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);
  const productName = useCallback(
    (id: string) => productNames.get(id) ?? id.slice(0, 8),
    [productNames]
  );
  const reasonLabel = useCallback((value: AuditReason) => t(`audit.reason.${value}`), [t]);
  const lookup = useMemo<AuditLookup>(() => ({ productName, reasonLabel }), [productName, reasonLabel]);

  const filters = useMemo(
    () => ({ search: deferredSearch, reason, direction, actorUid, productId, from: dateFrom, to: dateTo }),
    [deferredSearch, reason, direction, actorUid, productId, dateFrom, dateTo]
  );

  // Counts on the chips ignore the type filter itself, so each number says what
  // selecting that type would show.
  const withoutReason = useMemo(
    () => filterAuditEvents(events, { ...filters, reason: "all" }, lookup),
    [events, filters, lookup]
  );

  const filtered = useMemo(
    () => (reason === "all" ? withoutReason : withoutReason.filter((event) => auditReason(event) === reason)),
    [withoutReason, reason]
  );

  const reasonCounts = useMemo(() => {
    const counts: Record<AuditReason, number> = { receipt: 0, adjustment: 0, sale: 0, return: 0, correction: 0 };
    for (const event of withoutReason) counts[auditReason(event)] += 1;
    return counts;
  }, [withoutReason]);

  const sorted = useMemo(() => sortAuditEvents(filtered, sort), [filtered, sort]);
  const summary: AuditSummary = useMemo(() => auditSummary(filtered), [filtered]);
  const actors = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) map.set(event.actorUid, event.actorName);
    return Array.from(map, ([uid, name]) => ({ uid, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [events]);

  const paging = usePagination(
    sorted,
    [deferredSearch, reason, direction, actorUid, productId, dateFrom, dateTo, sort, events.length],
    PAGE_SIZE
  );
  const days = useMemo(() => groupAuditEventsByDay(paging.visible), [paging.visible]);

  const clearFilters = () => {
    setReason("all");
    setDirection("all");
    setActorUid("all");
    setProductId("all");
    setDateFrom("");
    setDateTo("");
  };

  const resetEverything = () => {
    setSearch("");
    clearFilters();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? "" : current)), 1600);
    } catch {
      // Clipboard access can be refused; the value stays selectable in the row.
    }
  };

  const downloadCsv = () => {
    if (sorted.length === 0) return;
    const csv = auditCsv(sorted, {
      labels: {
        date: t("audit.time"),
        product: t("audit.product"),
        variant: t("audit.productVariant"),
        type: t("audit.type"),
        change: t("audit.change"),
        staff: t("audit.staffColumn"),
      },
      productName,
      reasonLabel,
    });
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = auditFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const presetRange = (days: number | null) => {
    if (days === null) return { from: "", to: "", active: !dateFrom && !dateTo };
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    const fromKey = localDayKey(from);
    const toKey = localDayKey(to);
    return { from: fromKey, to: toKey, active: dateFrom === fromKey && dateTo === toKey };
  };

  const activeFilters: Array<{ key: string; label: string; clear: () => void }> = [];
  if (direction !== "all") {
    activeFilters.push({
      key: "direction",
      label: t(DIRECTION_KEYS[direction]),
      clear: () => setDirection("all"),
    });
  }
  if (reason !== "all") {
    activeFilters.push({ key: "reason", label: reasonLabel(reason), clear: () => setReason("all") });
  }
  if (actorUid !== "all") {
    activeFilters.push({
      key: "actor",
      label: actors.find((actor) => actor.uid === actorUid)?.name ?? actorUid,
      clear: () => setActorUid("all"),
    });
  }
  if (productId !== "all") {
    activeFilters.push({ key: "product", label: productName(productId), clear: () => setProductId("all") });
  }
  if (dateFrom || dateTo) {
    activeFilters.push({
      key: "dates",
      label: `${dateFrom || "…"} – ${dateTo || "…"}`,
      clear: () => {
        setDateFrom("");
        setDateTo("");
      },
    });
  }
  const hasFilters = activeFilters.length > 0;

  const toggleDetails = (id: string) => setExpanded((current) => (current === id ? null : id));

  const stats = [
    { tone: "accent", icon: <Tag size={15} />, label: t("audit.events"), value: String(summary.count), valueTone: undefined },
    { tone: "in", icon: <TrendingUp size={15} />, label: t("audit.unitsIn"), value: `+${summary.unitsIn}`, valueTone: "in" },
    { tone: "out", icon: <TrendingDown size={15} />, label: t("audit.unitsOut"), value: `-${summary.unitsOut}`, valueTone: "out" },
    {
      tone: "net",
      icon: <Scale size={15} />,
      label: t("audit.net"),
      value: `${summary.net > 0 ? "+" : ""}${summary.net}`,
      valueTone: summary.net > 0 ? "in" : summary.net < 0 ? "out" : undefined,
    },
  ];

  const pagingLabels = {
    loadMore: t("paging.loadMore"),
    loading: t("paging.loading"),
    showing: t("paging.showing"),
    of: t("paging.of"),
    page: t("paging.page"),
    prev: t("paging.prev"),
    next: t("paging.next"),
  };

  const renderDetails = (event: StockEvent) => (
    <EventDetails
      event={event}
      intlLocale={intlLocale}
      copied={copied === event.id}
      onCopy={copyId}
      t={t}
    />
  );

  return (
    <div className={`fade-up ${styles.page}`}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("audit.title")}</h1>
          <p className={styles.subtitle}>{t("audit.subtitle")} · {events.length}</p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.btn}
            onClick={downloadCsv}
            disabled={sorted.length === 0}
            title={t("audit.exportCsv")}
          >
            <Download size={14} />
            {t("audit.exportCsv")}
          </button>
          <button
            type="button"
            className={styles.btn}
            data-active={hasFilters}
            onClick={() => setShowFilters((current) => !current)}
            aria-expanded={showFilters}
            aria-controls="audit-filters"
          >
            <Filter size={14} />
            {t("audit.filters")}
            {hasFilters && <span className={styles.activeDot} />}
          </button>
        </div>
      </div>

      {events.length >= AUDIT_EVENT_LIMIT && (
        <p className={styles.warning}>
          <AlertTriangle size={14} />
          {t("audit.capWarning")}
        </p>
      )}

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={15} className={styles.searchIcon} />
          <input
            ref={searchRef}
            className={`input ${styles.searchInput}`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("audit.searchPlaceholder")}
            aria-label={t("audit.search")}
            type="search"
          />
          {search ? (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => {
                setSearch("");
                searchRef.current?.focus();
              }}
              aria-label={t("audit.clearSearch")}
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className={styles.kbd} aria-hidden="true">/</kbd>
          )}
        </div>

        <div className={styles.segmented} role="group" aria-label={t("audit.direction")}>
          {(["all", "in", "out"] as AuditDirection[]).map((value) => (
            <button
              key={value}
              type="button"
              className={styles.segBtn}
              data-active={direction === value}
              aria-pressed={direction === value}
              onClick={() => setDirection(value)}
            >
              {t(DIRECTION_KEYS[value])}
            </button>
          ))}
        </div>

        <div className={styles.sortWrap}>
          <ArrowUpDown size={14} aria-hidden="true" />
          <Select
            className={styles.sortSelect}
            bare
            value={sort}
            onChange={(next) => setSort(next as AuditSort)}
            options={[
              { value: "newest", label: t("audit.sortNewest") },
              { value: "oldest", label: t("audit.sortOldest") },
              { value: "largest", label: t("audit.sortLargest") },
            ]}
            ariaLabel={t("audit.sort")}
          />
        </div>
      </div>

      <div className={styles.chips} role="group" aria-label={t("audit.eventType")}>
        <button
          type="button"
          className={styles.chip}
          data-active={reason === "all"}
          aria-pressed={reason === "all"}
          onClick={() => setReason("all")}
        >
          {t("all")}
          <span className={styles.chipCount}>{withoutReason.length}</span>
        </button>
        {AUDIT_REASONS.map((value) => (
          <button
            key={value}
            type="button"
            className={styles.chip}
            data-reason={value}
            data-active={reason === value}
            aria-pressed={reason === value}
            onClick={() => setReason(reason === value ? "all" : value)}
          >
            <span className={styles.chipDot} />
            {t(`audit.reason.${value}`)}
            <span className={styles.chipCount}>{reasonCounts[value]}</span>
          </button>
        ))}
      </div>

      {showFilters && (
        <div id="audit-filters" className={`glass fade-up ${styles.filtersPanel}`}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="audit-staff">{t("audit.staff")}</label>
            <Select
              id="audit-staff"
              value={actorUid}
              onChange={setActorUid}
              options={[{ value: "all", label: t("all") }, ...actors.map((actor) => ({ value: actor.uid, label: actor.name }))]}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="audit-product">{t("audit.product")}</label>
            <Select
              id="audit-product"
              value={productId}
              onChange={setProductId}
              options={[{ value: "all", label: t("all") }, ...products.map((product) => ({ value: product.id, label: product.name }))]}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="audit-from">{t("audit.from")}</label>
            <input
              id="audit-from"
              className={`input ${styles.control}`}
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="audit-to">{t("audit.to")}</label>
            <input
              id="audit-to"
              className={`input ${styles.control}`}
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          <button type="button" className={styles.filtersClear} onClick={clearFilters}>
            {t("audit.clearFilters")}
          </button>
          <div className={styles.presets}>
            <span className={styles.presetLabel}><CalendarDays size={13} /> {t("audit.range")}</span>
            {[7, 30, 90].map((days) => {
              const preset = presetRange(days);
              return (
                <button
                  key={days}
                  type="button"
                  className={styles.presetBtn}
                  data-active={preset.active}
                  onClick={() => {
                    setDateFrom(preset.from);
                    setDateTo(preset.to);
                  }}
                >
                  {t(`audit.range${days}`)}
                </button>
              );
            })}
            <button
              type="button"
              className={styles.presetBtn}
              data-active={!dateFrom && !dateTo}
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              {t("audit.rangeAll")}
            </button>
          </div>
        </div>
      )}

      {hasFilters && (
        <div className={styles.activeRow} aria-label={t("audit.filterRow")}>
          <span className={styles.activeLabel}>{t("audit.filterRow")}</span>
          {activeFilters.map((entry) => (
            <span key={entry.key} className={styles.activeChip}>
              {entry.label}
              <button type="button" onClick={entry.clear} aria-label={`${t("audit.clearFilters")}: ${entry.label}`}>
                <X size={11} />
              </button>
            </span>
          ))}
          <button type="button" className={styles.clearAll} onClick={clearFilters}>
            {t("audit.clearFilters")}
          </button>
        </div>
      )}

      <p className={styles.srOnly} aria-live="polite">{t("audit.matched", { n: filtered.length })}</p>

      <div className={styles.stats}>
        {stats.map((stat) => (
          <div key={stat.label} className={`glass ${styles.stat}`}>
            <div className={styles.statIcon} data-tone={stat.tone}>{stat.icon}</div>
            <div>
              <p className={styles.statValue} data-tone={stat.valueTone}>{stat.value}</p>
              <p className={styles.statLabel}>{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {events.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><Inbox size={20} /></div>
          <p className={styles.emptyTitle}>{t("audit.noEvents")}</p>
          <p className={styles.emptyBody}>{t("audit.subtitle")}</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><Search size={20} /></div>
          <p className={styles.emptyTitle}>{t("audit.noneMatch")}</p>
          <button type="button" className={styles.clearBtn} onClick={resetEverything}>
            {t("audit.clearFilters")}
          </button>
        </div>
      ) : (
        <>
          <div className={`glass ${styles.tableCard}`}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.colHead}>{t("audit.time")}</th>
                    <th scope="col" className={styles.colHead}>{t("audit.productVariant")}</th>
                    <th scope="col" className={styles.colHead}>{t("audit.type")}</th>
                    <th scope="col" className={`${styles.colHead} ${styles.colHeadNum}`}>{t("audit.change")}</th>
                    <th scope="col" className={styles.colHead}>{t("audit.staffColumn")}</th>
                    <th scope="col" className={styles.colHead} aria-label={t("audit.details")} />
                  </tr>
                </thead>
                {days.map((day) => (
                  <tbody key={day.key}>
                    <tr>
                      <th scope="rowgroup" colSpan={6} className={styles.dayHeadCell}>
                        <span className={styles.dayHeadInner}>
                          <span>{dayLabel(day.date, intlLocale)}</span>
                          <span className={styles.dayMeta}>
                            <span data-sign="in">+{day.unitsIn}</span>
                            <span data-sign="out">−{day.unitsOut}</span>
                          </span>
                        </span>
                      </th>
                    </tr>
                    {day.events.map((event) => {
                      const tone = auditReason(event);
                      const isOpen = expanded === event.id;
                      return (
                        <Fragment key={event.id}>
                          <tr className={styles.row} data-expanded={isOpen}>
                            <td className={styles.timeCell}>
                              {event.createdAt
                                ? <time dateTime={event.createdAt.toISOString()} title={event.createdAt.toISOString()}>{timeLabel(event.createdAt, intlLocale)}</time>
                                : "—"}
                            </td>
                            <td>
                              <Link
                                href={`/dashboard/products/${event.productId}`}
                                className={styles.productLink}
                                title={t("audit.openProduct")}
                              >
                                {productName(event.productId)}
                                <ExternalLink size={11} />
                              </Link>
                              {event.variantLabel && <p className={styles.variant}>{event.variantLabel}</p>}
                            </td>
                            <td>
                              <span className={styles.reasonBadge} data-reason={tone}>{reasonLabel(tone)}</span>
                            </td>
                            <td className={styles.deltaCell}>
                              <span className={styles.delta} data-sign={event.delta > 0 ? "in" : "out"}>
                                {event.delta > 0 ? "+" : ""}{event.delta}
                              </span>
                            </td>
                            <td>
                              <span className={styles.actor}>
                                <span className={styles.avatar} aria-hidden="true">{initials(event.actorName)}</span>
                                {event.actorName || "—"}
                              </span>
                            </td>
                            <td className={styles.expandCell}>
                              <button
                                type="button"
                                className={styles.expandBtn}
                                aria-expanded={isOpen}
                                aria-controls={`audit-details-${event.id}`}
                                aria-label={isOpen ? t("audit.detailsHide") : t("audit.details")}
                                onClick={() => toggleDetails(event.id)}
                              >
                                <ChevronDown size={15} />
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className={styles.detailRow}>
                              <td colSpan={6}>{renderDetails(event)}</td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          </div>

          <ul className={styles.cards}>
            {days.map((day) => (
              <li key={day.key} className={styles.dayBlock}>
                <div className={styles.mobileDay}>
                  <span>{dayLabel(day.date, intlLocale)}</span>
                  <span className={styles.dayMeta}>
                    <span data-sign="in">+{day.unitsIn}</span>
                    <span data-sign="out">−{day.unitsOut}</span>
                  </span>
                </div>
                <ul className={styles.cardList}>
                  {day.events.map((event) => {
                    const tone = auditReason(event);
                    const isOpen = expanded === event.id;
                    return (
                      <li key={event.id} className={styles.card}>
                        <div className={styles.cardTop}>
                          <span className={styles.cardTime}>{timeLabel(event.createdAt, intlLocale)}</span>
                          <span className={styles.delta} data-sign={event.delta > 0 ? "in" : "out"}>
                            {event.delta > 0 ? "+" : ""}{event.delta}
                          </span>
                        </div>
                        <Link
                          href={`/dashboard/products/${event.productId}`}
                          className={styles.productLink}
                          title={t("audit.openProduct")}
                        >
                          {productName(event.productId)}
                          <ExternalLink size={11} />
                        </Link>
                        {event.variantLabel && <p className={styles.variant}>{event.variantLabel}</p>}
                        <div className={styles.cardFoot}>
                          <span className={styles.reasonBadge} data-reason={tone}>{reasonLabel(tone)}</span>
                          <span className={styles.actor}>
                            <span className={styles.avatar} aria-hidden="true">{initials(event.actorName)}</span>
                            {event.actorName || "—"}
                          </span>
                          <button
                            type="button"
                            className={styles.expandBtn}
                            aria-expanded={isOpen}
                            aria-controls={`audit-details-${event.id}`}
                            aria-label={isOpen ? t("audit.detailsHide") : t("audit.details")}
                            onClick={() => toggleDetails(event.id)}
                          >
                            <ChevronDown size={15} />
                          </button>
                        </div>
                        {isOpen && renderDetails(event)}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>

          <ListPagination
            page={paging.page}
            totalPages={paging.totalPages}
            totalItems={paging.totalItems}
            shown={paging.visible.length}
            hasMore={paging.hasMore}
            onLoadMore={paging.loadMore}
            onGoToPage={paging.goToPage}
            labels={pagingLabels}
          />
        </>
      )}
    </div>
  );
}

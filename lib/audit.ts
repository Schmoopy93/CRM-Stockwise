import { matchesCatalogQuery } from "./catalog-filter.ts";
import type { StockEvent } from "./types.ts";

/** Pure helpers behind the audit log: the page only renders what these return,
 * so filtering, sorting, grouping and the CSV export can be tested without a
 * browser or Firestore. */

export type AuditReason = NonNullable<StockEvent["reason"]>;
export type AuditDirection = "all" | "in" | "out";
export type AuditSort = "newest" | "oldest" | "largest";

/** Display order of the type chips; matches the ledger's own vocabulary. */
export const AUDIT_REASONS: AuditReason[] = ["receipt", "adjustment", "sale", "return", "correction"];

/** How many stock events one subscription loads. The audit log warns the owner
 * when this ceiling is reached, because older movements then exist but are not
 * in memory. */
export const AUDIT_EVENT_LIMIT = 500;

export interface AuditFilters {
  search: string;
  reason: AuditReason | "all";
  direction: AuditDirection;
  actorUid: string;
  productId: string;
  /** Inclusive local-day bounds, `YYYY-MM-DD`. Empty means "no bound". */
  from: string;
  to: string;
}

/** Names the page already has but this module must not reach for itself. */
export interface AuditLookup {
  productName: (productId: string) => string;
  reasonLabel: (reason: AuditReason) => string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  search: "",
  reason: "all",
  direction: "all",
  actorUid: "all",
  productId: "all",
  from: "",
  to: "",
};

export function auditReason(event: StockEvent): AuditReason {
  return event.reason ?? "adjustment";
}

function dayBound(value: string, endOfDay: boolean): number | null {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function matchesDates(event: StockEvent, from: number | null, to: number | null) {
  if (from === null && to === null) return true;
  // An event with no timestamp cannot be placed on the timeline at all.
  if (!event.createdAt) return false;
  const time = event.createdAt.getTime();
  if (from !== null && time < from) return false;
  if (to !== null && time > to) return false;
  return true;
}

function searchable(event: StockEvent, lookup: AuditLookup) {
  return [
    lookup.productName(event.productId),
    event.productId,
    event.variantLabel,
    event.actorName,
    lookup.reasonLabel(auditReason(event)),
  ].join(" ");
}

/** Keeps the events that satisfy every active filter. Search tokens must all be
 * present somewhere in the row, in any order, ignoring case and diacritics. */
export function filterAuditEvents(
  events: StockEvent[],
  filters: AuditFilters,
  lookup: AuditLookup
): StockEvent[] {
  const from = dayBound(filters.from, false);
  const to = dayBound(filters.to, true);
  return events.filter((event) => {
    if (filters.reason !== "all" && auditReason(event) !== filters.reason) return false;
    if (filters.direction === "in" && event.delta <= 0) return false;
    if (filters.direction === "out" && event.delta >= 0) return false;
    if (filters.actorUid !== "all" && event.actorUid !== filters.actorUid) return false;
    if (filters.productId !== "all" && event.productId !== filters.productId) return false;
    if (!matchesDates(event, from, to)) return false;
    if (filters.search.trim() && !matchesCatalogQuery(searchable(event, lookup), filters.search)) return false;
    return true;
  });
}

function timeOf(event: StockEvent) {
  return event.createdAt ? event.createdAt.getTime() : null;
}

function newestFirst(a: StockEvent, b: StockEvent) {
  const at = timeOf(a);
  const bt = timeOf(b);
  // Events without a timestamp sink to the end instead of pretending to be new.
  if (at === null && bt === null) return a.id.localeCompare(b.id);
  if (at === null) return 1;
  if (bt === null) return -1;
  return bt - at || a.id.localeCompare(b.id);
}

/** Returns a new array; the caller's list keeps the snapshot's own order. */
export function sortAuditEvents(events: StockEvent[], sort: AuditSort): StockEvent[] {
  const sorted = [...events];
  if (sort === "largest") {
    sorted.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || newestFirst(a, b));
    return sorted;
  }
  if (sort === "oldest") {
    sorted.sort((a, b) => {
      const at = timeOf(a);
      const bt = timeOf(b);
      if (at === null && bt === null) return a.id.localeCompare(b.id);
      if (at === null) return 1;
      if (bt === null) return -1;
      return at - bt || a.id.localeCompare(b.id);
    });
    return sorted;
  }
  sorted.sort(newestFirst);
  return sorted;
}

export interface AuditSummary {
  count: number;
  unitsIn: number;
  unitsOut: number;
  net: number;
}

export function auditSummary(events: StockEvent[]): AuditSummary {
  let unitsIn = 0;
  let unitsOut = 0;
  for (const event of events) {
    if (event.delta > 0) unitsIn += event.delta;
    else unitsOut += Math.abs(event.delta);
  }
  return { count: events.length, unitsIn, unitsOut, net: unitsIn - unitsOut };
}

/** Local calendar day, not UTC: an event after midnight belongs to that day in
 * the shop's timezone, which is the only one the owner thinks in. */
export function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface AuditDayGroup {
  key: string;
  date: Date | null;
  events: StockEvent[];
  unitsIn: number;
  unitsOut: number;
}

/** Groups consecutive events by local day, preserving the order they arrive in,
 * and totals each day so a burst of movements reads as one block. */
export function groupAuditEventsByDay(events: StockEvent[]): AuditDayGroup[] {
  const groups = new Map<string, AuditDayGroup>();
  for (const event of events) {
    const key = event.createdAt ? localDayKey(event.createdAt) : "";
    let group = groups.get(key);
    if (!group) {
      group = { key, date: event.createdAt, events: [], unitsIn: 0, unitsOut: 0 };
      groups.set(key, group);
    }
    group.events.push(event);
    if (event.delta > 0) group.unitsIn += event.delta;
    else group.unitsOut += Math.abs(event.delta);
  }
  return Array.from(groups.values());
}

function localTimestamp(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${localDayKey(date)} ${hours}:${minutes}:${seconds}`;
}

/** A spreadsheet treats any text starting with =, +, - or @ as a formula, and a
 * product name is user input. Leading apostrophe keeps the cell literal. */
function csvText(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (!/["\r\n]/.test(guarded) && !/^\s|\s$/.test(guarded) && !guarded.includes(",")) return guarded;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export interface AuditCsvLabels {
  date: string;
  product: string;
  variant: string;
  type: string;
  change: string;
  staff: string;
}

export interface AuditCsvOptions {
  labels: AuditCsvLabels;
  productName: (productId: string) => string;
  reasonLabel: (reason: AuditReason) => string;
}

/** CSV of the filtered set (not just the visible page). No BOM here: the
 * download adds one so Excel reads UTF-8, while tests get a plain string. */
export function auditCsv(events: StockEvent[], options: AuditCsvOptions): string {
  const rows = [[
    options.labels.date,
    options.labels.product,
    options.labels.variant,
    options.labels.type,
    options.labels.change,
    options.labels.staff,
  ].map(csvText).join(",")];

  for (const event of events) {
    rows.push([
      event.createdAt ? localTimestamp(event.createdAt) : "",
      csvText(options.productName(event.productId)),
      csvText(event.variantLabel),
      csvText(options.reasonLabel(auditReason(event))),
      String(event.delta),
      csvText(event.actorName),
    ].join(","));
  }
  return rows.join("\r\n");
}

export function auditFileName(date = new Date()): string {
  return `audit-${localDayKey(date)}.csv`;
}

/** Short relative time for the details panel. Delegates wording, plurals and
 * grammar to Intl, so every shop locale reads naturally. */
export function auditRelativeTime(date: Date, locale: string, now = new Date()): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 45_000) return formatter.format(Math.round(diff / 1_000), "second");
  if (abs < 45 * 60_000) return formatter.format(Math.round(diff / 60_000), "minute");
  if (abs < 22 * 3_600_000) return formatter.format(Math.round(diff / 3_600_000), "hour");
  if (abs < 26 * 86_400_000) return formatter.format(Math.round(diff / 86_400_000), "day");
  if (abs < 320 * 86_400_000) return formatter.format(Math.round(diff / (30 * 86_400_000)), "month");
  return formatter.format(Math.round(diff / (365 * 86_400_000)), "year");
}

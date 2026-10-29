import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUDIT_REASONS,
  auditCsv,
  auditFileName,
  auditRelativeTime,
  auditSummary,
  EMPTY_AUDIT_FILTERS,
  filterAuditEvents,
  groupAuditEventsByDay,
  localDayKey,
  sortAuditEvents,
  type AuditFilters,
  type AuditLookup,
} from "../lib/audit.ts";
import type { StockEvent } from "../lib/types.ts";

function event(overrides: Partial<StockEvent> & { id: string }): StockEvent {
  return {
    productId: "p1",
    variantId: "v1",
    variantLabel: "",
    delta: 1,
    reason: "adjustment",
    actorUid: "u1",
    actorName: "Marko",
    createdAt: new Date(2026, 9, 28, 12, 0),
    ...overrides,
  };
}

const lookups: AuditLookup = {
  productName: (id) => (id === "p1" ? "Čaj Đački" : "Ostalo"),
  reasonLabel: (reason) => reason,
};

function filters(overrides: Partial<AuditFilters> = {}): AuditFilters {
  return { ...EMPTY_AUDIT_FILTERS, ...overrides };
}

test("search ignores case and diacritics across product, variant, actor and type", () => {
  const events = [
    event({ id: "a" }),
    event({ id: "b", productId: "p2" }),
    event({ id: "c", productId: "p2", variantLabel: "Crna", actorName: "Đorđe" }),
  ];
  const byProduct = filterAuditEvents(events, filters({ search: "caj dacki" }), lookups);
  assert.deepEqual(byProduct.map((e) => e.id), ["a"]);

  const byActor = filterAuditEvents(events, filters({ search: "dorde" }), lookups);
  assert.deepEqual(byActor.map((e) => e.id), ["c"]);

  const byType = filterAuditEvents(events, filters({ search: "adjust" }), lookups);
  assert.deepEqual(byType.map((e) => e.id), ["a", "b", "c"]);
});

test("direction, reason, actor and product filters combine", () => {
  const events = [
    event({ id: "in", delta: 4, reason: "receipt" }),
    event({ id: "out", delta: -2, reason: "sale" }),
    event({ id: "other", delta: -1, actorUid: "u2" }),
    event({ id: "product", delta: 3, productId: "p2" }),
  ];
  assert.deepEqual(filterAuditEvents(events, filters({ direction: "in" }), lookups).map((e) => e.id), ["in", "product"]);
  assert.deepEqual(filterAuditEvents(events, filters({ direction: "out" }), lookups).map((e) => e.id), ["out", "other"]);
  assert.deepEqual(filterAuditEvents(events, filters({ reason: "sale" }), lookups).map((e) => e.id), ["out"]);
  assert.deepEqual(filterAuditEvents(events, filters({ actorUid: "u2" }), lookups).map((e) => e.id), ["other"]);
  assert.deepEqual(filterAuditEvents(events, filters({ productId: "p2" }), lookups).map((e) => e.id), ["product"]);
});

test("date bounds are inclusive local days and exclude events without a timestamp", () => {
  const events = [
    event({ id: "start", createdAt: new Date(2026, 9, 28, 0, 0, 0) }),
    event({ id: "end", createdAt: new Date(2026, 9, 28, 23, 59, 59) }),
    event({ id: "after", createdAt: new Date(2026, 9, 29, 0, 0, 0) }),
    event({ id: "undated", createdAt: null }),
  ];
  const sameDay = filterAuditEvents(events, filters({ from: "2026-10-28", to: "2026-10-28" }), lookups);
  assert.deepEqual(sameDay.map((e) => e.id), ["start", "end"]);

  const unbounded = filterAuditEvents(events, filters(), lookups);
  assert.deepEqual(unbounded.map((e) => e.id), ["start", "end", "after", "undated"]);

  const openEnded = filterAuditEvents(events, filters({ from: "2026-10-29" }), lookups);
  assert.deepEqual(openEnded.map((e) => e.id), ["after"]);
});

test("sorting orders newest, oldest and largest without mutating the input", () => {
  const early = event({ id: "early", createdAt: new Date(2026, 9, 20, 8, 0), delta: 2 });
  const late = event({ id: "late", createdAt: new Date(2026, 9, 27, 8, 0), delta: -9 });
  const middle = event({ id: "middle", createdAt: new Date(2026, 9, 24, 8, 0), delta: 5 });
  const undated = event({ id: "undated", createdAt: null, delta: 1 });
  const input = [early, undated, late, middle];

  assert.deepEqual(sortAuditEvents(input, "newest").map((e) => e.id), ["late", "middle", "early", "undated"]);
  assert.deepEqual(sortAuditEvents(input, "oldest").map((e) => e.id), ["early", "middle", "late", "undated"]);
  assert.deepEqual(sortAuditEvents(input, "largest").map((e) => e.id), ["late", "middle", "early", "undated"]);
  assert.deepEqual(input.map((e) => e.id), ["early", "undated", "late", "middle"]);
});

test("summary totals both directions and the net change", () => {
  const summary = auditSummary([
    event({ id: "a", delta: 5 }),
    event({ id: "b", delta: -3 }),
    event({ id: "c", delta: 2 }),
  ]);
  assert.deepEqual(summary, { count: 3, unitsIn: 7, unitsOut: 3, net: 4 });
  assert.deepEqual(auditSummary([]), { count: 0, unitsIn: 0, unitsOut: 0, net: 0 });
});

test("events group by local day in arrival order with per-day totals", () => {
  const groups = groupAuditEventsByDay([
    event({ id: "a", createdAt: new Date(2026, 9, 28, 18, 0), delta: 4 }),
    event({ id: "b", createdAt: new Date(2026, 9, 28, 9, 0), delta: -1 }),
    event({ id: "c", createdAt: new Date(2026, 9, 27, 9, 0), delta: 2 }),
    event({ id: "d", createdAt: null, delta: -7 }),
  ]);
  assert.deepEqual(groups.map((g) => g.key), ["2026-10-28", "2026-10-27", ""]);
  assert.deepEqual(groups[0].events.map((e) => e.id), ["a", "b"]);
  assert.equal(groups[0].unitsIn, 4);
  assert.equal(groups[0].unitsOut, 1);
  assert.equal(groups[2].unitsOut, 7);
  assert.equal(groups[2].date, null);
});

test("localDayKey reads the local calendar day", () => {
  assert.equal(localDayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(auditFileName(new Date(2026, 9, 28, 1, 2)), "audit-2026-10-28.csv");
});

test("CSV escapes text, guards formulas and leaves numbers alone", () => {
  const csv = auditCsv([
    event({
      id: "a",
      productId: "p1",
      variantLabel: 'Crna, "velika"',
      delta: -3,
      actorName: "=HYPERLINK(\"http://evil\")",
      createdAt: new Date(2026, 9, 28, 9, 5, 7),
    }),
    event({ id: "b", productId: "p2", variantLabel: "Novi\nred", delta: 12, actorName: "Ana" }),
  ], {
    labels: { date: "Vreme", product: "Artikal", variant: "Varijanta", type: "Tip", change: "Promena", staff: "Zaposleni" },
    productName: (id) => (id === "p1" ? "Čaj" : "Kafa"),
    reasonLabel: () => "Korekcija",
  });

  const rows = csv.split("\r\n");
  assert.equal(rows[0], "Vreme,Artikal,Varijanta,Tip,Promena,Zaposleni");
  assert.equal(rows[1], '2026-10-28 09:05:07,Čaj,"Crna, ""velika""",Korekcija,-3,"\'=HYPERLINK(""http://evil"")"');
  assert.equal(rows[2], '2026-10-28 12:00:00,Kafa,"Novi\nred",Korekcija,12,Ana');
  assert.equal(rows.length, 3);
  assert.ok(!csv.startsWith("\ufeff"));
});

test("relative time picks the right unit for the distance", () => {
  const now = new Date(2026, 9, 28, 12, 0, 0);
  const seconds = auditRelativeTime(new Date(now.getTime() - 30_000), "en-US", now);
  assert.match(seconds, /30/);
  assert.match(seconds, /sec/);

  const minutes = auditRelativeTime(new Date(now.getTime() - 30 * 60_000), "en-US", now);
  assert.match(minutes, /30/);
  assert.match(minutes, /min/);

  const hours = auditRelativeTime(new Date(now.getTime() - 5 * 3_600_000), "en-US", now);
  assert.match(hours, /5/);
  assert.match(hours, /hr|hour/);

  const days = auditRelativeTime(new Date(now.getTime() - 3 * 86_400_000), "en-US", now);
  assert.match(days, /3/);
  assert.match(days, /day/);

  const months = auditRelativeTime(new Date(now.getTime() - 45 * 86_400_000), "en-US", now);
  assert.match(months, /mo/);

  const future = auditRelativeTime(new Date(now.getTime() + 2 * 3_600_000), "en-US", now);
  assert.match(future, /in\s+2/);
});

test("the reason list covers every stored type", () => {
  assert.deepEqual(AUDIT_REASONS, ["receipt", "adjustment", "sale", "return", "correction"]);
});

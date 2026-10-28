import assert from "node:assert/strict";
import { test } from "node:test";
import { buildClientError, pathOnly, sanitizeMonitorReport } from "../lib/client-errors.ts";

test("pathOnly keeps a pathname and drops query strings and hashes", () => {
  assert.equal(pathOnly("/catalog/shop-1?token=abc#top"), "/catalog/shop-1");
  assert.equal(pathOnly("/dashboard/orders"), "/dashboard/orders");
  assert.equal(pathOnly(""), "/");
  assert.equal(pathOnly(undefined), "/");
  assert.equal(pathOnly(42), "/");
});

test("pathOnly refuses absolute and protocol-relative URLs", () => {
  assert.equal(pathOnly("https://evil.example/steal?token=1"), "/");
  assert.equal(pathOnly("//evil.example/steal"), "/");
  assert.equal(pathOnly("javascript:alert(1)"), "/");
});

test("buildClientError strips tokens from messages and stacks", () => {
  const error = new Error("Request to /api/catalog/shop-1/orders?email=a@b.com&token=secret failed");
  error.stack = `${error.name}: ${error.message}\n    at load (/catalog/shop-1?invite=abc:12:5)`;
  const payload = buildClientError(error, "boundary", "/catalog/shop-1?invite=abc", "sr", "digest-1");

  assert.equal(payload.source, "boundary");
  assert.equal(payload.path, "/catalog/shop-1");
  assert.equal(payload.locale, "sr");
  assert.equal(payload.digest, "digest-1");
  assert.match(payload.message, /\/api\/catalog\/shop-1\/orders/);
  assert.doesNotMatch(payload.message, /token|email|secret/);
  assert.ok(payload.stack);
  assert.doesNotMatch(payload.stack, /invite=abc/);
});

test("buildClientError handles non-Error rejections", () => {
  assert.equal(buildClientError("plain failure", "rejection", "/", "en").message, "plain failure");
  assert.equal(buildClientError({ reason: "x" }, "rejection", "/", "en").message, '{"reason":"x"}');
  assert.equal(buildClientError(null, "window", "/", "en").message, "Unknown error");
});

test("sanitizeMonitorReport rejects junk and normalizes unknown sources", () => {
  assert.equal(sanitizeMonitorReport(null), null);
  assert.equal(sanitizeMonitorReport("text"), null);
  assert.equal(sanitizeMonitorReport({}), null);
  assert.equal(sanitizeMonitorReport({ message: "   " }), null);

  const report = sanitizeMonitorReport({
    message: "boom",
    name: "TypeError",
    source: "not-a-source",
    path: "https://evil.example/x?token=1",
    locale: "de-DE",
    extra: "ignored",
  });
  assert.ok(report);
  assert.equal(report.event, "client-error");
  assert.equal(report.source, "window");
  assert.equal(report.path, "/");
  assert.equal(report.locale, "de-DE");
  assert.equal("extra" in report, false);
});

test("sanitizeMonitorReport caps runaway strings", () => {
  const report = sanitizeMonitorReport({ message: "m".repeat(2_000), stack: "s".repeat(9_000) });
  assert.ok(report);
  assert.equal(report.message.length, 500);
  assert.equal(report.stack?.length, 3_000);
});

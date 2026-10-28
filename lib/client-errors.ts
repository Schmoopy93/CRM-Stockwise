/**
 * Client-side error reporting without a third-party service.
 *
 * Reports are posted to `/api/monitor`, which writes them as structured JSON to
 * the server log, so the host's log viewer is the single place to look for
 * client failures. Only production builds report: in development the overlay
 * and console already show the error, and posting would only add noise.
 *
 * Payloads carry a pathname, never a query string, and every string is stripped
 * of query strings before it leaves the browser: invitation links, catalog
 * shares and email-link sign-ins all carry tokens in the query.
 */

export type ClientErrorSource = "boundary" | "global-boundary" | "window" | "rejection";

export interface ClientErrorPayload {
  source: ClientErrorSource;
  message: string;
  name: string;
  stack?: string;
  digest?: string;
  path: string;
  locale: string;
}

export interface MonitorReport extends ClientErrorPayload {
  event: "client-error";
}

const SOURCES: ClientErrorSource[] = ["boundary", "global-boundary", "window", "rejection"];
const MESSAGE_LIMIT = 500;
const STACK_LIMIT = 3_000;
const NAME_LIMIT = 80;
const DIGEST_LIMIT = 128;
const PATH_LIMIT = 200;
const LOCALE_LIMIT = 8;

const DEDUPE_MS = 30_000;
const MAX_PER_MINUTE = 5;
const MAX_SIGNATURES = 50;

const ORIGIN = "https://logixia.invalid";

/** Drops query strings from URL-like fragments. Tokens live in the query, and
 * error messages and stacks routinely echo the URL that failed. */
function stripQueryStrings(value: string) {
  return value.replace(/\?[^\s"'`)]*/g, "");
}

function clean(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = stripQueryStrings(value).trim();
  return trimmed ? trimmed.slice(0, limit) : undefined;
}

/** Reduces any value to the pathname of a same-origin path, so a crafted report
 * cannot smuggle an absolute URL, credentials or a query string into the log. */
export function pathOnly(value: unknown): string {
  if (typeof value !== "string" || !value) return "/";
  try {
    const url = new URL(value, ORIGIN);
    if (url.origin !== ORIGIN) return "/";
    return url.pathname.slice(0, PATH_LIMIT) || "/";
  } catch {
    return "/";
  }
}

function errorName(error: unknown) {
  if (error instanceof Error && error.name) return error.name;
  if (typeof error === "string") return "Error";
  return "UnknownError";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  if (error === null || error === undefined) return "Unknown error";
  try {
    const json = JSON.stringify(error);
    if (json && json !== "{}") return json;
  } catch {
    // Circular values fall through to the generic text.
  }
  return "Unknown error";
}

export function buildClientError(
  error: unknown,
  source: ClientErrorSource,
  path: string,
  locale: string,
  digest?: string
): ClientErrorPayload {
  const stack = error instanceof Error && typeof error.stack === "string"
    ? clean(error.stack, STACK_LIMIT)
    : undefined;
  return {
    source,
    name: clean(errorName(error), NAME_LIMIT) ?? "Error",
    message: clean(errorMessage(error), MESSAGE_LIMIT) ?? "Unknown error",
    ...(stack ? { stack } : {}),
    ...(digest ? { digest: digest.slice(0, DIGEST_LIMIT) } : {}),
    path: pathOnly(path),
    locale: clean(locale, LOCALE_LIMIT) ?? "unknown",
  };
}

/** Validates a request body before it is logged. Anything the browser did not
 * send is dropped, so a forged POST cannot write arbitrary fields into logs. */
export function sanitizeMonitorReport(value: unknown): MonitorReport | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const message = clean(body.message, MESSAGE_LIMIT);
  if (!message) return null;
  const source = SOURCES.includes(body.source as ClientErrorSource)
    ? (body.source as ClientErrorSource)
    : "window";
  const stack = clean(body.stack, STACK_LIMIT);
  const digest = clean(body.digest, DIGEST_LIMIT);
  return {
    event: "client-error",
    source,
    name: clean(body.name, NAME_LIMIT) ?? "Error",
    message,
    ...(stack ? { stack } : {}),
    ...(digest ? { digest } : {}),
    path: pathOnly(body.path),
    locale: clean(body.locale, LOCALE_LIMIT) ?? "unknown",
  };
}

interface SendState {
  timestamps: number[];
  signatures: Map<string, number>;
}

const sendState: SendState = { timestamps: [], signatures: new Map() };

function withinBudget(now: number) {
  if (sendState.signatures.size > MAX_SIGNATURES) {
    for (const [signature, at] of sendState.signatures) {
      if (now - at >= DEDUPE_MS) sendState.signatures.delete(signature);
    }
  }
  sendState.timestamps = sendState.timestamps.filter((at) => now - at < 60_000);
  return sendState.timestamps.length < MAX_PER_MINUTE;
}

function send(payload: ClientErrorPayload) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon("/api/monitor", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // sendBeacon can throw when the page is being torn down; fetch still runs.
  }
  void fetch("/api/monitor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // A failed report must not surface as another error.
  });
}

export function reportClientError(error: unknown, source: ClientErrorSource, digest?: string) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  const payload = buildClientError(
    error,
    source,
    window.location.pathname,
    document.documentElement.lang || "sr",
    digest
  );
  const now = Date.now();
  // React can surface the same render failure through the boundary and the
  // window error event; one log entry per failure is enough.
  const signature = `${payload.source}|${payload.name}|${payload.message}|${payload.path}`;
  const last = sendState.signatures.get(signature);
  if (last !== undefined && now - last < DEDUPE_MS) return;
  if (!withinBudget(now)) return;
  sendState.signatures.set(signature, now);
  sendState.timestamps.push(now);
  send(payload);
}

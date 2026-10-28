import type { NextRequest } from "next/server";
import { sanitizeMonitorReport } from "@/lib/client-errors";
import { consumeRateLimit } from "@/lib/rate-limit";

/** Sink for browser error reports. The host's log viewer is the store: each
 * report is one JSON line, so failures can be grouped by message or path
 * without adding an analytics vendor (and without a tracking cookie). */

const MAX_BODY_BYTES = 8 * 1024;
const IP_LIMIT = 20;

function noContent() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

function clientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  try {
    if (!(await consumeRateLimit(`monitor:${clientIp(request)}`, IP_LIMIT))) return noContent();
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return noContent();
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_BYTES) return noContent();
    const report = sanitizeMonitorReport(JSON.parse(raw));
    if (report) console.error(JSON.stringify({ ...report, ip: clientIp(request) }));
  } catch {
    // Monitoring must never turn into a second failure for the reporting page.
  }
  return noContent();
}

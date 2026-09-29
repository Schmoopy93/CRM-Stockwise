import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_HEADER } from "@/lib/seo";

const SUPPORTED = ["sr", "en", "ru", "de", "es", "it"];

/**
 * Resolves the visitor's language from `?lang=` (falling back to `Accept-Language`)
 * and forwards it as a request header. Layouts cannot read searchParams, so this
 * is what lets the root layout render `<html lang>` and localized metadata on the
 * server instead of after hydration.
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const fromQuery =
    url.searchParams.get("lang")?.toLowerCase().split("-")[0] ?? "";
  const fromHeader = request.headers.get("accept-language") ?? "";

  let locale = SUPPORTED.includes(fromQuery) ? fromQuery : "";
  if (!locale) {
    const preferred = fromHeader
      .split(",")
      .map((part) => {
        const [tag, q] = part.trim().split(";q=");
        return { tag: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
      })
      .sort((a, b) => b.q - a.q);
    locale = preferred.find((p) => SUPPORTED.includes(p.tag))?.tag ?? "sr";
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Skip Next internals, API routes, static assets and Firebase rewrites.
  matcher: ["/((?!_next|api|favicon.ico|manifest.json|.*\\..*).*)"],
};

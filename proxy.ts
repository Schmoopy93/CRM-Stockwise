import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, LOCALE_HEADER } from "@/lib/seo";

const SUPPORTED = ["sr", "en", "ru", "de", "es", "it"];
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Resolves the visitor's language from `?lang=` (falling back to the saved
 * language cookie, then Serbian) and forwards it as a request header. Layouts
 * cannot read searchParams, so this is what lets the root layout render
 * `<html lang>` and localized metadata on the server instead of after hydration.
 */
export function proxy(request: NextRequest) {
  const fromQuery =
    request.nextUrl.searchParams.get("lang")?.toLowerCase().split("-")[0] ?? "";
  const fromCookie = request.cookies.get(LOCALE_COOKIE)?.value ?? "";

  const locale = SUPPORTED.includes(fromQuery)
    ? fromQuery
    : SUPPORTED.includes(fromCookie)
      ? fromCookie
      : "sr";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (locale === fromQuery && locale !== fromCookie) {
    response.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
  }
  return response;
}

export const config = {
  // Skip Next internals, API routes, static assets and Firebase rewrites.
  matcher: ["/((?!_next|api|favicon.ico|manifest.json|.*\\..*).*)"],
};

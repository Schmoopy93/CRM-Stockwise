import { BASE_CURRENCY, EMPTY_RATES, type ExchangeRates } from "@/lib/currency";

/** Free daily rates, no API key. Chosen over the ECB feed because the ECB
 * publishes no reference rate for RSD, and the Balkans are this app's market.
 * Swap this URL and the response shape together if the provider changes. */
const RATE_SOURCE = "https://open.er-api.com/v6/latest/EUR";

/** Reference rates move once a business day, so an hour of caching is well
 * inside the noise and keeps the provider free to serve. */
const REVALIDATE_SECONDS = 60 * 60;

interface RateProviderPayload {
  result?: string;
  base_code?: string;
  time_last_update_utc?: string;
  rates?: Record<string, unknown>;
}

/** Only finite positive numbers are kept: a malformed entry must not become a
 * price of `NaN` at the far end. */
function sanitizeRates(raw: Record<string, unknown> | undefined): Record<string, number> {
  const rates: Record<string, number> = { [BASE_CURRENCY]: 1 };
  for (const [code, value] of Object.entries(raw ?? {})) {
    if (/^[A-Z]{3}$/.test(code) && typeof value === "number" && Number.isFinite(value) && value > 0) {
      rates[code] = value;
    }
  }
  return rates;
}

/** Server-side only. A provider failure resolves to an empty table instead of
 * throwing: prices then render in the base currency, which is the number that
 * was actually stored. `date` stays empty so the UI can say the rate is
 * unavailable rather than imply a fresh one. */
export async function fetchExchangeRates(): Promise<ExchangeRates> {
  try {
    const response = await fetch(RATE_SOURCE, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!response.ok) throw new Error(`RATE_SOURCE_HTTP_${response.status}`);
    const payload = (await response.json()) as RateProviderPayload;
    if (payload.result !== "success" || !payload.rates) throw new Error("RATE_SOURCE_MALFORMED");
    const updatedAt = new Date(payload.time_last_update_utc ?? "");
    return {
      base: payload.base_code ?? BASE_CURRENCY,
      date: Number.isNaN(updatedAt.getTime()) ? "" : updatedAt.toISOString().slice(0, 10),
      rates: sanitizeRates(payload.rates),
    };
  } catch {
    return EMPTY_RATES;
  }
}

/** Prices are always stored in one base currency and converted at render time.
 * Nothing here writes a converted number back to a product, so a rate change
 * never rewrites what the shop recorded — only how it reads today.
 *
 * Rates come from a single free daily feed (see `app/api/rates/route.ts`), which
 * is proxied rather than called from the browser so the whole app shares one
 * cached copy. The ECB publishes no reference rate for RSD, which is why this is
 * not the ECB feed. */

export const BASE_CURRENCY = "EUR";

export interface CurrencyInfo {
  code: string;
  symbol: string;
  /** Currencies quoted without minor units (yen, won) round to whole units. */
  decimals: number;
}

/** Offered in the shop currency picker. The provider carries far more; these are
 * the ones a small shop plausibly trades in, with the Balkans first. */
const CURRENCY_LIST: CurrencyInfo[] = [
  { code: "EUR", symbol: "€", decimals: 2 },
  { code: "RSD", symbol: "RSD", decimals: 2 },
  { code: "BAM", symbol: "KM", decimals: 2 },
  { code: "HRK", symbol: "kn", decimals: 2 },
  { code: "MKD", symbol: "ден", decimals: 2 },
  { code: "BGN", symbol: "лв", decimals: 2 },
  { code: "RON", symbol: "lei", decimals: 2 },
  { code: "TRY", symbol: "₺", decimals: 2 },
  { code: "RUB", symbol: "₽", decimals: 2 },
  { code: "UAH", symbol: "₴", decimals: 2 },
  { code: "PLN", symbol: "zł", decimals: 2 },
  { code: "CZK", symbol: "Kč", decimals: 2 },
  { code: "HUF", symbol: "Ft", decimals: 0 },
  { code: "SEK", symbol: "kr", decimals: 2 },
  { code: "NOK", symbol: "kr", decimals: 2 },
  { code: "DKK", symbol: "kr", decimals: 2 },
  { code: "CHF", symbol: "CHF", decimals: 2 },
  { code: "GBP", symbol: "£", decimals: 2 },
  { code: "USD", symbol: "$", decimals: 2 },
  { code: "CAD", symbol: "CA$", decimals: 2 },
  { code: "AUD", symbol: "A$", decimals: 2 },
  { code: "AED", symbol: "AED", decimals: 2 },
  { code: "INR", symbol: "₹", decimals: 2 },
  { code: "CNY", symbol: "¥", decimals: 2 },
  { code: "JPY", symbol: "¥", decimals: 0 },
  { code: "KRW", symbol: "₩", decimals: 0 },
];

const CURRENCY_BY_CODE = new Map(CURRENCY_LIST.map((currency) => [currency.code, currency]));

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = CURRENCY_LIST;

export interface ExchangeRates {
  base: string;
  /** ISO date the provider published, or "" when the feed could not be read. */
  date: string;
  rates: Record<string, number>;
}

export const EMPTY_RATES: ExchangeRates = { base: BASE_CURRENCY, date: "", rates: { [BASE_CURRENCY]: 1 } };

export function isSupportedCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

/** Unknown codes still format — `Intl` renders them as the code itself — so a
 * rate feed that adds a currency does not need a release to display. */
export function currencyInfo(code: string): CurrencyInfo {
  return CURRENCY_BY_CODE.get(code) ?? { code, symbol: code, decimals: 2 };
}

export function hasRate(code: string, rates: ExchangeRates | null | undefined) {
  if (code === BASE_CURRENCY) return true;
  const rate = rates?.rates?.[code];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
}

/** Converts an amount already expressed in the base currency.
 *
 * An unknown rate returns the input untouched rather than guessing: showing a
 * price in the wrong currency is worse than showing it in the base one, which
 * is what every number in the app has meant until now. */
export function convert(amount: number, code: string, rates: ExchangeRates | null | undefined): number {
  if (!Number.isFinite(amount)) return 0;
  if (code === BASE_CURRENCY) return amount;
  const rate = rates?.rates?.[code];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return amount;
  return roundForCurrency(amount * rate, code);
}

/** Rounds to the precision the currency is actually quoted in, so a converted
 * price never shows a stray cent in yen and keeps its value in dinars. */
export function roundForCurrency(value: number, code: string) {
  const { decimals } = currencyInfo(code);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface MoneyFormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/** What a view needs to read a base-currency amount in the shop's currency.
 * Passed down instead of a bare currency code so no component has to remember
 * to convert before formatting, which is the easy mistake to make. */
export interface PriceTools {
  currency: string;
  money: (amount: number, options?: MoneyFormatOptions) => string;
  toCurrency: (amount: number) => number;
}

export function formatMoney(
  value: number,
  intlLocale: string,
  code: string,
  options: MoneyFormatOptions = {}
) {
  const { decimals } = currencyInfo(code);
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const maximumFractionDigits = options.maximumFractionDigits ?? decimals;
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: code,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(value);
  } catch {
    // Deliberately locale-free: a bad locale is one of the reasons this branch
    // runs, so routing through toLocaleString again would just rethrow.
    return `${value.toFixed(decimals)} ${currencyInfo(code).symbol}`;
  }
}

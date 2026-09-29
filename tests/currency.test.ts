import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_CURRENCY,
  convert,
  currencyInfo,
  EMPTY_RATES,
  formatMoney,
  hasRate,
  isSupportedCurrency,
  roundForCurrency,
  SUPPORTED_CURRENCIES,
} from "../lib/currency.ts";

// A small table standing in for the live feed. Rates are quoted against EUR.
const RATES = {
  base: "EUR",
  date: "2026-09-29",
  rates: { EUR: 1, RSD: 117.517144, USD: 1.137347, JPY: 178.990929 },
};

test("only three-letter uppercase codes are accepted", () => {
  assert.equal(isSupportedCurrency("EUR"), true);
  assert.equal(isSupportedCurrency("rsd"), false);
  assert.equal(isSupportedCurrency("RSD "), false);
  assert.equal(isSupportedCurrency("EU"), false);
  assert.equal(isSupportedCurrency("EURO"), false);
  assert.equal(isSupportedCurrency(""), false);
  assert.equal(isSupportedCurrency(undefined), false);
  assert.equal(isSupportedCurrency(117), false);
  // This is a shape check, not a membership check: it mirrors the Firestore
  // rule, which cannot know the offered list. A well-formed code the feed does
  // not carry still renders, so a new currency needs no release to appear.
  assert.equal(isSupportedCurrency("DIN"), true);
  assert.equal(isSupportedCurrency("ZWG"), true);
  assert.equal(SUPPORTED_CURRENCIES.some((currency) => currency.code === "DIN"), false);
});

test("the offered currency list has no duplicates", () => {
  const codes = SUPPORTED_CURRENCIES.map((currency) => currency.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every((code) => isSupportedCurrency(code)));
  assert.ok(codes.includes(BASE_CURRENCY));
});

test("conversion multiplies by the rate and rounds to the currency", () => {
  assert.equal(convert(1, "RSD", RATES), 117.52);
  assert.equal(convert(2.5, "RSD", RATES), 293.79);
  assert.equal(convert(10, "USD", RATES), 11.37);
  // Yen has no minor units, so the fraction is dropped rather than shown.
  assert.equal(convert(10, "JPY", RATES), 1790);
});

test("the base currency is a no-op", () => {
  assert.equal(convert(12.345, "EUR", RATES), 12.345);
  assert.equal(convert(12.345, "EUR", EMPTY_RATES), 12.345);
  assert.equal(convert(12.345, "EUR", null), 12.345);
});

test("a missing or unusable rate leaves the stored amount alone", () => {
  // Showing the base amount is honest; showing a guessed converted one is not.
  assert.equal(convert(25, "GBP", RATES), 25);
  assert.equal(convert(25, "GBP", EMPTY_RATES), 25);
  assert.equal(convert(25, "GBP", null), 25);
  assert.equal(convert(25, "RSD", { base: "EUR", date: "", rates: { RSD: 0 } }), 25);
  assert.equal(convert(25, "RSD", { base: "EUR", date: "", rates: { RSD: -1 } }), 25);
  assert.equal(convert(25, "RSD", { base: "EUR", date: "", rates: { RSD: Number.NaN } }), 25);
  assert.equal(convert(25, "RSD", { base: "EUR", date: "", rates: { RSD: Number.POSITIVE_INFINITY } }), 25);
});

test("non-finite amounts never leak into a price", () => {
  assert.equal(convert(Number.NaN, "RSD", RATES), 0);
  assert.equal(convert(Number.POSITIVE_INFINITY, "RSD", RATES), 0);
  assert.equal(convert(undefined as unknown as number, "RSD", RATES), 0);
});

test("hasRate reports whether a conversion is possible", () => {
  assert.equal(hasRate("EUR", EMPTY_RATES), true, "the base always converts");
  assert.equal(hasRate("RSD", RATES), true);
  assert.equal(hasRate("GBP", RATES), false);
  assert.equal(hasRate("RSD", null), false);
});

test("unknown currencies still carry a sane shape", () => {
  const info = currencyInfo("ZWG");
  assert.equal(info.code, "ZWG");
  assert.equal(info.decimals, 2);
  assert.equal(currencyInfo("JPY").decimals, 0);
});

test("rounding follows the precision the currency is quoted in", () => {
  assert.equal(roundForCurrency(1.006, "RSD"), 1.01);
  assert.equal(roundForCurrency(1.0049, "RSD"), 1);
  assert.equal(roundForCurrency(178.6, "JPY"), 179);
  assert.equal(roundForCurrency(178.4, "JPY"), 178);
  // Scaled-integer half-up, the same convention as orderTotal. Exact binary
  // halves such as 2.675 are deliberately not asserted: no scaled-integer
  // rounding can promise a decimal tie, and the app does not rely on one.
  assert.equal(roundForCurrency(2.67, "EUR"), 2.67);
  assert.equal(roundForCurrency(2.674, "EUR"), 2.67);
});

test("formatting produces a localized currency string", () => {
  const dinar = formatMoney(117.52, "sr-RS", "RSD");
  assert.ok(dinar.includes("RSD"), dinar);
  assert.ok(dinar.includes("117"), dinar);

  const euro = formatMoney(10, "de-DE", "EUR");
  assert.ok(euro.includes("10"), euro);
});

test("formatting falls back rather than throwing on a bad locale", () => {
  const formatted = formatMoney(5, "not a locale", "USD");
  assert.ok(formatted.includes("5"), formatted);
});

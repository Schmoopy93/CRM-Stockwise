import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { MENU_KEYS, localizedMenuNames } from "../lib/menu-names.ts";
import type { AppLocale } from "../lib/types.ts";

// The dictionaries are read with require rather than an import attribute so this
// file runs both under node --experimental-strip-types and inside the app build.
const require = createRequire(import.meta.url);
const LOCALES: AppLocale[] = ["sr", "en", "ru", "de", "es", "it"];
const dictionaries = Object.fromEntries(
  LOCALES.map((locale) => [locale, require(`../lib/i18n/${locale}.json`) as Record<string, string>]),
) as Record<AppLocale, Record<string, string>>;

test("every menu label the assistant quotes is translated in all six languages", () => {
  for (const locale of LOCALES) {
    for (const { english, key } of MENU_KEYS) {
      const label = dictionaries[locale][key];
      assert.equal(typeof label, "string", `${locale} is missing ${key} ("${english}")`);
      assert.notEqual(label.trim(), "", `${locale} has an empty ${key}`);
    }
  }
});

test("the quoted labels are the ones the app shows, not the guide's English names", () => {
  const serbian = localizedMenuNames("sr", dictionaries);
  assert.ok(serbian.includes('All Products = "Svi artikli"'), serbian);
  assert.ok(serbian.includes('New product = "Novi artikal"'), serbian);
  assert.ok(serbian.includes('Sales = "Prodaja"'), serbian);
  assert.ok(serbian.includes('Public catalog = "Javni katalog"'), serbian);
  // Every label is quoted, so the model has nothing to guess from.
  assert.equal(serbian.split('"').length - 1, MENU_KEYS.length * 2);
});

test("the German list is German, so the names follow the answer language", () => {
  const german = localizedMenuNames("de", dictionaries);
  assert.ok(german.includes('Sales = "Verkäufe"'), german);
  assert.equal(german.includes('"Prodaja"'), false);
});

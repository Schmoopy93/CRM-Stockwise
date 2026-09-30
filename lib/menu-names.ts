import type { AppLocale } from "@/lib/types";

/**
 * The English name the assistant's guide uses for each screen, paired with the
 * translation key that actually labels it. The model used to translate those
 * English names itself and invent menu names the app does not have, so every
 * "how do I" answer pointed at menus that were nowhere in the UI.
 */
export const MENU_KEYS: Array<{ english: string; key: string }> = [
  { english: "New store", key: "login.ctaNew" },
  { english: "Join Store", key: "auth.joinShop" },
  { english: "Shop ID", key: "user.shopId" },
  { english: "All Products", key: "nav.products" },
  { english: "New product", key: "product.newTitle" },
  { english: "Suggest fields", key: "product.suggestFields" },
  { english: "Manage categories", key: "categories.manage" },
  { english: "Receive Goods", key: "nav.receive" },
  { english: "Sales", key: "nav.sales" },
  { english: "Orders", key: "nav.orders" },
  { english: "Overview", key: "nav.overview" },
  { english: "Public catalog", key: "catalog.settingsTitle" },
  { english: "Analytics", key: "nav.analytics" },
  { english: "Audit log", key: "nav.audit" },
  { english: "Import Products", key: "nav.import" },
  { english: "Export", key: "nav.export" },
];

/**
 * Renders the label list for one language. Falls back to the English name so a
 * missing translation yields a usable label rather than an empty one; the
 * menu-name test asserts none of them is actually missing.
 */
export function localizedMenuNames(
  locale: AppLocale,
  dictionaries: Record<AppLocale, Record<string, string>>,
): string {
  return MENU_KEYS
    .map(({ english, key }) => english + ' = "' + (dictionaries[locale][key] || english) + '"')
    .join(", ");
}

/**
 * The paragraph that hands those labels to the assistant. It has to live in the
 * same system message as the rest of the instructions: a second system message
 * displaced the style rules, and the answers came back long, bulleted and slow.
 */
export function localizedMenuGuide(
  locale: AppLocale,
  dictionaries: Record<AppLocale, Record<string, string>>,
): string {
  return "\n\nHow the app's menus are labelled in the answer language — use these names exactly, never your own translation of a menu name: "
    + localizedMenuNames(locale, dictionaries) + ".";
}

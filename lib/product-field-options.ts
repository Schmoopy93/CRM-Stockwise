import { AppLocale, ProductCustomField } from "@/lib/types";

export function getLocalizedOptionValue(
  field: ProductCustomField,
  value: string,
  locale: AppLocale
): string {
  const stableOptions = field.optionValues ?? field.optionsByLocale?.en ?? field.options ?? [];
  const stableIndex = stableOptions.indexOf(value);
  if (stableIndex >= 0) {
    return field.optionsByLocale?.[locale]?.[stableIndex] ?? field.options?.[stableIndex] ?? value;
  }

  // Older saved products stored the visible option text as the value.
  for (const language of [locale, "sr", "en", "ru", "de", "es", "it"] as const) {
    const index = field.optionsByLocale?.[language]?.indexOf(value) ?? -1;
    if (index >= 0) return field.optionsByLocale?.[locale]?.[index] ?? value;
  }
  return value;
}

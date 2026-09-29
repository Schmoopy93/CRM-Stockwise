import { AppLocale, ProductCustomField, ProductCustomFieldType } from "@/lib/types";

type LocalizedText = Record<AppLocale, string>;

interface FieldTemplate {
  key: string;
  label: LocalizedText;
  type: ProductCustomFieldType;
  required?: boolean;
  options?: LocalizedText[];
}

const field = (
  key: string,
  label: LocalizedText,
  type: ProductCustomFieldType = "text",
  options?: LocalizedText[]
): FieldTemplate => ({ key, label, type, ...(options ? { options } : {}) });

const choices = (...values: Array<[string, string, string]>): LocalizedText[] =>
  values.map(([sr, en, ru]) => ({ sr, en, ru }));

const cyrillicToLatin: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "dj", е: "e", ж: "zh", з: "z", и: "i", ј: "j",
  к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t",
  ћ: "c", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", џ: "dzh", ш: "sh",
  ё: "yo", й: "y", ы: "y", э: "e", ю: "yu", я: "ya", ъ: "", ь: "",
};

function normalize(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[а-яёђжљњћџшчц]/g, (character) => cyrillicToLatin[character] ?? character)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const phoneFields: FieldTemplate[] = [
  field("brand", { sr: "Brend", en: "Brand", ru: "Бренд" }),
  field("model", { sr: "Model", en: "Model", ru: "Модель" }),
  field("storage", { sr: "Memorija", en: "Storage", ru: "Память" }, "select", choices(
    ["64 GB", "64 GB", "64 ГБ"], ["128 GB", "128 GB", "128 ГБ"], ["256 GB", "256 GB", "256 ГБ"],
    ["512 GB", "512 GB", "512 ГБ"], ["1 TB", "1 TB", "1 ТБ"]
  )),
  field("color", { sr: "Boja", en: "Color", ru: "Цвет" }),
  field("condition", { sr: "Stanje uređaja", en: "Device condition", ru: "Состояние устройства" }, "select", choices(
    ["Novo", "New", "Новое"], ["Kao novo", "Like new", "Как новое"], ["Polovno", "Used", "Б/у"]
  )),
  field("battery_health", { sr: "Kapacitet baterije (%)", en: "Battery health (%)", ru: "Состояние батареи (%)" }, "number"),
];

const clothingFields: FieldTemplate[] = [
  field("brand", { sr: "Brend", en: "Brand", ru: "Бренд" }),
  field("size", { sr: "Veličina", en: "Size", ru: "Размер" }, "select", choices(
    ["XS", "XS", "XS"], ["S", "S", "S"], ["M", "M", "M"], ["L", "L", "L"], ["XL", "XL", "XL"],
    ["XXL", "XXL", "XXL"], ["Univerzalna", "One size", "Универсальный"]
  )),
  field("color", { sr: "Boja", en: "Color", ru: "Цвет" }),
  field("material", { sr: "Materijal", en: "Material", ru: "Материал" }),
  field("condition", { sr: "Stanje", en: "Condition", ru: "Состояние" }, "select", choices(
    ["Novo", "New", "Новое"], ["Polovno", "Used", "Б/у"]
  )),
];

const perfumeFields: FieldTemplate[] = [
  field("brand", { sr: "Brend", en: "Brand", ru: "Бренд" }),
  field("volume", { sr: "Zapremina (ml)", en: "Volume (ml)", ru: "Объём (мл)" }, "number"),
  field("concentration", { sr: "Koncentracija", en: "Concentration", ru: "Концентрация" }, "select", choices(
    ["Parfum", "Parfum", "Parfum"], ["Eau de Parfum", "Eau de Parfum", "Eau de Parfum"],
    ["Eau de Toilette", "Eau de Toilette", "Eau de Toilette"], ["Eau de Cologne", "Eau de Cologne", "Eau de Cologne"]
  )),
  field("package_condition", { sr: "Stanje pakovanja", en: "Packaging condition", ru: "Состояние упаковки" }, "select", choices(
    ["Zapečaćeno", "Sealed", "Запечатан"], ["Otvoreno", "Opened", "Открыт"], ["Tester", "Tester", "Тестер"]
  )),
  field("scent_family", { sr: "Mirisna porodica", en: "Fragrance family", ru: "Семейство аромата" }),
];

const glassesFields: FieldTemplate[] = [
  field("brand", { sr: "Brend", en: "Brand", ru: "Бренд" }),
  field("frame_color", { sr: "Boja okvira", en: "Frame color", ru: "Цвет оправы" }),
  field("frame_material", { sr: "Materijal okvira", en: "Frame material", ru: "Материал оправы" }),
  field("lens_type", { sr: "Tip stakala", en: "Lens type", ru: "Тип линз" }, "select", choices(
    ["Standardna", "Standard", "Стандартные"], ["Polarizovana", "Polarized", "Поляризационные"]
  )),
  field("uv_protection", { sr: "UV zaštita", en: "UV protection", ru: "Защита от ультрафиолета" }, "boolean"),
  field("frame_size", { sr: "Dimenzije okvira", en: "Frame dimensions", ru: "Размер оправы" }),
];

const cosmeticsFields: FieldTemplate[] = [
  field("brand", { sr: "Brend", en: "Brand", ru: "Бренд" }),
  field("volume_weight", { sr: "Zapremina / težina", en: "Volume / weight", ru: "Объём / вес" }),
  field("shade", { sr: "Nijansa", en: "Shade", ru: "Оттенок" }),
  field("skin_type", { sr: "Tip kože", en: "Skin type", ru: "Тип кожи" }),
  field("expiry_date", { sr: "Rok trajanja", en: "Expiry date", ru: "Срок годности" }, "date"),
  field("package_condition", { sr: "Stanje pakovanja", en: "Packaging condition", ru: "Состояние упаковки" }, "select", choices(
    ["Zapečaćeno", "Sealed", "Запечатано"], ["Otvoreno", "Opened", "Открыто"]
  )),
];

const accessoriesFields: FieldTemplate[] = [
  field("brand", { sr: "Brend", en: "Brand", ru: "Бренд" }),
  field("material", { sr: "Materijal", en: "Material", ru: "Материал" }),
  field("color", { sr: "Boja", en: "Color", ru: "Цвет" }),
  field("dimensions", { sr: "Dimenzije", en: "Dimensions", ru: "Размеры" }),
  field("condition", { sr: "Stanje", en: "Condition", ru: "Состояние" }, "select", choices(
    ["Novo", "New", "Новое"], ["Polovno", "Used", "Б/у"]
  )),
];

const foodFields: FieldTemplate[] = [
  field("expiry_date", { sr: "Rok trajanja", en: "Expiry date", ru: "Срок годности" }, "date"),
  field("batch", { sr: "Broj serije", en: "Batch number", ru: "Номер партии" }),
  field("manufacturer", { sr: "Proizvođač", en: "Manufacturer", ru: "Производитель" }),
  field("storage", { sr: "Uslovi čuvanja", en: "Storage instructions", ru: "Условия хранения" }),
];

const genericFields: FieldTemplate[] = [
  field("brand", { sr: "Brend", en: "Brand", ru: "Бренд" }),
  field("model", { sr: "Model", en: "Model", ru: "Модель" }),
  field("material", { sr: "Materijal", en: "Material", ru: "Материал" }),
  field("condition", { sr: "Stanje", en: "Condition", ru: "Состояние" }),
];

function matchCategory(text: string): FieldTemplate[] {
  if (/telefon|mobil|smartphone|smartfon|iphone|samsung|xiaomi|elektr|laptop|racunar|tehnika|telefony|mobilny|telefon|smartfon|iphone/.test(text)) return phoneFields;
  if (/parf|miris|fragrance|perfume|cologne|duhi|aromat/.test(text)) return perfumeFields;
  if (/naoc|suncan|optik|eyewear|sunglass|glasses|ochk|solncezashit/.test(text)) return glassesFields;
  if (/odec|odeca|obuca|tekstil|garderob|moda|majic|haljin|pantalon|dukser|patik|jakn|kosul|suknj|clothing|clothes|apparel|footwear|shoes|dress|shirt|jacket|odezh|obuv|platye|futbolk/.test(text)) return clothingFields;
  if (/nakit|akseso|aksess|torb|novcan|satovi|kais|jewelry|jewellery|accessor|handbag|wallet|watch|sumk|koshelek|chasy|ukrashen/.test(text)) return accessoriesFields;
  if (/kozmet|kosmet|nega|sminka|make.?up|serum|krema|cosmetic|skincare|beauty|uhod|makiyazh/.test(text)) return cosmeticsFields;
  if (/hrana|prehr|namir|pice|food|grocery|producty|pish|napit/.test(text)) return foodFields;
  return genericFields;
}

export function getProductFieldTemplate(category: string, name: string, locale: AppLocale): ProductCustomField[] {
  const text = normalize(`${category} ${name}`);
  return matchCategory(text).map((template, index) => {
    const optionsByLocale = template.options
      ? Object.fromEntries((Object.keys(template.label) as AppLocale[]).map((language) => [
        language,
        template.options!.map((option) => option[language]),
      ])) as Record<AppLocale, string[]>
      : undefined;
    return {
      key: template.key || `custom_${index + 1}`,
      label: template.label[locale],
      labels: template.label,
      type: template.type,
      required: template.required ?? false,
      ...(optionsByLocale ? {
        options: optionsByLocale[locale],
        optionValues: optionsByLocale.en,
        optionsByLocale,
      } : {}),
    };
  });
}

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
  for (const language of [locale, "sr", "en", "ru"] as const) {
    const index = field.optionsByLocale?.[language]?.indexOf(value) ?? -1;
    if (index >= 0) return field.optionsByLocale?.[locale]?.[index] ?? value;
  }
  return value;
}
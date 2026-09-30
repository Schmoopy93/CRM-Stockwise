import type { AppLocale, ProductCustomField, ProductCustomFieldType } from "@/lib/types";
import { consumeRateLimit } from "@/lib/rate-limit";
import { bearerToken, verifyFirebaseToken } from "@/lib/firebase-token";
const locales: AppLocale[] = ["sr", "en", "ru", "de", "es", "it"];
const allowedTypes = new Set<ProductCustomFieldType>(["text", "number", "date", "boolean", "select"]);

const localeNames: Record<AppLocale, string> = {
  sr: "Serbian (Latin script)", en: "English", ru: "Russian", de: "German", es: "Spanish", it: "Italian",
};

function parseLocale(value: unknown): AppLocale {
  return value === "en" || value === "ru" || value === "de" || value === "es" || value === "it" ? value : "sr";
}

function localizedMessage(locale: AppLocale, key: "login" | "session" | "limit" | "invalid" | "missing" | "ai") {
  const messages: Record<AppLocale, Record<typeof key, string>> = {
    sr: {
      login: "Potrebna je prijava.",
      session: "Sesija nije važeća.",
      limit: "Dostignut je limit predloga. Pokušajte ponovo za minut.",
      invalid: "Neispravan zahtev.",
      missing: "Unesite kategoriju ili naziv artikla.",
      ai: "AI trenutno nije dostupan. Pokušajte ponovo.",
    },
    en: {
      login: "Sign-in is required.",
      session: "Your session is invalid.",
      limit: "Suggestion limit reached. Please try again in a minute.",
      invalid: "Invalid request.",
      missing: "Enter a category or product name.",
      ai: "AI is temporarily unavailable. Please try again.",
    },
    ru: {
      login: "Необходимо войти в систему.",
      session: "Сеанс недействителен.",
      limit: "Достигнут лимит предложений. Повторите попытку через минуту.",
      invalid: "Некорректный запрос.",
      missing: "Укажите категорию или название товара.",
      ai: "AI временно недоступен. Повторите попытку.",
    },
    de: {
      login: "Anmeldung erforderlich.",
      session: "Ihre Sitzung ist ungültig.",
      limit: "Vorschlagslimit erreicht. Bitte in einer Minute erneut versuchen.",
      invalid: "Ungültige Anfrage.",
      missing: "Geben Sie eine Kategorie oder einen Produktnamen ein.",
      ai: "KI ist derzeit nicht verfügbar. Bitte versuchen Sie es erneut.",
    },
    es: {
      login: "Se requiere iniciar sesión.",
      session: "Su sesión no es válida.",
      limit: "Límite de sugerencias alcanzado. Inténtelo de nuevo en un minuto.",
      invalid: "Solicitud no válida.",
      missing: "Introduzca una categoría o el nombre del producto.",
      ai: "La IA no está disponible temporalmente. Inténtelo de nuevo.",
    },
    it: {
      login: "È necessario effettuare l'accesso.",
      session: "La sessione non è valida.",
      limit: "Limite di suggerimenti raggiunto. Riprova tra un minuto.",
      invalid: "Richiesta non valida.",
      missing: "Inserisci una categoria o il nome del prodotto.",
      ai: "L'IA non è momentaneamente disponibile. Riprova.",
    },
  };
  return messages[locale][key];
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function readLocalizedLabels(value: unknown, fallback: string, locale: AppLocale): Record<AppLocale, string> {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const firstTranslation = locales.map((language) => source[language]).find((text) => typeof text === "string" && text.trim());
  const defaultLabel = fallback || (typeof firstTranslation === "string" ? firstTranslation.trim() : "Custom field");
  return Object.fromEntries(locales.map((language) => [
    language,
    typeof source[language] === "string" && source[language].trim()
      ? source[language].trim().slice(0, 50)
      : language === locale && fallback ? fallback.slice(0, 50) : defaultLabel.slice(0, 50),
  ])) as Record<AppLocale, string>;
}

function cleanOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((option): option is string => typeof option === "string")
    .map((option) => option.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 10);
}

function cleanAiFields(value: unknown, locale: AppLocale): ProductCustomField[] {
  if (!value || typeof value !== "object" || !("fields" in value) || !Array.isArray(value.fields)) {
    throw new Error("Invalid AI response");
  }

  const fields: ProductCustomField[] = [];
  const seenLabels = new Set<string>();
  for (const item of value.fields.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    if (!allowedTypes.has(candidate.type as ProductCustomFieldType)) continue;
    const oldLabel = typeof candidate.label === "string" ? candidate.label.trim().slice(0, 50) : "";
    const labels = readLocalizedLabels(candidate.labels, oldLabel, locale);
    const label = labels[locale];
    const normalizedLabel = normalize(label);
    if (!label || seenLabels.has(normalizedLabel)) continue;
    seenLabels.add(normalizedLabel);

    const field: ProductCustomField = {
      key: `custom_${fields.length + 1}`,
      label,
      labels,
      type: candidate.type as ProductCustomFieldType,
      required: candidate.required === true,
    };

    if (field.type === "select") {
      const rawOptions = candidate.optionsByLocale && typeof candidate.optionsByLocale === "object"
        ? candidate.optionsByLocale as Record<string, unknown>
        : {};
      const oldOptions = cleanOptions(candidate.options);
      const fallbackOptions = locales.map((language) => cleanOptions(rawOptions[language])).find((options) => options.length > 0) ?? oldOptions;
      const optionsByLocale = Object.fromEntries(locales.map((language) => [
        language,
        cleanOptions(rawOptions[language]).length ? cleanOptions(rawOptions[language]) : fallbackOptions,
      ])) as Record<AppLocale, string[]>;
      if (optionsByLocale[locale].length > 0) {
        field.options = optionsByLocale[locale];
        field.optionValues = optionsByLocale.en;
        field.optionsByLocale = optionsByLocale;
      } else {
        field.type = "text";
      }
    }
    fields.push(field);
  }

  if (fields.length === 0) throw new Error("AI returned no usable fields");
  return fields;
}

type AiProvider = { apiKey: string; baseURL: string; models: string[] };

const GEMINI_FALLBACK_MODELS = ["gemini-3-flash-preview", "gemini-flash-latest"];

function resolveAiProvider(): AiProvider {
  if (process.env.GEMINI_API_KEY) {
    const primary = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
    return {
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      models: [primary, ...GEMINI_FALLBACK_MODELS.filter((model) => model !== primary)],
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: "https://api.openai.com/v1",
      models: [process.env.OPENAI_MODEL || "gpt-4o-mini"],
    };
  }
  throw new Error("AI key is not configured");
}

async function requestChatCompletion(
  provider: AiProvider,
  body: Record<string, unknown>,
): Promise<Response> {
  let lastStatus = 0;
  let lastDetail = "";
  for (const model of provider.models) {
    const response = await fetch(`${provider.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, model }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (response.ok) return response;
    lastStatus = response.status;
    lastDetail = (await response.text()).slice(0, 300);
    // 401/403 means the key or model is invalid: retrying another model will not help.
    if (response.status === 400 || response.status === 401 || response.status === 403) break;
  }
  throw new Error(`AI service unavailable (status ${lastStatus}): ${lastDetail}`);
}

async function suggestWithAi(category: string, name: string, existingCategories: string[], locale: AppLocale): Promise<{ category: string; fields: ProductCustomField[] }> {
  const provider = resolveAiProvider();

  const response = await requestChatCompletion(provider, {
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You suggest a product category and useful extra product attributes for small Instagram shops selling clothing, phones, cosmetics, perfumes, glasses, and accessories. Suggest concrete details customers ask about before buying. Return JSON shaped like {"category":"...","fields":[{"labels":{"sr":"...","en":"...","ru":"...","de":"...","es":"...","it":"..."},"type":"text|number|date|boolean|select","required":false,"optionsByLocale":{"sr":["..."],"en":["..."],"ru":["..."],"de":["..."],"es":["..."],"it":["..."]}}]}. "category" is a short product category (1-3 words). The shop's existing categories are listed in the user message: if the product fits one of them, return that existing category exactly as written. Only when none fits, propose a new category in the active UI language, predicted from the product name. If a category is already given, keep it, using the matching existing category name when there is one. Translate every label and select option naturally into Serbian (Latin script), English, Russian, German, Spanish, and Italian. The active UI language is ${localeNames[locale]}; make it the primary wording. Return at most 6 fields. Do not suggest name, SKU, category, quantity, price, shipping, or variants as fields. For phones consider model, storage, condition, and battery; for clothes size, color, and material; for perfume volume and concentration; for glasses frame and lens details. Only include optionsByLocale for select fields.`,
        },
        { role: "user", content: `Category: ${category || "not specified"}\nProduct name: ${name || "not specified"}\nExisting shop categories: ${existingCategories.length ? existingCategories.join(" | ") : "none"}` },
      ],
  });

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("choices" in payload) || !Array.isArray(payload.choices)) {
    throw new Error("Invalid AI response");
  }
  const choice = payload.choices[0];
  if (!choice || typeof choice !== "object" || !("message" in choice) || !choice.message || typeof choice.message !== "object" || !("content" in choice.message) || typeof choice.message.content !== "string") {
    throw new Error("Invalid AI response");
  }
  const parsed: unknown = JSON.parse(choice.message.content);
  const suggestedCategory = parsed && typeof parsed === "object" && "category" in parsed && typeof parsed.category === "string"
    ? parsed.category.trim().slice(0, 80)
    : "";
  const existingMatch = existingCategories.find((existing) => normalize(existing) === normalize(suggestedCategory));
  return { category: existingMatch ?? suggestedCategory, fields: cleanAiFields(parsed, locale) };
}

export async function POST(request: Request) {
  const headerLocale = parseLocale(request.headers.get("x-app-locale"));
  const token = bearerToken(request);
  if (!token) return Response.json({ error: localizedMessage(headerLocale, "login") }, { status: 401 });

  let uid: string | null;
  try {
    uid = await verifyFirebaseToken(token);
  } catch {
    uid = null;
  }
  if (!uid) return Response.json({ error: localizedMessage(headerLocale, "session") }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: localizedMessage(headerLocale, "invalid") }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ error: localizedMessage(headerLocale, "invalid") }, { status: 400 });

  const locale = "locale" in body ? parseLocale(body.locale) : headerLocale;
  const category = "category" in body && typeof body.category === "string" ? body.category.trim().slice(0, 80) : "";
  const name = "name" in body && typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const existingCategories = "categories" in body && Array.isArray(body.categories)
    ? body.categories
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 100)
    : [];
  if (!category && !name) return Response.json({ error: localizedMessage(locale, "missing") }, { status: 400 });

  if (!(await consumeRateLimit(`product-fields:${uid}`, 10))) {
    return Response.json({ error: localizedMessage(locale, "limit") }, { status: 429 });
  }

  try {
    const { category: suggestedCategory, fields } = await suggestWithAi(category, name, existingCategories, locale);
    return Response.json({ category: suggestedCategory, fields, source: "ai" });
  } catch (cause) {
    console.error("AI product-fields suggestion failed:", cause);
    return Response.json({ error: localizedMessage(locale, "ai") }, { status: 503 });
  }
}
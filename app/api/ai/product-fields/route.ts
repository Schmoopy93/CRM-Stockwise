import type { AppLocale, ProductCustomField, ProductCustomFieldType } from "@/lib/types";
import { getProductFieldTemplate } from "@/lib/product-field-templates";

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const locales: AppLocale[] = ["sr", "en", "ru"];
const allowedTypes = new Set<ProductCustomFieldType>(["text", "number", "date", "boolean", "select"]);

function parseLocale(value: unknown): AppLocale {
  return value === "en" || value === "ru" ? value : "sr";
}

function localizedMessage(locale: AppLocale, key: "login" | "session" | "limit" | "invalid" | "missing") {
  const messages: Record<AppLocale, Record<typeof key, string>> = {
    sr: {
      login: "Potrebna je prijava.",
      session: "Sesija nije važeća.",
      limit: "Dostignut je limit predloga. Pokušajte ponovo za minut.",
      invalid: "Neispravan zahtev.",
      missing: "Unesite kategoriju ili naziv artikla.",
    },
    en: {
      login: "Sign-in is required.",
      session: "Your session is invalid.",
      limit: "Suggestion limit reached. Please try again in a minute.",
      invalid: "Invalid request.",
      missing: "Enter a category or product name.",
    },
    ru: {
      login: "Необходимо войти в систему.",
      session: "Сеанс недействителен.",
      limit: "Достигнут лимит предложений. Повторите попытку через минуту.",
      invalid: "Некорректный запрос.",
      missing: "Укажите категорию или название товара.",
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

async function verifyFirebaseToken(token: string) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      cache: "no-store",
    }
  );
  if (!response.ok) return null;
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("users" in result) || !Array.isArray(result.users)) return null;
  const firstUser = result.users[0];
  return firstUser && typeof firstUser === "object" && "localId" in firstUser && typeof firstUser.localId === "string"
    ? firstUser.localId
    : null;
}

async function suggestWithAi(category: string, name: string, locale: AppLocale): Promise<ProductCustomField[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI key is not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You suggest useful extra product attributes for small Instagram shops selling clothing, phones, cosmetics, perfumes, glasses, and accessories. Suggest concrete details customers ask about before buying. Return JSON shaped like {"fields":[{"labels":{"sr":"...","en":"...","ru":"..."},"type":"text|number|date|boolean|select","required":false,"optionsByLocale":{"sr":["..."],"en":["..."],"ru":["..."]}}]}. Translate every label and select option naturally into Serbian (Latin script), English, and Russian. The active UI language is ${locale}; make it the primary wording. Return at most 6 fields. Do not suggest name, SKU, category, quantity, price, shipping, or variants. For phones consider model, storage, condition, and battery; for clothes size, color, and material; for perfume volume and concentration; for glasses frame and lens details. Only include optionsByLocale for select fields.`,
        },
        { role: "user", content: `Category: ${category}\nProduct name: ${name || "not specified"}` },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("AI service unavailable");

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("choices" in payload) || !Array.isArray(payload.choices)) {
    throw new Error("Invalid AI response");
  }
  const choice = payload.choices[0];
  if (!choice || typeof choice !== "object" || !("message" in choice) || !choice.message || typeof choice.message !== "object" || !("content" in choice.message) || typeof choice.message.content !== "string") {
    throw new Error("Invalid AI response");
  }
  return cleanAiFields(JSON.parse(choice.message.content), locale);
}

export async function POST(request: Request) {
  const headerLocale = parseLocale(request.headers.get("x-app-locale"));
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
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
  if (!category && !name) return Response.json({ error: localizedMessage(locale, "missing") }, { status: 400 });

  const now = Date.now();
  const limit = rateLimits.get(uid);
  if (limit && limit.resetAt > now && limit.count >= 10) {
    return Response.json({ error: localizedMessage(locale, "limit") }, { status: 429 });
  }
  rateLimits.set(uid, limit && limit.resetAt > now
    ? { count: limit.count + 1, resetAt: limit.resetAt }
    : { count: 1, resetAt: now + 60_000 });

  try {
    const fields = await suggestWithAi(category, name, locale);
    return Response.json({ fields, source: "ai" });
  } catch {
    const fields = getProductFieldTemplate(category, name, locale);
    const notice = process.env.OPENAI_API_KEY
      ? {
        sr: "AI trenutno nije dostupan; prikazani su predlošci kategorije.",
        en: "AI is temporarily unavailable; category templates are shown.",
        ru: "AI временно недоступен; показаны шаблоны категории.",
      }[locale]
      : {
        sr: "AI ključ nije podešen; prikazani su predlošci kategorije.",
        en: "AI is not configured; category templates are shown.",
        ru: "AI не настроен; показаны шаблоны категории.",
      }[locale];
    return Response.json({ fields, source: "template", notice });
  }
}
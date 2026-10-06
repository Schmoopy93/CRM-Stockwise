"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { ProductCustomField, ProductCustomFieldType } from "@/lib/types";
import { useI18n } from "@/lib/i18n-context";
import { ListPlus, Plus, Sparkles, Trash2 } from "lucide-react";

type FieldValue = string | number | boolean;

interface ProductCustomFieldsProps {
  category: string;
  name: string;
  definitions: ProductCustomField[];
  values: Record<string, FieldValue>;
  onDefinitionsChange: (definitions: ProductCustomField[]) => void;
  onValuesChange: (values: Record<string, FieldValue>) => void;
  onCategorySuggest?: (category: string) => void;
  existingCategories?: string[];
}

const fieldTypes: Array<{ value: ProductCustomFieldType; labelKey: string }> = [
  { value: "text", labelKey: "product.customFieldText" },
  { value: "number", labelKey: "product.customFieldNumber" },
  { value: "date", labelKey: "product.customFieldDate" },
  { value: "boolean", labelKey: "product.customFieldBoolean" },
  { value: "select", labelKey: "product.customFieldChoice" },
];

function makeKey() {
  return `custom_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
}

class UserFacingError extends Error {}

export default function ProductCustomFields({
  category,
  name,
  definitions,
  values,
  onDefinitionsChange,
  onValuesChange,
  onCategorySuggest,
  existingCategories = [],
}: ProductCustomFieldsProps) {
  const { locale, t } = useI18n();
  const [suggestions, setSuggestions] = useState<ProductCustomField[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestSuggestions() {
    setSuggesting(true);
    setError("");
    setMessage("");
    try {
      const user = auth.currentUser;
      if (!user) throw new UserFacingError(t("product.customFieldLogin"));
      const token = await user.getIdToken();
      const response = await fetch("/api/ai/product-fields", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-App-Locale": locale,
        },
        body: JSON.stringify({ category, name, locale, categories: existingCategories }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const errorMessage = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error
          : t("product.customFieldRequestError");
        throw new UserFacingError(errorMessage);
      }
      if (!result || typeof result !== "object" || !("fields" in result) || !Array.isArray(result.fields)) {
        throw new UserFacingError(t("product.customFieldServiceError"));
      }
      const nextSuggestions = result.fields as ProductCustomField[];
      setSuggestions(nextSuggestions);
      setSelected(nextSuggestions.map((_, index) => index));
      const suggestedCategory = "category" in result && typeof result.category === "string" ? result.category.trim() : "";
      if (suggestedCategory && onCategorySuggest && suggestedCategory.toLocaleLowerCase() !== category.trim().toLocaleLowerCase()) {
        onCategorySuggest(suggestedCategory);
        setMessage(t(
          existingCategories.includes(suggestedCategory) ? "product.customFieldCategoryExisting" : "product.customFieldCategorySuggested",
          { category: suggestedCategory }
        ));
      } else {
        setMessage(t("product.customFieldSuggestionReady"));
      }
    } catch (cause) {
      setError(cause instanceof UserFacingError ? cause.message : t("product.customFieldRequestError"));
    } finally {
      setSuggesting(false);
    }
  }

  function addSelectedSuggestions() {
    const additions = suggestions
      .filter((_, index) => selected.includes(index))
      .filter((candidate) => !definitions.some((field) =>
        (field.labels?.[locale] ?? field.label).toLocaleLowerCase() === (candidate.labels?.[locale] ?? candidate.label).toLocaleLowerCase()
      ))
      .map((field) => ({ ...field, key: makeKey() }));
    if (additions.length === 0) {
      setMessage(t("product.customFieldNoSelection"));
      return;
    }
    onDefinitionsChange([...definitions, ...additions]);
    onValuesChange({ ...values, ...Object.fromEntries(additions.map((field) => [field.key, field.type === "boolean" ? false : ""])) });
    setSuggestions([]);
    setSelected([]);
    setMessage(t("product.customFieldAdded", { n: additions.length }));
  }

  function addManualField() {
    const label = t("product.customFieldNew");
    const field: ProductCustomField = {
      key: makeKey(),
      label,
      labels: { [locale]: label },
      type: "text",
      required: false,
    };
    onDefinitionsChange([...definitions, field]);
    onValuesChange({ ...values, [field.key]: "" });
  }

  function updateDefinition(key: string, update: Partial<ProductCustomField>) {
    onDefinitionsChange(definitions.map((field) => {
      if (field.key !== key) return field;
      const labels = update.label !== undefined
        ? { ...field.labels, [locale]: update.label }
        : field.labels;
      return { ...field, ...update, ...(labels ? { labels } : {}) };
    }));
    if (update.type === "boolean" && typeof values[key] !== "boolean") {
      onValuesChange({ ...values, [key]: false });
    } else if (update.type && update.type !== "boolean" && typeof values[key] === "boolean") {
      onValuesChange({ ...values, [key]: "" });
    }
  }

  function removeField(key: string) {
    onDefinitionsChange(definitions.filter((field) => field.key !== key));
    const nextValues = { ...values };
    delete nextValues[key];
    onValuesChange(nextValues);
  }

  function updateValue(key: string, value: FieldValue) {
    onValuesChange({ ...values, [key]: value });
  }

  return (
    <section className="pform-card">
      <div className="pform-card-head">
        <span className="pform-card-icon"><ListPlus size={16} /></span>
        <h2 className="pform-card-title">{t("product.customFields")}</h2>
        <div className="pform-card-actions">
          <button type="button" className="pform-btn" onClick={addManualField}>
            <Plus size={13} /> {t("product.addManualField")}
          </button>
          <button
            type="button"
            className="pform-btn pform-btn-accent"
            onClick={requestSuggestions}
            disabled={suggesting || (!category.trim() && !name.trim())}
          >
            <Sparkles size={13} /> {suggesting ? t("product.suggestingFields") : t("product.suggestFields")}
          </button>
        </div>
      </div>

      <p className="pform-card-hint">{t("product.customFieldsHint")}</p>

      {message && <p role="status" className="pform-msg">{message}</p>}
      {error && <p role="alert" className="pform-msg-error">{error}</p>}

      {suggestions.length > 0 && (
        <div className="pform-suggest">
          <strong>{t("product.proposedFields")} — {t("product.chooseFields")}</strong>
          {suggestions.map((field, index) => (
            <label key={`${field.label}-${index}`}>
              <input type="checkbox" checked={selected.includes(index)} onChange={() => setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} />
              {field.labels?.[locale] ?? field.label} <span>({fieldTypes.find((type) => type.value === field.type) ? t(fieldTypes.find((type) => type.value === field.type)!.labelKey) : field.type})</span>
            </label>
          ))}
          <button type="button" onClick={addSelectedSuggestions} className="btn-primary">
            {t("product.addSelectedFields")}
          </button>
        </div>
      )}

      {definitions.map((field) => (
        <div key={field.key} className="pform-field-card">
          <div className="product-custom-field-row">
            <input aria-label={t("product.customFieldName")} className="input" value={field.labels?.[locale] ?? field.label} maxLength={50} onChange={(event) => updateDefinition(field.key, { label: event.target.value })} />
            <select aria-label={t("product.customFieldType")} className="input" value={field.type} onChange={(event) => {
              const type = event.target.value as ProductCustomFieldType;
              if (type === "select") {
                const options = field.optionsByLocale?.[locale] ?? field.options ?? [t("product.customFieldOther")];
                const optionsByLocale = { ...field.optionsByLocale, [locale]: options };
                const existingValues = field.optionValues ?? field.optionsByLocale?.en ?? field.options ?? [];
                const optionValues = options.map((_, index) => existingValues[index] ?? `option_${index + 1}`);
                updateDefinition(field.key, { type, options, optionsByLocale, optionValues });
              } else {
                updateDefinition(field.key, { type, options: undefined, optionsByLocale: undefined, optionValues: undefined });
              }
            }}>
              {fieldTypes.map((type) => <option key={type.value} value={type.value}>{t(type.labelKey)}</option>)}
            </select>
            <button type="button" className="pform-icon-btn" aria-label={t("product.removeField", { name: field.labels?.[locale] ?? field.label })} onClick={() => removeField(field.key)}>
              <Trash2 size={14} />
            </button>
          </div>
          {field.type === "select" && (
            <input
              className="input"
              aria-label={t("product.customFieldOptions")}
              placeholder={t("product.customFieldOptions")}
              value={(field.optionsByLocale?.[locale] ?? field.options ?? []).join(", ")}
              onChange={(event) => {
                const options = event.target.value.split(",").map((option) => option.trim()).filter(Boolean).slice(0, 20);
                const existingValues = field.optionValues ?? field.optionsByLocale?.en ?? field.options ?? [];
                const optionValues = options.map((_, index) => existingValues[index] ?? `option_${index + 1}`);
                updateDefinition(field.key, { options, optionValues, optionsByLocale: { ...field.optionsByLocale, [locale]: options } });
              }}
            />
          )}
          <label className="pform-required">
            <input type="checkbox" checked={field.required} onChange={(event) => updateDefinition(field.key, { required: event.target.checked })} /> {t("product.customFieldRequired")}
          </label>
          {field.type === "boolean" ? (
            <label className="pform-value-row">
              <input type="checkbox" checked={Boolean(values[field.key])} required={field.required} onChange={(event) => updateValue(field.key, event.target.checked)} />
              {field.labels?.[locale] ?? field.label}
            </label>
          ) : field.type === "select" ? (
            <select className="input" value={(() => {
              const currentValue = String(values[field.key] ?? "");
              const optionValues = field.optionValues ?? field.optionsByLocale?.en ?? field.options ?? [];
              if (optionValues.includes(currentValue)) return currentValue;
              for (const language of [locale, "sr", "en", "ru", "de", "es", "it"] as const) {
                const index = field.optionsByLocale?.[language]?.indexOf(currentValue) ?? -1;
                if (index >= 0) return optionValues[index] ?? currentValue;
              }
              return currentValue;
            })()} required={field.required} onChange={(event) => updateValue(field.key, event.target.value)}>
              <option value="">{t("product.customFieldSelect")}</option>
              {(field.optionsByLocale?.[locale] ?? field.options ?? []).map((option, index) => {
                const optionValue = field.optionValues?.[index] ?? field.optionsByLocale?.en?.[index] ?? field.options?.[index] ?? option;
                return <option key={`${optionValue}-${index}`} value={optionValue}>{option}</option>;
              })}
            </select>
          ) : (
            <input
              className="input"
              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
              value={String(values[field.key] ?? "")}
              required={field.required}
              onChange={(event) => updateValue(field.key, field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)}
            />
          )}
        </div>
      ))}
    </section>
  );
}

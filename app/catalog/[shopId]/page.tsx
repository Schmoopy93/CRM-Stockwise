import type { Metadata } from "next";
import { buildMetadata, LOCALE_TAGS, localeFromHeaders, seoCopy, seoTitle } from "@/lib/seo";
import type { Locale } from "@/lib/i18n-context";
import { BASE_CURRENCY, convert, formatMoney, isSupportedCurrency } from "@/lib/currency";
import { fetchExchangeRates } from "@/lib/rates";
import sr from "@/lib/i18n/sr.json";
import en from "@/lib/i18n/en.json";
import ru from "@/lib/i18n/ru.json";
import de from "@/lib/i18n/de.json";
import es from "@/lib/i18n/es.json";
import it from "@/lib/i18n/it.json";
import CatalogView from "./catalog-view";

const TRANSLATIONS: Record<Locale, Record<string, string>> = { sr, en, ru, de, es, it };
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

interface FirestoreValue {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  arrayValue?: { values?: FirestoreValue[] };
}

type FirestoreFields = Record<string, FirestoreValue>;

interface Props {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function firestoreGet<T>(path: string, query = ""): Promise<T | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  const params = new URLSearchParams(query);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (apiKey) params.set("key", apiKey);
  try {
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}?${params}`,
      { next: { revalidate: 300 } }
    );
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

const text = (value?: FirestoreValue) => value?.stringValue ?? "";
const texts = (value?: FirestoreValue) => (value?.arrayValue?.values ?? []).map(text).filter(Boolean);
const numeric = (value?: FirestoreValue) =>
  value?.doubleValue ?? (value?.integerValue !== undefined ? Number(value.integerValue) : undefined);
const firstImage = (fields: FirestoreFields) => texts(fields.images)[0] || text(fields.imageUrl);

function fill(template: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value), template);
}

async function firstCatalogImage(shopId: string) {
  const list = await firestoreGet<{ documents?: { fields?: FirestoreFields }[] }>(`shops/${shopId}/catalog`, "pageSize=30&orderBy=name");
  for (const document of list?.documents ?? []) {
    const fields = document.fields ?? {};
    if (fields.hidden?.booleanValue !== true && firstImage(fields)) return firstImage(fields);
  }
  return "";
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ shopId }, { p }, locale] = await Promise.all([params, searchParams, localeFromHeaders()]);
  const path = `/catalog/${shopId}`;
  const fallback = buildMetadata({ locale, path, title: seoTitle(locale), description: seoCopy(locale).description });
  if (!ID_PATTERN.test(shopId)) return fallback;

  const shop = await firestoreGet<{ fields?: FirestoreFields }>(`shops/${shopId}`);
  if (shop?.fields?.catalogEnabled?.booleanValue !== true) return fallback;

  const dictionary = TRANSLATIONS[locale];
  const shopName = text(shop.fields.name) || dictionary["catalog.title"];
  const shopDescription = fill(dictionary["catalog.metaShopDescription"], { shop: shopName });
  const productId = typeof p === "string" && ID_PATTERN.test(p) ? p : "";
  const product = productId ? (await firestoreGet<{ fields?: FirestoreFields }>(`shops/${shopId}/catalog/${productId}`))?.fields : undefined;

  let title = shopName;
  let description = shopDescription;
  let image = "";
  if (product && product.hidden?.booleanValue !== true && text(product.name)) {
    const price = numeric(product.salePrice);
    const oldPrice = numeric(product.compareAtPrice);
    const intl = LOCALE_TAGS[locale].hreflang;
    // Quoted in the shop's own currency, so the price in search results matches
    // the price on the page rather than leaking the base amount.
    const shopCurrency = isSupportedCurrency(shop.fields.currency) ? shop.fields.currency : BASE_CURRENCY;
    const rates = await fetchExchangeRates();
    const quote = (value: number) => formatMoney(convert(value, shopCurrency, rates), intl, shopCurrency);
    const priceText = price === undefined
      ? ""
      : oldPrice !== undefined && oldPrice > price
        ? `${quote(price)} (${quote(oldPrice)})`
        : quote(price);
    title = `${text(product.name)} · ${shopName}`;
    description = priceText
      ? fill(dictionary["catalog.metaProductDescription"], { price: priceText, shop: shopName })
      : shopDescription;
    image = firstImage(product);
  }
  if (!image) image = text(shop.fields.catalogCoverUrl) || (await firstCatalogImage(shopId)) || text(shop.fields.catalogLogoUrl);

  const metadata = buildMetadata({ locale, path, title, description });
  if (!image) return metadata;
  return {
    ...metadata,
    openGraph: { ...metadata.openGraph, images: [{ url: image, alt: title }] },
    twitter: { ...metadata.twitter, images: [image] },
  };
}

export default async function PublicCatalogPage({ params }: Props) {
  const { shopId } = await params;
  return <CatalogView shopId={shopId} />;
}

import type { NextRequest } from "next/server";
import { BASE_CURRENCY } from "@/lib/currency";
import { fetchExchangeRates } from "@/lib/rates";
import { CATALOG_PAGE_SIZE, type CatalogSort } from "@/lib/catalog-filter";
import { filterCatalogItems, paginateCatalogItems, sortCatalogItems } from "@/lib/catalog-query";
import { loadCatalogItems, loadCatalogShop } from "@/lib/catalog-store";
import type { CatalogPageResponse } from "@/lib/catalog-api";
import type { CatalogItem, ShopCatalogSettings } from "@/lib/types";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_PAGE_SIZE = 60;
const MAX_PAGE = 10_000;
const MAX_LOOKUP_IDS = 60;

function parseAmount(raw: string | null) {
  const normalized = (raw ?? "").trim().replace(",", ".");
  if (!normalized) return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function integer(raw: string | null, fallback: number, min: number, max: number) {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function parseSort(raw: string | null): CatalogSort {
  return raw === "priceAsc" || raw === "priceDesc" ? raw : "name";
}

function json(body: CatalogPageResponse, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      // Writes invalidate the tagged catalog cache, so the origin is fresh on
      // the next request. The edge copy stays short-lived as well: a merchant
      // who unpublishes the catalog must not keep serving it from a CDN cache
      // for minutes if that invalidation call never arrived.
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
    },
  });
}

function emptyPage(shop: ShopCatalogSettings | null, extras: CatalogItem[] = [], catalogTotal = 0): CatalogPageResponse {
  return {
    shop,
    items: [],
    extras,
    total: 0,
    catalogTotal,
    baseTotal: 0,
    categories: [],
    hasPrices: false,
    page: 1,
    hasMore: false,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  if (!ID_PATTERN.test(shopId)) {
    return Response.json({ error: "invalid-shop" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const searchParams = request.nextUrl.searchParams;
  const lookupOnly = searchParams.get("lookup") === "1";
  const ids = Array.from(new Set(
    (searchParams.get("ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => ID_PATTERN.test(id))
  )).slice(0, MAX_LOOKUP_IDS);
  const page = integer(searchParams.get("page"), 1, 1, MAX_PAGE);
  const pageSize = integer(searchParams.get("pageSize"), CATALOG_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const search = (searchParams.get("q") ?? "").trim().slice(0, 120);
  const category = (searchParams.get("cat") ?? "all").trim().slice(0, 120) || "all";
  const sort = parseSort(searchParams.get("sort"));
  const inStockOnly = searchParams.get("stock") === "1";
  const displayMin = parseAmount(searchParams.get("min"));
  const displayMax = parseAmount(searchParams.get("max"));

  try {
    const shop = await loadCatalogShop(shopId);
    if (!shop) return json(emptyPage(null));
    if (!shop.catalogEnabled) return json(emptyPage(shop));

    const items = await loadCatalogItems(shopId);
    const byId = new Map(items.map((item) => [item.id, item]));
    const extras = ids.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
    const hasPrices = items.some((item) => item.salePrice !== undefined);

    if (lookupOnly) {
      return json({ ...emptyPage(shop, extras, items.length), hasPrices });
    }

    let priceMin: number | undefined;
    let priceMax: number | undefined;
    if (hasPrices && (displayMin !== undefined || displayMax !== undefined)) {
      const low = displayMin !== undefined && displayMax !== undefined && displayMin > displayMax ? displayMax : displayMin;
      const high = displayMin !== undefined && displayMax !== undefined && displayMin > displayMax ? displayMin : displayMax;
      const rates = await fetchExchangeRates();
      const rate = shop.currency === BASE_CURRENCY ? 1 : rates.rates[shop.currency];
      const divisor = typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : 1;
      priceMin = low !== undefined ? low / divisor : undefined;
      priceMax = high !== undefined ? high / divisor : undefined;
    }

    const filtered = filterCatalogItems(items, {
      search,
      category,
      inStockOnly,
      priceMin,
      priceMax,
    });
    const sorted = sortCatalogItems(filtered.matched, sort);
    const paged = paginateCatalogItems(sorted, page, pageSize);

    return json({
      shop,
      items: paged.items,
      extras,
      total: sorted.length,
      catalogTotal: items.length,
      baseTotal: filtered.base.length,
      categories: filtered.categories,
      hasPrices,
      page,
      hasMore: paged.hasMore,
    });
  } catch (cause) {
    console.error("Public catalog API failed", { shopId, cause });
    return Response.json(
      { error: "catalog-unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}

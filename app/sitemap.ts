import type { MetadataRoute } from "next";
import { BASE_URL, LOCALES } from "@/lib/seo";

/**
 * Static, indexable routes only. Catalog pages (/catalog/{shopId}) are shared
 * per shop and cannot be enumerated anonymously (firestore.rules block list),
 * so Google discovers them through shared links.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  const now = new Date();
  for (const locale of LOCALES) {
    for (const path of ["/", "/login", "/cookies"]) {
      entries.push({
        url: locale === "sr" ? `${BASE_URL}${path}` : `${BASE_URL}${path}?lang=${locale}`,
        lastModified: now,
        changeFrequency: path === "/" ? "weekly" : "monthly",
        priority: path === "/cookies" ? 0.3 : path === "/" ? 1 : 0.9,
      });
    }
  }
  return entries;
}

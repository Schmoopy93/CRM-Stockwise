import type { MetadataRoute } from "next";
import { BASE_URL, LOCALES } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/api"] }],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}

import type { Metadata } from "next";
import { buildMetadata, localeFromHeaders, seoCopy, seoTitle } from "@/lib/seo";

/** Public shop catalog — the only customer-facing page that should be indexed. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ shopId: string }>;
}): Promise<Metadata> {
  const [{ shopId }, locale] = await Promise.all([params, localeFromHeaders()]);
  return buildMetadata({
    locale,
    path: `/catalog/${shopId}`,
    title: seoTitle(locale),
    description: seoCopy(locale).description,
  });
}

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import { buildMetadata, localeFromHeaders } from "@/lib/seo";
import { DashboardShell } from "./shell";

/** The dashboard sits behind authentication and must never be indexed. */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeFromHeaders();
  return buildMetadata({ locale, path: "/dashboard", noindex: true });
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n-context";
import { ThemeProvider } from "@/lib/theme-context";
import { BASE_URL, buildMetadata, localeFromHeaders, seoCopy } from "@/lib/seo";
import { CookieNotice } from "@/components/CookieNotice";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: true,
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeFromHeaders();
  const { title, description } = seoCopy(locale);
  return {
    metadataBase: new URL(BASE_URL),
    ...buildMetadata({ locale, path: "/", title, description }),
    // The template must win over buildMetadata's plain string title.
    title: {
      default: title,
      template: "%s — Stockwise",
    },
    icons: {
      icon: "/favicon.ico",
      shortcut: "/favicon.ico",
      apple: "/apple-touch-icon.png",
    },
    manifest: "/manifest.json",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f0f14" },
    { media: "(prefers-color-scheme: light)", color: "#f4f4f8" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts resolves the language from ?lang= or the saved cookie, so the
  // document language is correct on the server — not just after hydration.
  const locale = await localeFromHeaders();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>{children}</AuthProvider>
            <CookieNotice />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

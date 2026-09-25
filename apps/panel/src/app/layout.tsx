import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Sora, IBM_Plex_Sans_Arabic, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Typographic identity (late-2026 refresh). Self-hosted via next/font so there
 * is no runtime Google-Fonts dependency:
 *  - Sora — geometric display face for headlines/wordmarks (Latin), tracked tight.
 *  - IBM Plex Sans Arabic — the Arabic body/display face under dir="rtl"; its
 *    Latin glyphs sit in the stack too so both scripts share Plex's voice.
 *  - JetBrains Mono — utility face for consoles, meters and data labels.
 * The families expose their names as --font-sora / --font-plex / --font-jb
 * on <html>; the @theme stacks in globals.css compose from them.
 */
const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sora",
});
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-jb",
});
import { getBranding } from "@/lib/settings";
import { getLocale } from "@/lib/i18n/server";
import { dirOf, DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/i18n/config";
import { PreferencesProvider } from "@/lib/i18n/preferences";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const branding = await getBranding();
    return {
      title: { default: branding.siteName, template: `%s · ${branding.siteName}` },
      description: branding.siteDescription || "Hosting control panel",
      icons: branding.siteFavicon ? { icon: branding.siteFavicon } : undefined,
      robots: { index: false, follow: false },
    };
  } catch {
    // The database may not be migrated yet on first boot.
    return { title: "SPanel", description: "Hosting control panel", robots: { index: false, follow: false } };
  }
}

export const viewport: Viewport = {
  themeColor: "#060607",
  width: "device-width",
  initialScale: 1,
};

/**
 * Applies the saved theme before first paint so there's no flash of the wrong
 * palette. Runs synchronously in <head>; falls back to the default theme.
 * Language/direction come from the server (cookie) below, so no script needed
 * for those. Theme and language are independent — this only touches theme.
 */
const themeScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='dark'&&t!=='light')t='${DEFAULT_THEME}';var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;}catch(e){document.documentElement.dataset.theme='${DEFAULT_THEME}';}})();`;

// The monochrome default. When siteAccent is this value we DON'T inject an inline
// --color-brand, so the per-theme tokens win (platinum on dark, black on light).
// A genuinely custom accent still overrides both themes.
const DEFAULT_ACCENT = "#f5f5f3";

export default async function RootLayout({ children }: { children: ReactNode }) {
  let accent = DEFAULT_ACCENT;
  try {
    accent = (await getBranding()).siteAccent;
  } catch {
    // ignore — defaults are fine before the first migration
  }

  const locale = await getLocale();
  const dir = dirOf(locale);
  const custom = accent && accent.toLowerCase() !== DEFAULT_ACCENT;

  return (
    <html
        lang={locale}
        dir={dir}
        data-theme={DEFAULT_THEME}
        className={`${sora.variable} ${plexArabic.variable} ${jetbrains.variable}`}
        suppressHydrationWarning
      >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body style={custom ? { ["--color-brand" as string]: accent } : undefined}>
        <PreferencesProvider initialLocale={locale}>{children}</PreferencesProvider>
      </body>
    </html>
  );
}

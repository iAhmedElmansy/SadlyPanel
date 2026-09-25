/**
 * Locale + preferences configuration.
 *
 * Two independent user preferences, deliberately decoupled:
 *  - **theme**    — visual palette ("dark" | "light"). Pure client concern:
 *                   applied as `data-theme` on <html>, persisted in localStorage.
 *  - **language** — UI locale ("en" | "ar"). Needs to reach *server* components
 *                   (which cannot read React context), so it travels in a cookie
 *                   and is mirrored to localStorage for the client toggle.
 *
 * Changing one never touches the other.
 */

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "dark";

/** Cookie the server reads to render in the right language (1 year). */
export const LANG_COOKIE = "spanel_lang";
/** localStorage keys mirrored on the client. */
export const LANG_STORAGE_KEY = "spanel:lang";
export const THEME_STORAGE_KEY = "spanel:theme";
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Text direction for a locale. Arabic is the only RTL locale for now. */
export const LOCALE_DIR: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  ar: "rtl",
};

/** Human labels for the language switcher (each shown in its own script). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function dirOf(locale: Locale): "ltr" | "rtl" {
  return LOCALE_DIR[locale];
}

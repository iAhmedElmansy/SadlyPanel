"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  LANG_COOKIE,
  LANG_COOKIE_MAX_AGE,
  LANG_STORAGE_KEY,
  THEME_STORAGE_KEY,
  dirOf,
  isLocale,
  isTheme,
  type Locale,
  type Theme,
} from "./config";
import { makeTranslator, type Translator } from "./translate";

/**
 * Client-side preferences: theme and language, fully independent.
 *
 *  - `theme`    lives only on the client: `data-theme` on <html> + localStorage.
 *               Changing it never refetches or touches the language.
 *  - `language` is mirrored to a cookie so the *server* renders the right locale;
 *               changing it writes the cookie then router.refresh()es so server
 *               components re-render translated. It never touches the theme.
 *
 * The initial `locale` comes from the server (cookie) to avoid a flash; the
 * theme is applied pre-paint by an inline script in the root layout, and this
 * provider re-syncs from localStorage on mount.
 */

interface PreferencesValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dir: "ltr" | "rtl";
  t: Translator;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

function writeLangCookie(locale: Locale) {
  document.cookie = `${LANG_COOKIE}=${locale};path=/;max-age=${LANG_COOKIE_MAX_AGE};samesite=lax`;
}

export function PreferencesProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Re-sync from localStorage on mount (source of truth for the client).
  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (isTheme(storedTheme)) setThemeState(storedTheme);

      const storedLang = localStorage.getItem(LANG_STORAGE_KEY);
      if (isLocale(storedLang) && storedLang !== initialLocale) {
        // localStorage disagrees with the cookie (e.g. cookie cleared) — trust
        // localStorage, fix the cookie, and refresh so the server catches up.
        writeLangCookie(storedLang);
        setLocaleState(storedLang);
        router.refresh();
      } else if (!storedLang) {
        localStorage.setItem(LANG_STORAGE_KEY, initialLocale);
      }
    } catch {
      // localStorage unavailable (private mode) — defaults are fine.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply theme to <html> whenever it changes (independent of language).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      setLocaleState(next);
      try {
        localStorage.setItem(LANG_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      writeLangCookie(next);
      // Update <html> immediately for direction; server re-render confirms it.
      document.documentElement.lang = next;
      document.documentElement.dir = dirOf(next);
      router.refresh();
    },
    [locale, router],
  );

  const value = useMemo<PreferencesValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      locale,
      setLocale,
      dir: dirOf(locale),
      t: makeTranslator(locale),
    }),
    [theme, setTheme, toggleTheme, locale, setLocale],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within <PreferencesProvider>");
  return ctx;
}

/** Convenience: just the translator, for components that only need `t`. */
export function useT(): Translator {
  return usePreferences().t;
}

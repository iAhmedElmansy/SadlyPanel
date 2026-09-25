"use client";

import { useState } from "react";
import { Check, Globe, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/lib/i18n/preferences";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";

/**
 * Combined theme + language control for the topbar. Two rows, fully decoupled:
 * a theme toggle (dark/light) and a language picker (en/ar). Selecting one
 * never changes the other.
 */
export function PreferencesMenu() {
  const { theme, toggleTheme, locale, setLocale, t } = usePreferences();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("nav.language")}
        className="rounded-md p-1.5 text-ink-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <Globe className="size-5" />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="panel-card absolute end-0 z-20 mt-2 w-52 overflow-hidden p-1 shadow-2xl">
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
              {t("nav.theme")}
            </p>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              <span className="flex items-center gap-2">
                {theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
                {theme === "dark" ? t("nav.themeDark") : t("nav.themeLight")}
              </span>
            </button>

            <div className="my-1 border-t border-line" />

            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
              {t("nav.language")}
            </p>
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setLocale(code);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-sm hover:bg-surface-2",
                  locale === code ? "text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                <span>{LOCALE_LABELS[code]}</span>
                {locale === code ? <Check className="size-4 text-brand-soft" /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

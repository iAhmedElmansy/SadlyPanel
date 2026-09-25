import type { Locale } from "../config";
import { common } from "./common";
import { nav } from "./nav";
import { publicSite } from "./public";
import { auth } from "./auth";
import { dashboard } from "./dashboard";
import { admin } from "./admin";

/**
 * Merges every namespace into one dictionary per locale, keyed by namespace.
 * Each namespace file is owned independently (one translation agent per file)
 * so they never collide here.
 *
 * Lookup keys are dotted: `common.save`, `nav.myServers`, `dashboard.title`, …
 */
export const messages = {
  en: {
    common: common.en,
    nav: nav.en,
    public: publicSite.en,
    auth: auth.en,
    dashboard: dashboard.en,
    admin: admin.en,
  },
  ar: {
    common: common.ar,
    nav: nav.ar,
    public: publicSite.ar,
    auth: auth.ar,
    dashboard: dashboard.ar,
    admin: admin.ar,
  },
} as const;

export type Messages = (typeof messages)["en"];

export function messagesFor(locale: Locale) {
  return messages[locale] ?? messages.en;
}

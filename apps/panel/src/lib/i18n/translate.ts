import type { Locale } from "./config";
import { DEFAULT_LOCALE } from "./config";
import { messagesFor } from "./messages";

export type TranslateVars = Record<string, string | number>;

/**
 * Resolves a dotted key (`"nav.myServers"`) against a locale's dictionary,
 * with `{var}` interpolation. Falls back to English, then to the raw key, so a
 * missing translation degrades to readable text instead of throwing.
 */
export function translate(locale: Locale, key: string, vars?: TranslateVars): string {
  const value = lookup(messagesFor(locale), key) ?? lookup(messagesFor(DEFAULT_LOCALE), key);
  if (value == null) return key;
  return vars ? interpolate(value, vars) : value;
}

function lookup(dict: Record<string, unknown>, key: string): string | null {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  return typeof node === "string" ? node : null;
}

function interpolate(template: string, vars: TranslateVars): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** A bound translator: `t("common.save")`. Same shape on server and client. */
export type Translator = (key: string, vars?: TranslateVars) => string;

export function makeTranslator(locale: Locale): Translator {
  return (key, vars) => translate(locale, key, vars);
}

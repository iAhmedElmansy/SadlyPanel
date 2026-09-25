import "server-only";
import { cookies } from "next/headers";
import type { Locale } from "./config";
import { LANG_COOKIE, normalizeLocale, dirOf } from "./config";
import { makeTranslator, type Translator } from "./translate";

/**
 * Server-side locale resolution. Server components can't read React context, so
 * the active language travels in the `spanel_lang` cookie (mirrored to
 * localStorage on the client). Read it here to translate during SSR.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LANG_COOKIE)?.value);
}

export async function getDir(): Promise<"ltr" | "rtl"> {
  return dirOf(await getLocale());
}

/** `const t = await getT(); t("nav.myServers")` inside a server component. */
export async function getT(): Promise<Translator> {
  return makeTranslator(await getLocale());
}

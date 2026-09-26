import type { Translator } from "@/lib/i18n/translate";

/**
 * Heart tooltip logic, kept in a plain (non-"use client") module so it can be
 * called from BOTH server components (the node layout/overview, which render on
 * the server) and client components (node list / telemetry). The `HealthHeart`
 * icon itself lives in the client module `health-heart.tsx`; a server component
 * may render that component but must not call a function exported from a client
 * module — doing so throws "Attempted to call heartTitle() from the server".
 */
export type HeartHealth = "online" | "degraded" | "offline" | "unknown";

/**
 * English wording used when no {@link Translator} is supplied (e.g. a server
 * layout that has one in scope still passes it; this is the last-resort default).
 */
const EN_FALLBACK: Record<string, string> = {
  "admin.heartTipOffline": "Offline",
  "admin.heartTipDegraded": "Degraded · heartbeat delayed",
  "admin.heartTipUnknown": "No heartbeat yet",
  "admin.heartVersionUnknown": "unknown",
  "admin.heartTipOnline": "Online · daemon {version}",
};

function fallback(key: string, vars?: Record<string, string | number>): string {
  const template = EN_FALLBACK[key] ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : template;
}

/**
 * Builds the hover tooltip text for a heart: the daemon version when healthy, a
 * plain status word otherwise. Pass the active {@link Translator} (from
 * `useT()` in client trees or `getT()` in server trees) to localise it; callers
 * that cannot reach a translator may omit it and get the English fallback.
 */
export function heartTitle(
  health: HeartHealth,
  daemonVersion: string | null | undefined,
  t?: Translator,
): string {
  const tr: Translator = t ?? fallback;
  if (health === "offline") return tr("admin.heartTipOffline");
  if (health === "degraded") return tr("admin.heartTipDegraded");
  if (health === "unknown") return tr("admin.heartTipUnknown");
  return tr("admin.heartTipOnline", { version: daemonVersion ?? tr("admin.heartVersionUnknown") });
}

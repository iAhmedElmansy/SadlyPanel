"use client";

import { Heart, HeartCrack } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Translator } from "@/lib/i18n/translate";

export type HeartHealth = "online" | "degraded" | "offline" | "unknown";

/**
 * Heartbeat status as a pulsing heart, replacing the old textual Online/Offline
 * badge. Healthy nodes show a filled green heart that visibly beats; a degraded
 * node beats amber; an offline node is a static red broken heart; a node that
 * has never reported is a dim, still heart.
 *
 * `title` is the hover tooltip — callers pass the daemon version for healthy
 * nodes and a status word ("Offline"/"Degraded") otherwise. The component is a
 * client component so it can carry its own keyframes and be dropped into both
 * server (node layout) and client (node list / telemetry) trees alike.
 */
export function HealthHeart({
  health,
  title,
  size = "size-4",
  className,
}: {
  health: HeartHealth;
  title: string;
  /** Tailwind size utility for the icon, e.g. "size-4" (default) or "size-5". */
  size?: string;
  className?: string;
}) {
  const Icon = health === "offline" ? HeartCrack : Heart;
  const color =
    health === "online"
      ? "text-ok"
      : health === "degraded"
        ? "text-warn"
        : health === "offline"
          ? "text-bad"
          : "text-ink-dim";
  const pulse = health === "online" || health === "degraded";

  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={cn("inline-flex items-center justify-center", className)}
    >
      <Icon
        aria-hidden
        strokeWidth={2.25}
        fill={health === "online" ? "currentColor" : "none"}
        className={cn(size, color, pulse && "heartbeat-pulse")}
      />
      <style jsx global>{`
        @keyframes heartbeat-pulse {
          0%,
          100% {
            transform: scale(1);
          }
          15% {
            transform: scale(1.28);
          }
          30% {
            transform: scale(1);
          }
          45% {
            transform: scale(1.16);
          }
          60% {
            transform: scale(1);
          }
        }
        .heartbeat-pulse {
          animation: heartbeat-pulse 1s ease-in-out infinite;
          transform-origin: center;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .heartbeat-pulse {
            animation: none;
          }
        }
      `}</style>
    </span>
  );
}

/**
 * Builds the hover tooltip text for a heart: the daemon version when healthy,
 * a plain status word otherwise. Pass the active {@link Translator} (from
 * `useT()` in client trees or `getT()` in server trees) to localise it; callers
 * that cannot reach a translator (e.g. a server layout without one in scope)
 * may omit it and get the English wording via the built-in fallback.
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

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "brand" | "ok" | "warn" | "bad" | "info";

const ICON_TONES: Record<Tone, string> = {
  brand: "text-brand-soft border-brand/30 bg-brand/12",
  ok: "text-ok border-ok/30 bg-ok/12",
  warn: "text-warn border-warn/30 bg-warn/12",
  bad: "text-bad border-bad/30 bg-bad/12",
  info: "text-info border-info/30 bg-info/12",
};

/**
 * Premium overview stat tile — a calm gradient panel with a tinted icon chip and
 * a hairline accent. Presentation-only sibling of layout/StatCard, tuned for the
 * dashboard's dark-luxury language. Server-safe (no client hooks).
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "brand",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("panel-card lift group relative overflow-hidden p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-dim">{label}</p>
          <p className="truncate text-2xl font-semibold tracking-tight text-ink">{value}</p>
        </div>
        {icon ? (
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-lg border transition-colors",
              ICON_TONES[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-2 truncate text-xs text-ink-dim">{hint}</p> : null}
    </div>
  );
}

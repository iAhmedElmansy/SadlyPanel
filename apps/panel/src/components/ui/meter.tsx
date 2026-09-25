"use client";

import { cn, percent } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

export function Meter({
  used,
  total,
  label,
  valueLabel,
  className,
  tone = "brand",
}: {
  used: number;
  total: number;
  label?: string;
  valueLabel?: string;
  className?: string;
  tone?: "brand" | "ok" | "warn" | "bad";
}) {
  const t = useT();
  const pct = percent(used, total);
  const auto = pct >= 90 ? "bad" : pct >= 75 ? "warn" : tone;
  const barTone = { brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" }[auto];

  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || valueLabel) && (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          {label ? <span className="text-ink-muted">{label}</span> : null}
          {valueLabel ? <span className="font-mono text-ink-dim">{valueLabel}</span> : null}
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? t("common.usage")}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", barTone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 space-y-3", className)}>
      {breadcrumb ? <div className="text-xs text-ink-dim">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-lg font-semibold text-ink sm:text-xl">{title}</h1>
          {description ? <p className="max-w-2xl text-sm text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "brand" | "ok" | "warn" | "bad" | "info";
}) {
  const tones = {
    brand: "text-brand-soft bg-brand/12 border-brand/30",
    ok: "text-ok bg-ok/12 border-ok/30",
    warn: "text-warn bg-warn/12 border-warn/30",
    bad: "text-bad bg-bad/12 border-bad/30",
    info: "text-info bg-info/12 border-info/30",
  }[tone];

  return (
    <div className="panel-card flex items-start gap-3 p-4">
      {icon ? <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border", tones)}>{icon}</span> : null}
      <div className="min-w-0">
        <p className="text-xs text-ink-muted">{label}</p>
        <p className="mt-0.5 truncate text-lg font-semibold text-ink">{value}</p>
        {hint ? <p className="mt-0.5 truncate text-xs text-ink-dim">{hint}</p> : null}
      </div>
    </div>
  );
}

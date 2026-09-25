import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight section heading for grouping content below a PageHeader — an
 * optional tinted icon chip, a title, an optional description, and a trailing
 * action slot. Keeps spacing/typography consistent across dashboard pages.
 * Server-safe.
 */
export function SectionHeading({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="flex items-center gap-2.5">
        {icon ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-brand-soft">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

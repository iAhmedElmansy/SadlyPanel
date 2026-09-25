import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      {icon ? (
        <div className="grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-ink-muted">{icon}</div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description ? <p className="max-w-md text-xs text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

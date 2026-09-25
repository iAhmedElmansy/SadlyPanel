"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

/**
 * Shimmer placeholder. Relies on the `.animate-shimmer` utility + `@keyframes
 * shimmer` defined in globals.css.
 */
export function Skeleton({ className, rounded = "md" }: { className?: string; rounded?: "none" | "sm" | "md" | "lg" | "full" }) {
  const radius = {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-full",
  }[rounded];
  return <div aria-hidden className={cn("animate-shimmer bg-surface-2", radius, className)} />;
}

/** Several shimmer lines, the last one narrower to mimic a paragraph. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn("h-3", index === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** A card-shaped placeholder for loading list/detail cards. */
export function SkeletonCard({ className }: { className?: string }) {
  const t = useT();
  return (
    <div className={cn("panel-card space-y-4 p-5", className)} role="status" aria-busy aria-label={t("common.loading")}>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9" rounded="lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}

"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Static button wrapper. This used to pull its child toward the pointer (a
 * "magnetic" CTA), but the pointer-follow was removed at the user's request so
 * buttons stay put. Kept as a thin inline-flex pass-through so existing call
 * sites need no change and layout is unaffected.
 */
export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex", className)}>{children}</span>;
}

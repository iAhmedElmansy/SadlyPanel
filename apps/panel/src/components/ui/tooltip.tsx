import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";

const SIDE: Record<Side, string> = {
  top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
  left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
  right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
};

/**
 * CSS-only tooltip: reveals on hover and keyboard focus via `group`/`peer`
 * state, no positioning library or client JS. The trigger carries `aria-label`
 * so the content is announced even before the visual tip appears.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  className?: string;
}) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      <span
        tabIndex={0}
        aria-label={typeof content === "string" ? content : undefined}
        className="inline-flex outline-none"
      >
        {children}
      </span>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-xs whitespace-normal rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink shadow-lg",
          "scale-95 opacity-0 transition duration-100",
          "group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100",
          SIDE[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}

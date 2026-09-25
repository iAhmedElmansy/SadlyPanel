"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

type Tone = "info" | "ok" | "warn" | "bad";

const TONES: Record<Tone, { className: string; icon: ReactNode }> = {
  info: { className: "border-info/40 bg-info/12 text-info", icon: <Info className="size-4 shrink-0" /> },
  ok: { className: "border-ok/40 bg-ok/12 text-ok", icon: <CheckCircle2 className="size-4 shrink-0" /> },
  warn: { className: "border-warn/40 bg-warn/12 text-warn", icon: <AlertTriangle className="size-4 shrink-0" /> },
  bad: { className: "border-bad/40 bg-bad/12 text-bad", icon: <XCircle className="size-4 shrink-0" /> },
};

/**
 * Inline status banner. Uses the status-token colour pattern shared with Badge
 * and Toast. Pass `icon` to override the tone default, and `onDismiss` to render
 * a close affordance.
 */
export function Alert({
  tone = "info",
  title,
  icon,
  children,
  onDismiss,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const preset = TONES[tone];
  const t = useT();
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs", preset.className, className)}
    >
      {icon ?? preset.icon}
      <div className="min-w-0 flex-1 space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-current/90 leading-relaxed">{children}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("common.dismiss")}
          className="shrink-0 rounded p-0.5 opacity-70 transition hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

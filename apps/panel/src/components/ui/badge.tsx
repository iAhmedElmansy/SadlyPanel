import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "border-line bg-surface-2 text-ink-muted",
  ok: "border-ok/40 bg-ok/12 text-ok",
  warn: "border-warn/40 bg-warn/12 text-warn",
  bad: "border-bad/40 bg-bad/12 text-bad",
  info: "border-info/40 bg-info/12 text-info",
  brand: "border-brand/40 bg-brand/12 text-brand-soft",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("badge", TONES[tone], className)}>{children}</span>;
}

const STATE_TONES: Record<string, Tone> = {
  running: "ok",
  starting: "warn",
  stopping: "warn",
  offline: "neutral",
  installing: "info",
  install_failed: "bad",
  suspended: "bad",
  pending: "warn",
  active: "ok",
  error: "bad",
  success: "ok",
  failed: "bad",
};

export function StatusBadge({ state, className }: { state: string; className?: string }) {
  const tone = STATE_TONES[state] ?? "neutral";
  const label = state.replace(/_/g, " ");
  const pulse = state === "running" || state === "installing" || state === "starting";
  return (
    <Badge tone={tone} className={className}>
      <span
        className={cn("size-1.5 rounded-full bg-current", pulse && "animate-[pulse-soft_1.6s_ease-in-out_infinite]")}
        aria-hidden
      />
      {label}
    </Badge>
  );
}

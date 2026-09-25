"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";
import { useToast } from "./toast";

/**
 * Copy-to-clipboard button. Shows a tick for ~1.8s and falls back to a toast
 * when the browser denies clipboard access (common on plain http origins).
 */
export function CopyButton({
  value,
  label,
  className,
  compact = false,
  onCopied,
}: {
  value: string;
  label?: string;
  className?: string;
  /** Icon-only square button, for overlaying code blocks. */
  compact?: boolean;
  onCopied?: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const copyLabel = label ?? t("common.copy");

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        throw new Error("Clipboard API unavailable.");
      }
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.push(t("common.clipboardBlocked"), "warn");
    }
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={copy}
        title={copyLabel}
        aria-label={copyLabel}
        className={cn(
          "rounded-md border border-line bg-surface-2 p-1.5 text-ink-dim transition hover:text-ink",
          className,
        )}
      >
        {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
      </button>
    );
  }

  return (
    <button type="button" onClick={copy} className={cn("btn btn-ghost px-2 py-1 text-xs", className)}>
      {copied ? <Check className="size-3 text-ok" /> : <Copy className="size-3" />}
      {copied ? t("common.copied") : copyLabel}
    </button>
  );
}

/** Code block with an overlaid copy button. */
export function CodeBlock({
  value,
  className,
  maxHeight = "max-h-96",
  label,
}: {
  value: string;
  className?: string;
  maxHeight?: string;
  label?: string;
}) {
  return (
    <div className="relative">
      <pre
        className={cn(
          "overflow-auto rounded-md border border-line bg-[#060607] p-3 pe-12 font-mono text-xs leading-relaxed text-ink-muted",
          maxHeight,
          className,
        )}
      >
        {value}
      </pre>
      <CopyButton value={value} label={label} compact className="absolute end-2 top-2" />
    </div>
  );
}

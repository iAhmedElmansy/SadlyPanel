"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";
import { Modal } from "./modal";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
}

/**
 * Confirmation dialog built on top of Modal. Use directly as a controlled
 * component, or reach for `useConfirm()` to get an imperative
 * `await confirm(opts)` that resolves to a boolean.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "brand",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
  loading?: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const pending = loading || busy;

  const handleConfirm = async () => {
    try {
      setBusy(true);
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={title}
      width="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            type="button"
            className={cn("btn", tone === "danger" ? "btn-danger" : "btn-primary")}
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? <Loader2 className="size-3.5 spin" aria-hidden /> : null}
            {confirmLabel ?? t("common.confirm")}
          </button>
        </>
      }
    >
      {description ? (
        <div className="text-sm text-ink-muted">{description}</div>
      ) : (
        <p className="text-sm text-ink-muted">{t("common.actionCannotBeUndone")}</p>
      )}
    </Modal>
  );
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Imperative confirmation. Render `{dialog}` once, then
 * `if (await confirm({ title })) { ... }` in place of the native `confirm()`.
 */
export function useConfirm(): { confirm: (opts: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [state, setState] = useState<PendingConfirm | null>(null);
  const stateRef = useRef<PendingConfirm | null>(null);
  stateRef.current = state;

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    stateRef.current?.resolve(value);
    setState(null);
  }, []);

  const dialog = state ? (
    <ConfirmDialog
      open
      onClose={() => settle(false)}
      onConfirm={() => settle(true)}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      tone={state.tone}
    />
  ) : null;

  return { confirm, dialog };
}

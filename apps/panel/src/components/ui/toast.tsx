"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

/**
 * Minimal toast system. Client-only, no dependency: the admin/dashboard shells
 * wrap their children in <ToastProvider>, and any client component can call
 * `useToast().push(...)` — most usefully with the `{ ok, error, message }`
 * result objects the server actions already return.
 */

export type ToastTone = "ok" | "bad" | "warn" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  push: (message: string, tone?: ToastTone) => void;
  /** Convenience for server-action results. Returns the result unchanged. */
  report: <T extends { ok?: boolean; error?: string; message?: string; success?: string }>(result: T) => T;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONES: Record<ToastTone, { className: string; icon: ReactNode }> = {
  ok: { className: "border-ok/40 bg-ok/12 text-ok", icon: <CheckCircle2 className="size-4 shrink-0" /> },
  bad: { className: "border-bad/40 bg-bad/12 text-bad", icon: <XCircle className="size-4 shrink-0" /> },
  warn: { className: "border-warn/40 bg-warn/12 text-warn", icon: <AlertTriangle className="size-4 shrink-0" /> },
  info: { className: "border-info/40 bg-info/12 text-info", icon: <Info className="size-4 shrink-0" /> },
};

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((message: string, tone: ToastTone = "info") => {
    if (!message) return;
    counter += 1;
    const id = counter;
    setToasts((current) => [...current.slice(-4), { id, tone, message }]);
  }, []);

  const report = useCallback<ToastApi["report"]>(
    (result) => {
      if (result?.error) push(result.error, "bad");
      else if (result?.message) push(result.message, "ok");
      else if (result?.success) push(result.success, "ok");
      else if (result?.ok) push(t("common.done"), "ok");
      return result;
    },
    [push, t],
  );

  const api = useMemo<ToastApi>(() => ({ push, report, dismiss }), [push, report, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:end-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const t = useT();
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.tone === "bad" ? 8000 : 4500);
    return () => clearTimeout(timer);
  }, [toast.id, toast.tone, onDismiss]);

  const tone = TONES[toast.tone];

  return (
    <div
      role="status"
      className={cn(
        "animate-in pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border px-3 py-2.5 text-xs shadow-lg backdrop-blur",
        tone.className,
      )}
    >
      {tone.icon}
      <span className="min-w-0 flex-1 break-words">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded p-0.5 opacity-70 transition hover:opacity-100"
        aria-label={t("common.dismissNotification")}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * Returns the toast API. Safe to call outside a provider: it then falls back to
 * no-ops so components can be reused in contexts without the shell.
 */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  const fallback = useMemo<ToastApi>(
    () => ({ push: () => undefined, report: (result) => result, dismiss: () => undefined }),
    [],
  );
  return context ?? fallback;
}

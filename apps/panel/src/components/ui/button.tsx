"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "btn-primary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

export function Button({
  variant = "primary",
  className,
  children,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button className={cn("btn", VARIANTS[variant], className)} disabled={props.disabled || loading} {...props}>
      {loading ? <Loader2 className="size-3.5 spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** Submit button that automatically reflects the parent form's pending state. */
export function SubmitButton({
  variant = "primary",
  className,
  children,
  pendingLabel,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; pendingLabel?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={cn("btn", VARIANTS[variant], className)} disabled={pending || props.disabled} {...props}>
      {pending ? <Loader2 className="size-3.5 spin" aria-hidden /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

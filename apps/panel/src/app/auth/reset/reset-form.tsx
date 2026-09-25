"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { resetPasswordAction, type ActionState } from "../actions";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { checkPasswordStrength } from "@/lib/password";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

const STRENGTH_LABEL_KEYS = [
  "auth.strengthVeryWeak",
  "auth.strengthWeak",
  "auth.strengthFair",
  "auth.strengthGood",
  "auth.strengthStrong",
  "auth.strengthExcellent",
];

export function ResetForm({ token }: { token: string }) {
  const t = useT();
  const [state, action] = useActionState<ActionState, FormData>(resetPasswordAction, {});
  const [password, setPassword] = useState("");
  const strength = checkPasswordStrength(password);

  if (state.success) {
    return (
      <div className="panel-card animate-in p-8 text-center">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl border border-ok/40 bg-ok/10 text-ok">
          <ShieldCheck className="size-5" />
        </div>
        <h1 className="text-lg font-semibold text-ink">{t("auth.passwordResetDone")}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">{state.success}</p>
        <Link href="/auth/login" className="btn btn-primary mx-auto mt-6">
          {t("auth.goToSignIn")}
        </Link>
      </div>
    );
  }

  return (
    <div className="panel-card animate-in p-6 sm:p-8">
      <div className="mb-6 space-y-1.5">
        <h1 className="text-xl font-semibold text-ink">{t("auth.chooseNewPassword")}</h1>
        <p className="text-sm text-ink-muted">{t("auth.chooseNewPasswordDesc")}</p>
      </div>

      <form action={action} className="space-y-4" noValidate>
        <FormError message={state.error} />
        <FormSuccess message={state.success} />
        <input type="hidden" name="token" value={token} />

        <Field label={t("auth.newPassword")} htmlFor="password" required error={state.fieldErrors?.password}>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-dim" />
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth.newPasswordPlaceholder")}
              className="ps-9"
            />
          </div>
          {password ? (
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-1" aria-hidden>
                {Array.from({ length: 6 }).map((_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors",
                      index < strength.score
                        ? strength.score <= 2
                          ? "bg-bad"
                          : strength.score <= 4
                            ? "bg-warn"
                            : "bg-ok"
                        : "bg-surface-3",
                    )}
                  />
                ))}
              </div>
              <p className="text-xs text-ink-dim">
                {t(STRENGTH_LABEL_KEYS[Math.max(0, strength.score - 1)])}
                {strength.problems.length ? ` — ${strength.problems[0]}` : ""}
              </p>
            </div>
          ) : null}
        </Field>

        <Field label={t("auth.confirmPassword")} htmlFor="passwordConfirm" required error={state.fieldErrors?.passwordConfirm}>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-dim" />
            <Input
              id="passwordConfirm"
              name="passwordConfirm"
              type="password"
              autoComplete="new-password"
              required
              placeholder={t("auth.repeatPassword")}
              className="ps-9"
            />
          </div>
        </Field>

        <SubmitButton className="w-full" pendingLabel={t("auth.saving")}>
          <ShieldCheck className="size-4" />
          {t("auth.resetPassword")}
        </SubmitButton>
      </form>

      <p className="mt-6 border-t border-line pt-4 text-center text-xs text-ink-muted">
        <Link href="/auth/login" className="font-medium text-brand-soft hover:underline">
          {t("auth.backToSignIn")}
        </Link>
      </p>
    </div>
  );
}

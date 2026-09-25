"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AtSign, KeyRound, LogIn, MailCheck, ShieldCheck } from "lucide-react";
import { loginAction, resendVerificationAction, type ActionState } from "../actions";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { useT } from "@/lib/i18n/preferences";

export function LoginForm({
  registrationOpen,
  passwordResetEnabled,
  siteName,
}: {
  registrationOpen: boolean;
  passwordResetEnabled: boolean;
  siteName: string;
}) {
  const t = useT();
  const [state, action] = useActionState<ActionState, FormData>(loginAction, {});
  const [resendState, resendAction] = useActionState<ActionState, FormData>(resendVerificationAction, {});

  // Second step: password accepted, now collect the authenticator/recovery code.
  // Credentials are resubmitted from the same form so the flow stays stateless.
  if (state.twoFactor) {
    return (
      <div className="panel-card animate-in p-6 sm:p-8">
        <div className="mb-6 space-y-3">
          <span className="inline-flex items-center gap-2 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-ink-dim">
            <span aria-hidden className="h-px w-6 rounded-full bg-brand/40" />
            {t("auth.eyebrowTwoFactor")}
          </span>
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{t("auth.twoFactorTitle")}</h1>
            <p className="text-sm text-ink-muted">{t("auth.twoFactorDesc")}</p>
          </div>
        </div>

        <form action={action} className="space-y-4" noValidate>
          <FormError message={state.error} />
          <input type="hidden" name="challenge" value={state.challenge ?? ""} />
          <Field label={t("auth.authenticationCode")} htmlFor="totp" required>
            <div className="relative">
              <ShieldCheck className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-dim" />
              <Input
                id="totp"
                name="totp"
                inputMode="text"
                autoComplete="one-time-code"
                autoFocus
                required
                placeholder="123456"
                className="ps-9 tracking-widest"
              />
            </div>
          </Field>
          <SubmitButton className="w-full" pendingLabel={t("auth.verifying")}>
            <LogIn className="size-4" />
            {t("auth.verifyAndSignIn")}
          </SubmitButton>
        </form>
        <p className="mt-6 border-t border-line pt-4 text-center text-xs text-ink-dim">
          {t("auth.lostDevice")}
        </p>
      </div>
    );
  }

  return (
    <div className="panel-card animate-in p-6 sm:p-8">
      <div className="mb-6 space-y-3">
        <span className="inline-flex items-center gap-2 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-ink-dim">
          <span aria-hidden className="h-px w-6 rounded-full bg-brand/40" />
          {t("auth.eyebrowSignIn")}
        </span>
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{t("auth.signInTo", { name: siteName })}</h1>
          <p className="text-sm text-ink-muted">{t("auth.useUsernameOrEmail")}</p>
        </div>
      </div>

      <form action={action} className="space-y-4" noValidate>
        <FormError message={state.error} />

        <Field label={t("auth.usernameOrEmail")} htmlFor="identity" required error={state.fieldErrors?.identity}>
          <div className="relative">
            <AtSign className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-dim" />
            <Input
              id="identity"
              name="identity"
              autoComplete="username"
              autoFocus
              required
              placeholder={t("auth.usernameOrEmailPlaceholder")}
              className="ps-9"
            />
          </div>
        </Field>

        <Field
          label={
            <span className="flex w-full items-center justify-between gap-2">
              <span>{t("auth.password")}</span>
              {passwordResetEnabled ? (
                <Link href="/auth/forgot" className="font-medium text-brand-soft hover:underline">
                  {t("auth.forgotPassword")}
                </Link>
              ) : null}
            </span>
          }
          htmlFor="password"
          required
          error={state.fieldErrors?.password}
        >
          <div className="relative">
            <KeyRound className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-dim" />
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder={t("auth.passwordPlaceholder")}
              className="ps-9"
            />
          </div>
        </Field>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
          <input type="checkbox" name="remember" defaultChecked className="size-3.5 rounded border-line bg-canvas accent-brand" />
          {t("auth.keepSignedIn")}
        </label>

        <SubmitButton className="w-full" pendingLabel={t("auth.signingIn")}>
          <LogIn className="size-4" />
          {t("auth.signIn")}
        </SubmitButton>
      </form>

      {state.unverified ? (
        <form action={resendAction} className="mt-4 space-y-2 rounded-lg border border-line bg-surface-2 p-3">
          <p className="text-xs text-ink-muted">{t("auth.didntGetVerification")}</p>
          <FormSuccess message={resendState.success} />
          <FormError message={resendState.error} />
          <Field label={t("auth.usernameOrEmail")} htmlFor="resend-identity" required>
            <Input id="resend-identity" name="identity" autoComplete="username" required placeholder={t("auth.emailPlaceholder")} />
          </Field>
          <SubmitButton className="w-full" variant="ghost" pendingLabel={t("auth.sending")}>
            <MailCheck className="size-4" />
            {t("auth.resendVerificationEmail")}
          </SubmitButton>
        </form>
      ) : null}

      {registrationOpen ? (
        <p className="mt-6 border-t border-line pt-4 text-center text-xs text-ink-muted">
          {t("auth.noAccountYet")}{" "}
          <Link href="/auth/register" className="font-medium text-brand-soft hover:underline">
            {t("auth.createOne")}
          </Link>
        </p>
      ) : (
        <p className="mt-6 border-t border-line pt-4 text-center text-xs text-ink-dim">
          {t("auth.accountsProvisioned")}
        </p>
      )}
    </div>
  );
}

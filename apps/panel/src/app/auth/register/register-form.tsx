"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MailCheck, ShieldCheck, UserPlus } from "lucide-react";
import { registerAction, type ActionState } from "../actions";
import { Field, FormError, Input } from "@/components/ui/form";
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

export function RegisterForm({ firstRun, siteName }: { firstRun: boolean; siteName: string }) {
  const t = useT();
  const [state, action] = useActionState<ActionState, FormData>(registerAction, {});
  const [password, setPassword] = useState("");
  const strength = checkPasswordStrength(password);

  // Registration succeeded but the account needs email verification first.
  if (state.success) {
    return (
      <div className="panel-card animate-in p-8 text-center">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl border border-ok/40 bg-ok/10 text-ok">
          <MailCheck className="size-5" />
        </div>
        <h1 className="text-lg font-semibold text-ink">{t("auth.checkInbox")}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">{state.success}</p>
        <Link href="/auth/login" className="btn btn-primary mx-auto mt-6">
          {t("auth.goToSignIn")}
        </Link>
      </div>
    );
  }

  return (
    <div className="panel-card animate-in p-6 sm:p-8">
      <div className="mb-6 space-y-2">
        {firstRun ? (
          <span className="badge border-brand/40 bg-brand/12 text-brand-soft">
            <ShieldCheck className="size-3" />
            {t("auth.firstRunSetup")}
          </span>
        ) : null}
        <h1 className="text-xl font-semibold text-ink">
          {firstRun ? t("auth.createAdminAccount") : t("auth.joinSite", { name: siteName })}
        </h1>
        <p className="text-sm text-ink-muted">
          {firstRun ? t("auth.createAdminDesc") : t("auth.createAccountDesc")}
        </p>
      </div>

      <form action={action} className="space-y-4" noValidate>
        <FormError message={state.error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("auth.firstName")} htmlFor="firstName" required error={state.fieldErrors?.firstName}>
            <Input id="firstName" name="firstName" autoComplete="given-name" required placeholder={t("auth.firstNamePlaceholder")} />
          </Field>
          <Field label={t("auth.lastName")} htmlFor="lastName" required error={state.fieldErrors?.lastName}>
            <Input id="lastName" name="lastName" autoComplete="family-name" required placeholder={t("auth.lastNamePlaceholder")} />
          </Field>
        </div>

        <Field
          label={t("auth.username")}
          htmlFor="username"
          required
          hint={t("auth.usernameHint")}
          error={state.fieldErrors?.username}
        >
          <Input id="username" name="username" autoComplete="username" required placeholder={t("auth.usernamePlaceholder")} />
        </Field>

        <Field label={t("auth.emailAddress")} htmlFor="email" required error={state.fieldErrors?.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder={t("auth.emailPlaceholder")} />
        </Field>

        <Field label={t("auth.password")} htmlFor="password" required error={state.fieldErrors?.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("auth.passwordMin8")}
          />
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
          <Input
            id="passwordConfirm"
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            required
            placeholder={t("auth.repeatPassword")}
          />
        </Field>

        <SubmitButton className="w-full" pendingLabel={t("auth.creatingAccount")}>
          <UserPlus className="size-4" />
          {firstRun ? t("auth.createAdministrator") : t("auth.createAccount")}
        </SubmitButton>
      </form>

      <p className="mt-6 border-t border-line pt-4 text-center text-xs text-ink-muted">
        {t("auth.alreadyHaveAccount")}{" "}
        <Link href="/auth/login" className="font-medium text-brand-soft hover:underline">
          {t("auth.signIn")}
        </Link>
      </p>
    </div>
  );
}

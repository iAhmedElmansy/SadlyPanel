"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AtSign, KeyRound, Send } from "lucide-react";
import { forgotPasswordAction, type ActionState } from "../actions";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { useT } from "@/lib/i18n/preferences";

export function ForgotForm({ enabled }: { enabled: boolean }) {
  const t = useT();
  const [state, action] = useActionState<ActionState, FormData>(forgotPasswordAction, {});

  if (!enabled) {
    return (
      <div className="panel-card animate-in p-8 text-center">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-ink-muted">
          <KeyRound className="size-5" />
        </div>
        <h1 className="text-lg font-semibold text-ink">{t("auth.resetUnavailable")}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
          {t("auth.resetUnavailableDesc")}
        </p>
        <Link href="/auth/login" className="btn btn-primary mx-auto mt-6">
          {t("auth.backToSignIn")}
        </Link>
      </div>
    );
  }

  return (
    <div className="panel-card animate-in p-6 sm:p-8">
      <div className="mb-6 space-y-1.5">
        <h1 className="text-xl font-semibold text-ink">{t("auth.resetYourPassword")}</h1>
        <p className="text-sm text-ink-muted">{t("auth.resetYourPasswordDesc")}</p>
      </div>

      <form action={action} className="space-y-4" noValidate>
        <FormError message={state.error} />
        <FormSuccess message={state.success} />

        {state.success ? null : (
          <>
            <Field label={t("auth.usernameOrEmail")} htmlFor="identity" required>
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

            <SubmitButton className="w-full" pendingLabel={t("auth.sending")}>
              <Send className="size-4" />
              {t("auth.sendResetLink")}
            </SubmitButton>
          </>
        )}
      </form>

      <p className="mt-6 border-t border-line pt-4 text-center text-xs text-ink-muted">
        {t("auth.rememberedIt")}{" "}
        <Link href="/auth/login" className="font-medium text-brand-soft hover:underline">
          {t("auth.backToSignIn")}
        </Link>
      </p>
    </div>
  );
}

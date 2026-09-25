"use client";

import { useActionState } from "react";
import { KeyRound, Save } from "lucide-react";
import { changePasswordAction, updateProfileAction, type AccountState } from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { useT } from "@/lib/i18n/preferences";

export function AccountForms({
  user,
}: {
  user: { firstName: string; lastName: string; email: string; username: string };
}) {
  const t = useT();
  const [profileState, profileAction] = useActionState<AccountState, FormData>(updateProfileAction, {});
  const [passwordState, passwordAction] = useActionState<AccountState, FormData>(changePasswordAction, {});

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title={t("dashboard.accountProfileTitle")} description={t("dashboard.accountProfileDescription")} />
        <CardBody>
          <form action={profileAction} className="space-y-4">
            <FormError message={profileState.error} />
            <FormSuccess message={profileState.success} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("dashboard.accountFirstName")} required>
                <Input name="firstName" defaultValue={user.firstName} required />
              </Field>
              <Field label={t("dashboard.accountLastName")} required>
                <Input name="lastName" defaultValue={user.lastName} required />
              </Field>
            </div>
            <Field label={t("dashboard.accountUsername")} hint={t("dashboard.accountUsernameHint")}>
              <Input value={user.username} disabled />
            </Field>
            <Field label={t("dashboard.accountEmail")} required>
              <Input name="email" type="email" defaultValue={user.email} required />
            </Field>
            <SubmitButton pendingLabel={t("common.saving")}>
              <Save className="size-3.5" />
              {t("dashboard.accountSaveProfile")}
            </SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("dashboard.accountPasswordTitle")} description={t("dashboard.accountPasswordDescription")} />
        <CardBody>
          <form action={passwordAction} className="space-y-4">
            <FormError message={passwordState.error} />
            <FormSuccess message={passwordState.success} />
            <Field label={t("dashboard.accountCurrentPassword")} required>
              <Input name="currentPassword" type="password" autoComplete="current-password" required />
            </Field>
            <Field label={t("dashboard.accountNewPassword")} required hint={t("dashboard.accountNewPasswordHint")}>
              <Input name="newPassword" type="password" autoComplete="new-password" required />
            </Field>
            <Field label={t("dashboard.accountConfirmPassword")} required>
              <Input name="confirmPassword" type="password" autoComplete="new-password" required />
            </Field>
            <SubmitButton pendingLabel={t("common.updating")}>
              <KeyRound className="size-3.5" />
              {t("dashboard.accountChangePassword")}
            </SubmitButton>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

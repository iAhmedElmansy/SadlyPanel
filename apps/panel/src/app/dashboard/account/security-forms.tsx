"use client";

import { useActionState, useState } from "react";
import { ShieldCheck, ShieldOff, RefreshCw, Plus, Trash2 } from "lucide-react";
import {
  beginTotpAction,
  confirmTotpAction,
  disableTotpAction,
  regenerateRecoveryCodesAction,
  createApiKeyAction,
  deleteApiKeyAction,
  type TotpSetupState,
  type AccountState,
  type ApiKeyState,
} from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { Button, SubmitButton } from "@/components/ui/button";
import { CodeBlock, CopyButton } from "@/components/ui/copy-button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/preferences";
import { formatDate, relativeTime } from "@/lib/utils";
import { API_KEY_SCOPES } from "@/lib/constants";

interface ApiKeyRow {
  id: number;
  identifier: string;
  memo: string | null;
  permissions: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const t = useT();
  return (
    <div className="space-y-2 rounded-md border border-warn/40 bg-warn/10 p-3">
      <p className="text-xs font-medium text-warn">
        {t("dashboard.accountRecoveryCodesNotice")}
      </p>
      <CodeBlock value={codes.join("\n")} label={t("dashboard.accountCopyCodes")} />
    </div>
  );
}

function TotpSection({ enabled }: { enabled: boolean }) {
  const t = useT();
  const [setupState, setupAction] = useState<TotpSetupState>({});
  const [confirmState, confirmActionFn] = useActionState<TotpSetupState, FormData>(confirmTotpAction, {});
  const [disableState, disableActionFn] = useActionState<AccountState, FormData>(disableTotpAction, {});
  const [regenState, regenActionFn] = useActionState<TotpSetupState, FormData>(regenerateRecoveryCodesAction, {});
  const [starting, setStarting] = useState(false);

  const active = confirmState.setup ?? setupState.setup;
  const codes = confirmState.recoveryCodes ?? regenState.recoveryCodes;

  const begin = async () => {
    setStarting(true);
    const result = await beginTotpAction();
    setupAction(result);
    setStarting(false);
  };

  if (enabled) {
    return (
      <Card>
        <CardHeader
          title={t("dashboard.account2faTitle")}
          description={t("dashboard.account2faManageDescription")}
        />
        <CardBody className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-ok">
            <ShieldCheck className="size-4" /> {t("dashboard.account2faActive")}
          </div>

          {codes ? <RecoveryCodes codes={codes} /> : null}

          <form action={regenActionFn} className="space-y-3 border-t border-line pt-4">
            <p className="text-xs font-medium text-ink-muted">{t("dashboard.accountRegenerateHeading")}</p>
            <FormError message={regenState.error} />
            {regenState.success ? <FormSuccess message={regenState.success} /> : null}
            <Field label={t("dashboard.accountCurrentAuthCode")} required>
              <Input name="token" inputMode="numeric" placeholder="123456" autoComplete="one-time-code" required />
            </Field>
            <SubmitButton variant="ghost" pendingLabel={t("dashboard.accountGenerating")}>
              <RefreshCw className="size-3.5" /> {t("dashboard.accountRegenerateCodes")}
            </SubmitButton>
          </form>

          <form action={disableActionFn} className="space-y-3 border-t border-line pt-4">
            <p className="text-xs font-medium text-ink-muted">{t("dashboard.accountDisable2faHeading")}</p>
            <FormError message={disableState.error} />
            <FormSuccess message={disableState.success} />
            <Field label={t("dashboard.accountPasswordOrCode")} hint={t("dashboard.accountProvideEither")}>
              <Input name="password" type="password" autoComplete="current-password" placeholder={t("dashboard.accountPasswordPlaceholder")} />
            </Field>
            <Field label={t("dashboard.accountAuthCodeOptional")}>
              <Input name="token" inputMode="numeric" placeholder="123456" autoComplete="one-time-code" />
            </Field>
            <SubmitButton variant="danger" pendingLabel={t("dashboard.accountDisabling")}>
              <ShieldOff className="size-3.5" /> {t("dashboard.accountDisable2fa")}
            </SubmitButton>
          </form>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={t("dashboard.account2faTitle")}
        description={t("dashboard.account2faAddDescription")}
      />
      <CardBody className="space-y-4">
        {!active ? (
          <>
            <p className="text-sm text-ink-muted">
              {t("dashboard.account2faIntro")}
            </p>
            <Button onClick={begin} loading={starting}>
              <ShieldCheck className="size-3.5" /> {t("dashboard.accountEnable2fa")}
            </Button>
            <FormError message={setupState.error} />
          </>
        ) : codes ? (
          <>
            <FormSuccess message={confirmState.success} />
            <RecoveryCodes codes={codes} />
          </>
        ) : (
          <form action={confirmActionFn} className="space-y-4">
            <FormError message={confirmState.error} />
            <p className="text-sm text-ink-muted">
              {t("dashboard.account2faScanInstruction")}
            </p>
            <Field label={t("dashboard.accountSetupKey")} hint={t("dashboard.accountSetupKeyHint")}>
              <div className="flex items-center gap-2">
                <Input readOnly value={active.secret} className="font-mono text-xs" />
                <CopyButton value={active.secret} label={t("common.copy")} />
              </div>
            </Field>
            <Field label={t("dashboard.accountProvisioningUri")} hint={t("dashboard.accountProvisioningUriHint")}>
              <CodeBlock value={active.otpauthUri} label={t("dashboard.accountCopyUri")} />
            </Field>
            <input type="hidden" name="secret" value={active.secret} />
            <Field label={t("dashboard.accountVerificationCode")} required>
              <Input name="token" inputMode="numeric" placeholder="123456" autoComplete="one-time-code" required autoFocus />
            </Field>
            <SubmitButton pendingLabel={t("dashboard.accountConfirming")}>
              <ShieldCheck className="size-3.5" /> {t("dashboard.accountConfirmEnable")}
            </SubmitButton>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

function ApiKeysSection({ keys }: { keys: ApiKeyRow[] }) {
  const t = useT();
  const [state, action] = useActionState<ApiKeyState, FormData>(createApiKeyAction, {});
  const { confirm, dialog } = useConfirm();
  const toast = useToast();

  const remove = async (key: ApiKeyRow) => {
    const ok = await confirm({
      title: t("dashboard.accountRevokeKeyTitle"),
      description: t("dashboard.accountRevokeKeyDescription", { name: key.memo ?? key.identifier }),
      confirmLabel: t("dashboard.accountRevoke"),
      tone: "danger",
    });
    if (!ok) return;
    toast.report(await deleteApiKeyAction(key.id));
  };

  return (
    <Card>
      <CardHeader title={t("dashboard.accountApiKeysTitle")} description={t("dashboard.accountApiKeysDescription")} />
      <CardBody className="space-y-5">
        {state.createdToken ? (
          <div className="space-y-2 rounded-md border border-ok/40 bg-ok/10 p-3">
            <p className="text-xs font-medium text-ok">
              {t("dashboard.accountNewKeyNotice")}
            </p>
            <CodeBlock value={state.createdToken.token} label={t("dashboard.accountCopyToken")} />
          </div>
        ) : null}

        {keys.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t("dashboard.accountColIdentifier")}</th>
                  <th>{t("dashboard.accountColMemo")}</th>
                  <th>{t("dashboard.accountColScopes")}</th>
                  <th>{t("dashboard.accountColLastUsed")}</th>
                  <th>{t("dashboard.accountColExpires")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id}>
                    <td className="font-mono text-xs">{key.identifier}</td>
                    <td className="text-xs text-ink-muted">{key.memo ?? "—"}</td>
                    <td className="text-xs text-ink-dim">{key.permissions.join(", ") || "—"}</td>
                    <td className="text-xs text-ink-dim">{key.lastUsedAt ? relativeTime(key.lastUsedAt) : t("dashboard.accountNever")}</td>
                    <td className="text-xs text-ink-dim">{key.expiresAt ? formatDate(key.expiresAt) : t("dashboard.accountNever")}</td>
                    <td className="text-end">
                      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => remove(key)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-ink-dim">{t("dashboard.accountNoApiKeys")}</p>
        )}

        <form action={action} className="space-y-4 border-t border-line pt-4">
          <p className="text-xs font-medium text-ink-muted">{t("dashboard.accountCreateKeyHeading")}</p>
          <FormError message={state.error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("dashboard.accountMemo")} hint={t("dashboard.accountMemoHint")}>
              <Input name="memo" placeholder={t("dashboard.accountMemoPlaceholder")} maxLength={120} />
            </Field>
            <Field label={t("dashboard.accountExpiryOptional")} hint={t("dashboard.accountExpiryHint")}>
              <Input name="expiresAt" type="date" />
            </Field>
          </div>
          <Field label={t("dashboard.accountScopes")} required>
            <div className="grid gap-2 sm:grid-cols-2">
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope.key} className="flex cursor-pointer items-start gap-2 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    name={`scope:${scope.key}`}
                    className="mt-0.5 size-3.5 rounded border-line bg-canvas accent-brand"
                  />
                  <span>
                    <span className="block font-mono text-ink">{scope.key}</span>
                    <span className="block text-ink-dim">{scope.label}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <SubmitButton pendingLabel={t("common.creating")}>
            <Plus className="size-3.5" /> {t("dashboard.accountCreateApiKey")}
          </SubmitButton>
        </form>
      </CardBody>
      {dialog}
    </Card>
  );
}

export function SecurityForms({ totpEnabled, apiKeys }: { totpEnabled: boolean; apiKeys: ApiKeyRow[] }) {
  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <TotpSection enabled={totpEnabled} />
      <ApiKeysSection keys={apiKeys} />
    </div>
  );
}

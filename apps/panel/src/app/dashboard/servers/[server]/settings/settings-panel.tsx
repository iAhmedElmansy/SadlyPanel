"use client";

import { useState } from "react";
import { RefreshCcw, Save } from "lucide-react";
import { reinstallServerAction, renameServerAction } from "../../actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useT } from "@/lib/i18n/preferences";

export function ServerSettingsPanel({
  serverUuid,
  name,
  description,
  canRename,
  canReinstall,
  details,
}: {
  serverUuid: string;
  name: string;
  description: string;
  canRename: boolean;
  canReinstall: boolean;
  details: { label: string; value: string }[];
}) {
  const [busy, setBusy] = useState<"rename" | "reinstall" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const t = useT();

  return (
    <div className="space-y-6">
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      <Card>
        <CardHeader title={t("dashboard.serverSettingsDetailsTitle")} />
        <CardBody>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setBusy("rename");
              setError(null);
              setNotice(null);
              const result = await renameServerAction(
                serverUuid,
                String(data.get("name") ?? ""),
                String(data.get("description") ?? ""),
              );
              setError(result.error ?? null);
              setNotice(result.message ?? null);
              setBusy(null);
            }}
          >
            <Field label={t("dashboard.serverSettingsNameLabel")} required>
              <Input name="name" defaultValue={name} required disabled={!canRename} maxLength={80} />
            </Field>
            <Field label={t("dashboard.serverSettingsDescriptionLabel")}>
              <Textarea name="description" defaultValue={description} disabled={!canRename} rows={2} maxLength={500} />
            </Field>
            {canRename ? (
              <Button type="submit" loading={busy === "rename"}>
                <Save className="size-3.5" />
                {t("common.save")}
              </Button>
            ) : null}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("dashboard.serverSettingsDebugTitle")} />
        <CardBody>
          <dl className="grid gap-3 sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label} className="min-w-0">
                <dt className="text-xs text-ink-dim">{detail.label}</dt>
                <dd className="truncate font-mono text-xs text-ink">{detail.value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      {canReinstall ? (
        <Card className="border-bad/30">
          <CardHeader
            title={t("dashboard.serverSettingsReinstallTitle")}
            description={t("dashboard.serverSettingsReinstallDesc")}
          />
          <CardBody>
            <Button
              variant="danger"
              loading={busy === "reinstall"}
              onClick={async () => {
                if (
                  !(await confirm({
                    title: t("dashboard.serverSettingsReinstallConfirmTitle"),
                    description: t("dashboard.serverSettingsReinstallConfirmDesc"),
                    tone: "danger",
                    confirmLabel: t("dashboard.serverSettingsReinstallConfirm"),
                  }))
                )
                  return;
                setBusy("reinstall");
                setError(null);
                setNotice(null);
                const result = await reinstallServerAction(serverUuid);
                setError(result.error ?? null);
                setNotice(result.message ?? null);
                setBusy(null);
              }}
            >
              <RefreshCcw className="size-3.5" />
              {t("dashboard.serverSettingsReinstallConfirm")}
            </Button>
          </CardBody>
        </Card>
      ) : null}
      {dialog}
    </div>
  );
}

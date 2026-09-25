"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { updateWebsiteRuntimeAction } from "../../actions";
import { PHP_VERSIONS } from "@/lib/constants";
import { useT } from "@/lib/i18n/preferences";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select } from "@/components/ui/form";

/**
 * Hosting-specific runtime settings (document root + PHP version). Backed by the
 * new updateWebsiteRuntimeAction, which re-syncs the node spec and reverse proxy.
 */
export function RuntimeSettings({
  serverUuid,
  runtime,
  phpVersion,
  documentRoot,
  canEdit,
}: {
  serverUuid: string;
  runtime: string;
  phpVersion: string | null;
  documentRoot: string;
  canEdit: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isPhp = runtime === "php";

  return (
    <Card>
      <CardHeader title={t("dashboard.hostingSettingsRuntimeTitle")} description={isPhp ? t("dashboard.hostingSettingsRuntimeDescPhp") : t("dashboard.hostingSettingsRuntimeDescStatic")} />
      <CardBody>
        {error ? <Alert tone="bad" className="mb-4">{error}</Alert> : null}
        {notice ? <Alert tone="ok" className="mb-4">{notice}</Alert> : null}
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setBusy(true);
            setError(null);
            setNotice(null);
            const result = await updateWebsiteRuntimeAction(serverUuid, {
              documentRoot: String(data.get("documentRoot") ?? ""),
              phpVersion: isPhp ? String(data.get("phpVersion") ?? "") : undefined,
            });
            setError(result.error ?? null);
            setNotice(result.message ?? null);
            setBusy(false);
          }}
        >
          <Field label={t("dashboard.hostingSettingsDocumentRootLabel")} hint={t("dashboard.hostingSettingsDocumentRootHint")}>
            <Input name="documentRoot" defaultValue={documentRoot} disabled={!canEdit} />
          </Field>
          {isPhp ? (
            <Field label={t("dashboard.hostingSettingsPhpVersionLabel")}>
              <Select name="phpVersion" defaultValue={phpVersion ?? "8.3"} disabled={!canEdit}>
                {PHP_VERSIONS.map((v) => (
                  <option key={v} value={v}>
                    PHP {v}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {canEdit ? (
            <Button type="submit" loading={busy}>
              <Save className="size-3.5" />
              {t("dashboard.hostingSettingsSaveRuntime")}
            </Button>
          ) : null}
        </form>
      </CardBody>
    </Card>
  );
}

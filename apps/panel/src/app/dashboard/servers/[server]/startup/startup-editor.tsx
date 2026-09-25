"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { updateStartupVariableAction } from "../../actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useT } from "@/lib/i18n/preferences";

export interface StartupVariable {
  id: number;
  name: string;
  description: string | null;
  envVariable: string;
  value: string;
  userEditable: boolean;
}

export function StartupEditor({
  serverUuid,
  invocation,
  variables,
  canEdit,
}: {
  serverUuid: string;
  invocation: string;
  variables: StartupVariable[];
  canEdit: boolean;
}) {
  const [values, setValues] = useState<Record<number, string>>(
    Object.fromEntries(variables.map((variable) => [variable.id, variable.value])),
  );
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const t = useT();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={t("dashboard.serverStartupCommandTitle")} description={t("dashboard.serverStartupCommandDesc")} />
        <CardBody>
          <pre className="overflow-x-auto rounded-md border border-line bg-[#060607] p-3 font-mono text-xs leading-relaxed text-ink-muted">
            {invocation}
          </pre>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("dashboard.serverStartupVariablesTitle")} description={t("dashboard.serverStartupVariablesDesc")} />
        {error ? <div className="border-b border-bad/30 bg-bad/10 px-5 py-2 text-xs text-bad">{error}</div> : null}
        {notice ? <div className="border-b border-ok/30 bg-ok/10 px-5 py-2 text-xs text-ok">{notice}</div> : null}
        <CardBody className="grid gap-5 sm:grid-cols-2">
          {variables.map((variable) => (
            <Field
              key={variable.id}
              label={variable.name}
              hint={variable.description ?? variable.envVariable}
            >
              <div className="flex gap-2">
                <Input
                  value={values[variable.id] ?? ""}
                  disabled={!canEdit || !variable.userEditable}
                  onChange={(event) => setValues((prev) => ({ ...prev, [variable.id]: event.target.value }))}
                />
                {canEdit && variable.userEditable ? (
                  <Button
                    variant="ghost"
                    loading={savingId === variable.id}
                    onClick={async () => {
                      setSavingId(variable.id);
                      setError(null);
                      setNotice(null);
                      const result = await updateStartupVariableAction(serverUuid, variable.id, values[variable.id] ?? "");
                      setError(result.error ?? null);
                      setNotice(result.message ?? null);
                      setSavingId(null);
                    }}
                  >
                    <Save className="size-3.5" />
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 font-mono text-[10px] text-ink-dim">{variable.envVariable}</p>
            </Field>
          ))}
          {variables.length === 0 ? <p className="text-sm text-ink-muted">{t("dashboard.serverStartupNoVariables")}</p> : null}
        </CardBody>
      </Card>
    </div>
  );
}

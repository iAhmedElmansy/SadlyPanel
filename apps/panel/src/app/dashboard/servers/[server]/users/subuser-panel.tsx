"use client";

import { useState } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { addSubuserAction, removeSubuserAction } from "../../actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, FormError, Input } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { SUBUSER_PERMISSIONS } from "@/lib/constants";
import { useT } from "@/lib/i18n/preferences";

export interface SubuserRow {
  id: number;
  username: string;
  email: string;
  permissions: string[];
}

const GROUPS = SUBUSER_PERMISSIONS.reduce<Record<string, string[]>>((acc, permission) => {
  const [group] = permission.split(".");
  acc[group] = acc[group] ?? [];
  acc[group].push(permission);
  return acc;
}, {});

export function SubuserPanel({
  serverUuid,
  subusers,
  canCreate,
  canDelete,
}: {
  serverUuid: string;
  subusers: SubuserRow[];
  canCreate: boolean;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const t = useT();

  return (
    <>
      <Card>
        <CardHeader
          title={t("dashboard.serverUsersTitle")}
          description={t("dashboard.serverUsersDesc")}
          action={
            canCreate ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-3.5" />
                {t("dashboard.serverUsersAdd")}
              </Button>
            ) : null
          }
        />

        {error ? (
          <CardBody className="border-b border-line-soft">
            <Alert tone="bad">{error}</Alert>
          </CardBody>
        ) : null}
        {notice ? <div className="border-b border-ok/30 bg-ok/10 px-5 py-2 text-xs text-ok">{notice}</div> : null}

        {subusers.length === 0 ? (
          <EmptyState
            icon={<UserPlus className="size-5" />}
            title={t("dashboard.serverUsersEmptyTitle")}
            description={t("dashboard.serverUsersEmptyDesc")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t("dashboard.serverUsersColUser")}</th>
                  <th>{t("dashboard.serverUsersColPermissions")}</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {subusers.map((subuser) => (
                  <tr key={subuser.id}>
                    <td>
                      <span className="block text-ink">{subuser.username}</span>
                      <span className="block text-xs text-ink-dim">{subuser.email}</span>
                    </td>
                    <td className="text-xs text-ink-muted">{t("dashboard.serverUsersPermissionCount", { count: String(subuser.permissions.length) })}</td>
                    <td>
                      {canDelete ? (
                        <button
                          type="button"
                          title={t("dashboard.serverUsersRemove")}
                          disabled={busy}
                          onClick={async () => {
                            if (
                              !(await confirm({
                                title: t("dashboard.serverUsersRemoveConfirmTitle", { name: subuser.username }),
                                description: t("dashboard.serverUsersRemoveConfirmDesc"),
                                tone: "danger",
                                confirmLabel: t("dashboard.serverUsersRemove"),
                              }))
                            )
                              return;
                            setBusy(true);
                            const result = await removeSubuserAction(serverUuid, subuser.id);
                            setError(result.error ?? null);
                            setNotice(result.message ?? null);
                            setBusy(false);
                          }}
                          className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("dashboard.serverUsersAdd")}
        description={t("dashboard.serverUsersAddModalDesc")}
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button form="add-subuser" type="submit" loading={busy}>
              {t("common.add")}
            </Button>
          </>
        }
      >
        <form
          id="add-subuser"
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const permissions = data.getAll("permissions").map(String);
            setBusy(true);
            setError(null);
            const result = await addSubuserAction(serverUuid, String(data.get("email") ?? ""), permissions);
            setBusy(false);
            if (result.ok) {
              setOpen(false);
              setNotice(result.message ?? null);
            } else {
              setError(result.error ?? t("dashboard.serverUsersAddError"));
            }
          }}
        >
          <FormError message={error} />
          <Field label={t("dashboard.serverUsersEmailLabel")} required>
            <Input name="email" type="email" required placeholder="teammate@example.com" />
          </Field>

          <div className="space-y-3">
            {Object.entries(GROUPS).map(([group, permissions]) => (
              <fieldset key={group} className="rounded-md border border-line p-3">
                <legend className="px-1 text-xs font-medium uppercase tracking-wide text-ink-dim">{group}</legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {permissions.map((permission) => (
                    <label key={permission} className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
                      <input
                        type="checkbox"
                        name="permissions"
                        value={permission}
                        className="size-3.5 rounded border-line bg-canvas accent-brand"
                      />
                      <span className="font-mono">{permission}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </form>
      </Modal>
      {dialog}
    </>
  );
}

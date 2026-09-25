"use client";

import { useState } from "react";
import { Archive, Download, Loader2, Lock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { createBackupAction, deleteBackupAction, restoreBackupAction } from "../../actions";
import { Card, CardBody } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/badge";
import { formatBytes, formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

export interface BackupRow {
  id: number;
  uuid: string;
  name: string;
  bytes: number;
  isSuccessful: boolean;
  isLocked: boolean;
  completedAt: string | null;
  createdAt: string;
}

export function BackupPanel({
  serverUuid,
  backups,
  limit,
  canCreate,
  canDelete,
  canRestore,
}: {
  serverUuid: string;
  backups: BackupRow[];
  limit: number;
  canCreate: boolean;
  canDelete: boolean;
  canRestore: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const atLimit = backups.length >= limit;

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await fn();
    setError(result.error ?? null);
    setNotice(result.message ?? null);
    setBusy(false);
    return result;
  };

  return (
    <>
      <Card>
        <CardHeader
          title={t("dashboard.backups")}
          description={t("dashboard.backupsCount", { count: backups.length, limit })}
          action={
            canCreate ? (
              <Button onClick={() => setOpen(true)} disabled={atLimit} title={atLimit ? t("dashboard.backupLimitReached") : undefined}>
                <Plus className="size-3.5" />
                {t("dashboard.newBackup")}
              </Button>
            ) : null
          }
        />

        {error ? <div className="border-b border-bad/30 bg-bad/10 px-5 py-2 text-xs text-bad">{error}</div> : null}
        {notice ? <div className="border-b border-ok/30 bg-ok/10 px-5 py-2 text-xs text-ok">{notice}</div> : null}

        {backups.length === 0 ? (
          <EmptyState
            icon={<Archive className="size-5" />}
            title={t("dashboard.noBackupsTitle")}
            description={t("dashboard.noBackupsDesc")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t("dashboard.colName")}</th>
                  <th>{t("dashboard.colSize")}</th>
                  <th>{t("dashboard.colCreated")}</th>
                  <th>{t("dashboard.colStatus")}</th>
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.id}>
                    <td>
                      <span className="flex items-center gap-1.5 text-ink">
                        {backup.isLocked ? <Lock className="size-3 text-warn" /> : null}
                        {backup.name}
                      </span>
                      <span className="block font-mono text-xs text-ink-dim">{backup.uuid.slice(0, 8)}</span>
                    </td>
                    <td className="font-mono text-xs text-ink-muted">{backup.bytes ? formatBytes(backup.bytes) : "—"}</td>
                    <td className="text-xs text-ink-dim">{formatDate(backup.createdAt)}</td>
                    <td>
                      {backup.completedAt ? (
                        <StatusBadge state={backup.isSuccessful ? "success" : "failed"} />
                      ) : (
                        <span className="badge border-info/40 bg-info/12 text-info">
                          <Loader2 className="size-3 spin" />
                          {t("dashboard.running")}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {canRestore && backup.isSuccessful ? (
                          <button
                            type="button"
                            title={t("dashboard.restoreBackup")}
                            disabled={busy}
                            onClick={async () => {
                              if (
                                !(await confirm({
                                  title: t("dashboard.restoreConfirmTitle", { name: backup.name }),
                                  description: t("dashboard.restoreConfirmDesc"),
                                  tone: "danger",
                                  confirmLabel: t("dashboard.restore"),
                                }))
                              )
                                return;
                              await act(() => restoreBackupAction(serverUuid, backup.id, false));
                            }}
                            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
                          >
                            <RotateCcw className="size-3.5" />
                          </button>
                        ) : null}
                        {canDelete && !backup.isLocked ? (
                          <button
                            type="button"
                            title={t("dashboard.deleteBackup")}
                            disabled={busy}
                            onClick={async () => {
                              if (
                                !(await confirm({
                                  title: t("dashboard.deleteBackupConfirmTitle", { name: backup.name }),
                                  description: t("dashboard.deleteBackupConfirmDesc"),
                                  tone: "danger",
                                  confirmLabel: t("dashboard.deleteBackup"),
                                }))
                              )
                                return;
                              await act(() => deleteBackupAction(serverUuid, backup.id));
                            }}
                            className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <CardBody className="border-t border-line text-xs text-ink-dim">
          <span className="flex items-center gap-1.5">
            <Download className="size-3.5" />
            {t("dashboard.backupsFooter")}
          </span>
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("dashboard.createBackup")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button form="create-backup" type="submit" loading={busy}>
              {t("dashboard.startBackup")}
            </Button>
          </>
        }
      >
        <form
          id="create-backup"
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const result = await act(() =>
              createBackupAction(serverUuid, String(data.get("name") ?? ""), String(data.get("ignore") ?? "")),
            );
            if (result.ok) setOpen(false);
          }}
        >
          <FormError message={error} />
          <Field label={t("dashboard.backupNameLabel")} hint={t("dashboard.backupNameHint")}>
            <Input name="name" placeholder={t("dashboard.backupNamePlaceholder")} />
          </Field>
          <Field label={t("dashboard.ignoredPathsLabel")} hint={t("dashboard.ignoredPathsHint")}>
            <Textarea name="ignore" rows={4} placeholder={"logs/*\ncache/*"} />
          </Field>
        </form>
      </Modal>
      {dialog}
    </>
  );
}

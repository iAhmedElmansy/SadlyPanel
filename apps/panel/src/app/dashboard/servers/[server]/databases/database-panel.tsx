"use client";

import { useState } from "react";
import { Database, Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react";
import { createDatabaseAction, deleteDatabaseAction, rotateDatabasePasswordAction } from "../../actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { useT } from "@/lib/i18n/preferences";

export interface DatabaseRow {
  id: number;
  database: string;
  username: string;
  password: string;
  remote: string;
  host: { name: string; host: string; port: number; phpMyAdminUrl: string | null };
  createdAt: string;
}

export function DatabasePanel({
  serverUuid,
  databases,
  limit,
  canCreate,
  canDelete,
  canRotate,
}: {
  serverUuid: string;
  databases: DatabaseRow[];
  limit: number;
  canCreate: boolean;
  canDelete: boolean;
  canRotate: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const { confirm, dialog } = useConfirm();

  const toggleReveal = (id: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const atLimit = databases.length >= limit;

  return (
    <>
      <Card>
        <CardHeader
          title={t("dashboard.serverDbTitle")}
          description={t("dashboard.serverDbUsage", { count: String(databases.length), limit: String(limit) })}
          action={
            canCreate ? (
              <Button onClick={() => setOpen(true)} disabled={atLimit} title={atLimit ? t("dashboard.serverDbLimitReached") : undefined}>
                <Plus className="size-3.5" />
                {t("dashboard.serverDbNew")}
              </Button>
            ) : null
          }
        />

        {error ? <div className="border-b border-bad/30 bg-bad/10 px-5 py-2 text-xs text-bad">{error}</div> : null}
        {notice ? <div className="border-b border-ok/30 bg-ok/10 px-5 py-2 text-xs text-ok">{notice}</div> : null}

        {databases.length === 0 ? (
          <EmptyState
            icon={<Database className="size-5" />}
            title={t("dashboard.serverDbEmptyTitle")}
            description={t("dashboard.serverDbEmptyDescription")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t("dashboard.serverDbColDatabase")}</th>
                  <th>{t("dashboard.serverDbColUsername")}</th>
                  <th>{t("dashboard.serverDbColPassword")}</th>
                  <th>{t("dashboard.serverDbColHost")}</th>
                  <th>{t("dashboard.serverDbColRemote")}</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {databases.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-xs text-ink">{row.database}</td>
                    <td className="font-mono text-xs text-ink-muted">{row.username}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => toggleReveal(row.id)}
                        className="flex items-center gap-1.5 font-mono text-xs text-ink-muted hover:text-ink"
                      >
                        {revealed.has(row.id) ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        {revealed.has(row.id) ? row.password : "••••••••••••"}
                      </button>
                    </td>
                    <td className="font-mono text-xs text-ink-dim">
                      {row.host.host}:{row.host.port}
                    </td>
                    <td className="font-mono text-xs text-ink-dim">{row.remote}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {canRotate ? (
                          <button
                            type="button"
                            title={t("dashboard.serverDbRotate")}
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              const result = await rotateDatabasePasswordAction(serverUuid, row.id);
                              setError(result.error ?? null);
                              setNotice(result.message ?? null);
                              setBusy(false);
                            }}
                            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
                          >
                            <KeyRound className="size-3.5" />
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            title="Delete database"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                !(await confirm({
                                  title: `Delete ${row.database}?`,
                                  description: "All data will be lost. This cannot be undone.",
                                  tone: "danger",
                                  confirmLabel: "Delete database",
                                }))
                              )
                                return;
                              setBusy(true);
                              const result = await deleteDatabaseAction(serverUuid, row.id);
                              setError(result.error ?? null);
                              setNotice(result.message ?? null);
                              setBusy(false);
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

        {databases.some((row) => row.host.phpMyAdminUrl) ? (
          <CardBody className="border-t border-line text-xs text-ink-dim">
            Manage tables through phpMyAdmin:{" "}
            {databases
              .filter((row) => row.host.phpMyAdminUrl)
              .map((row) => (
                <a
                  key={row.id}
                  href={row.host.phpMyAdminUrl!}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mr-2 text-brand-soft hover:underline"
                >
                  {row.host.name}
                </a>
              ))}
          </CardBody>
        ) : null}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create database"
        description="A dedicated MySQL user is created with full privileges on this database only."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="create-db" type="submit" loading={busy}>
              Create
            </Button>
          </>
        }
      >
        <form
          id="create-db"
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setBusy(true);
            setError(null);
            const result = await createDatabaseAction(
              serverUuid,
              String(data.get("name") ?? ""),
              String(data.get("remote") ?? "%"),
            );
            setBusy(false);
            if (result.ok) {
              setOpen(false);
              setNotice(result.message ?? "Database created.");
            } else {
              setError(result.error ?? "Unable to create database.");
            }
          }}
        >
          <FormError message={error} />
          <FormSuccess message={notice} />
          <Field label="Database name" required hint="Prefixed automatically to stay unique per server.">
            <Input name="name" required placeholder="main" pattern="[A-Za-z0-9_]+" />
          </Field>
          <Field label="Allowed remote" hint="Use % for any host, or an IP to lock access down.">
            <Input name="remote" defaultValue="%" />
          </Field>
        </form>
      </Modal>
      {dialog}
    </>
  );
}

"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Pencil, Plus, RefreshCw, Trash2, Wifi } from "lucide-react";
import {
  createDatabaseHostAction,
  deleteDatabaseHostAction,
  refreshDatabaseHealthAction,
  testDatabaseHostAction,
  updateDatabaseHostAction,
  type DatabaseHostState,
} from "./actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

export type HostStatus = "unknown" | "reachable" | "unreachable" | "stale";

export interface DatabaseHostRow {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  maxDatabases: number;
  phpMyAdminUrl: string | null;
  nodeId: number | null;
  nodeName: string | null;
  databaseCount: number;
  status: HostStatus;
  serverVersion: string | null;
  statusNote: string | null;
  latencyMs: number | null;
  lastCheckedAt: string | null;
}

const STATUS_TONE: Record<HostStatus, "ok" | "bad" | "warn" | "neutral"> = {
  reachable: "ok",
  unreachable: "bad",
  stale: "warn",
  unknown: "neutral",
};

const STATUS_KEY: Record<HostStatus, "admin.dhOnline" | "admin.dhOffline" | "admin.dhStale" | "admin.dhUnchecked"> = {
  reachable: "admin.dhOnline",
  unreachable: "admin.dhOffline",
  stale: "admin.dhStale",
  unknown: "admin.dhUnchecked",
};

export function DatabaseHostManager({
  hosts,
  nodes,
}: {
  hosts: DatabaseHostRow[];
  nodes: { id: number; name: string }[];
}) {
  const [createState, createAction] = useActionState<DatabaseHostState, FormData>(createDatabaseHostAction, {});
  const [editState, editAction] = useActionState<DatabaseHostState, FormData>(updateDatabaseHostAction, {});
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DatabaseHostRow | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { confirm, dialog } = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const t = useT();

  const online = hosts.filter((host) => host.status === "reachable").length;
  const broken = hosts.filter((host) => host.status === "unreachable").length;

  const runAndReport = async (action: () => Promise<DatabaseHostState>) => {
    const result = await action();
    if (result.error) toast.push(result.error, "bad");
    else if (result.success) toast.push(result.success, "ok");
    router.refresh();
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-dim">
          {hosts.length > 0 ? (
            <>
              <Badge tone="ok">{t("admin.dhReachableCount", { count: online })}</Badge>
              {broken > 0 ? <Badge tone="bad">{t("admin.dhUnreachableCount", { count: broken })}</Badge> : null}
              <span>{t("admin.dhOfHosts", { count: hosts.length })}</span>
            </>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            loading={refreshing}
            onClick={async () => {
              setRefreshing(true);
              await runAndReport(refreshDatabaseHealthAction);
              setRefreshing(false);
            }}
          >
            <RefreshCw className="size-3.5" />
            {t("admin.dhCheckAll")}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            {t("admin.dhAddHost")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader
          title={t("admin.dhHeaderTitle")}
          description={t("admin.dhHeaderDesc")}
        />
        {hosts.length === 0 ? (
          <EmptyState
            icon={<Database className="size-5" />}
            title={t("admin.dhEmptyTitle")}
            description={t("admin.dhEmptyDesc")}
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-3.5" />
                {t("admin.dhAddHostShort")}
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t("admin.dhColName")}</th>
                  <th>{t("admin.dhColAddress")}</th>
                  <th>{t("admin.dhColStatus")}</th>
                  <th>{t("admin.dhColUser")}</th>
                  <th>{t("admin.dhColDatabases")}</th>
                  <th>{t("admin.dhColNode")}</th>
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody>
                {hosts.map((host) => (
                  <tr key={host.id}>
                    <td className="text-ink">{host.name}</td>
                    <td className="font-mono text-xs text-ink-muted">
                      {host.host}:{host.port}
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <Badge tone={STATUS_TONE[host.status]}>{t(STATUS_KEY[host.status])}</Badge>
                        <span className="text-[11px] text-ink-dim" title={host.statusNote ?? undefined}>
                          {host.status === "unreachable" && host.statusNote
                            ? host.statusNote.slice(0, 48)
                            : host.serverVersion
                              ? `v${host.serverVersion}${host.latencyMs !== null ? ` · ${host.latencyMs}ms` : ""}`
                              : t("admin.dhNotChecked")}
                        </span>
                        {host.lastCheckedAt ? (
                          <span className="text-[11px] text-ink-dim">{relativeTime(host.lastCheckedAt)}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="font-mono text-xs text-ink-muted">{host.username}</td>
                    <td className="font-mono text-xs">
                      {host.databaseCount}
                      {host.maxDatabases > 0 ? ` / ${host.maxDatabases}` : ""}
                    </td>
                    <td className="text-xs text-ink-dim">{host.nodeName ?? t("admin.dhAnyNode")}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title={t("admin.dhTestConnection")}
                          disabled={testingId === host.id}
                          onClick={async () => {
                            setTestingId(host.id);
                            await runAndReport(() => testDatabaseHostAction(host.id));
                            setTestingId(null);
                          }}
                          className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
                        >
                          <Wifi className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          title={t("admin.dhEditHost")}
                          onClick={() => setEditing(host)}
                          className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          title={t("admin.dhDeleteHost")}
                          onClick={async () => {
                            if (
                              !(await confirm({
                                title: t("admin.dhDeleteTitle", { name: host.name }),
                                description: t("admin.dhDeleteDesc"),
                                tone: "danger",
                                confirmLabel: t("admin.dhDeleteHost"),
                              }))
                            )
                              return;
                            await runAndReport(() => deleteDatabaseHostAction(host.id));
                          }}
                          className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("admin.dhAddHost")}
        description={t("admin.dhAddModalDesc")}
      >
        <form action={createAction} className="space-y-4">
          <FormError message={createState.error} />
          <FormSuccess message={createState.success} />
          <Field label={t("admin.dhDisplayName")} required>
            <Input name="name" required placeholder={t("admin.dhDisplayNamePlaceholder")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label={t("admin.dhHost")} required>
              <Input name="host" required placeholder="127.0.0.1" className="font-mono" />
            </Field>
            <Field label={t("admin.dhPort")} required>
              <Input name="port" type="number" min={1} max={65535} defaultValue={3306} required />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("admin.dhUsername")} required>
              <Input name="username" required autoComplete="off" />
            </Field>
            <Field label={t("admin.dhPassword")} required hint={t("admin.dhPasswordHint")}>
              <Input name="password" type="password" required autoComplete="new-password" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("admin.dhMaxDatabases")} hint={t("admin.dhMaxDatabasesHint")}>
              <Input name="maxDatabases" type="number" min={0} defaultValue={0} />
            </Field>
            <Field label={t("admin.dhLinkedNode")} hint={t("admin.dhLinkedNodeHint")}>
              <Select name="nodeId" defaultValue="">
                <option value="">{t("admin.dhAnyNodeOption")}</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t("admin.dhPhpMyAdminUrl")} hint={t("admin.dhPhpMyAdminUrlHint")}>
            <Input name="phpMyAdminUrl" placeholder="https://pma.example.com" />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <SubmitButton pendingLabel={t("admin.dhAdding")}>{t("admin.dhAddHostShort")}</SubmitButton>
          </div>
        </form>
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={t("admin.dhEditTitle", { name: editing?.name ?? "" })}>
        {editing ? (
          <form action={editAction} className="space-y-4">
            <input type="hidden" name="hostId" value={editing.id} />
            <FormError message={editState.error} />
            <FormSuccess message={editState.success} />
            <Field label={t("admin.dhDisplayName")} required>
              <Input name="name" defaultValue={editing.name} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field label={t("admin.dhHost")} required>
                <Input name="host" defaultValue={editing.host} required className="font-mono" />
              </Field>
              <Field label={t("admin.dhPort")} required>
                <Input name="port" type="number" min={1} max={65535} defaultValue={editing.port} required />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("admin.dhUsername")} required>
                <Input name="username" defaultValue={editing.username} required autoComplete="off" />
              </Field>
              <Field label={t("admin.dhPassword")} hint={t("admin.dhPasswordKeepHint")}>
                <Input name="password" type="password" autoComplete="new-password" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("admin.dhMaxDatabases")}>
                <Input name="maxDatabases" type="number" min={0} defaultValue={editing.maxDatabases} />
              </Field>
              <Field label={t("admin.dhLinkedNode")}>
                <Select name="nodeId" defaultValue={editing.nodeId ?? ""}>
                  <option value="">{t("admin.dhAnyNodeOption")}</option>
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t("admin.dhPhpMyAdminUrl")}>
              <Input name="phpMyAdminUrl" defaultValue={editing.phpMyAdminUrl ?? ""} />
            </Field>
            {editing.statusNote ? (
              <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
                {t("admin.dhLastProbe", { note: editing.statusNote })}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                {t("common.close")}
              </Button>
              <SubmitButton pendingLabel={t("common.saving")}>{t("admin.dhSaveHost")}</SubmitButton>
            </div>
          </form>
        ) : null}
      </Modal>
      {dialog}
    </>
  );
}

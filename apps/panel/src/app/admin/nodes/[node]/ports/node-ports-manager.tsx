"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Network, Plus, Trash2 } from "lucide-react";
import {
  createNodeAllocationsAction,
  deleteNodeAllocationAction,
  deleteUnusedNodeAllocationsAction,
  type AllocationState,
} from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { useT } from "@/lib/i18n/preferences";

export interface NodePortRow {
  id: number;
  ip: string;
  ipAlias: string | null;
  port: number;
  notes: string | null;
  isPrimary: boolean;
  server: { name: string; uuidShort: string } | null;
}

export function NodePortsManager({ nodeId, allocations }: { nodeId: number; allocations: NodePortRow[] }) {
  const t = useT();
  const [state, action] = useActionState<AllocationState, FormData>(createNodeAllocationsAction, {});
  const [notice, setNotice] = useState<AllocationState>({});
  const [showAssigned, setShowAssigned] = useState(true);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const assignedTotal = useMemo(() => allocations.filter((a) => a.server !== null).length, [allocations]);
  const freeTotal = allocations.length - assignedTotal;

  const filtered = useMemo(
    () => allocations.filter((allocation) => showAssigned || allocation.server === null),
    [allocations, showAssigned],
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader title={t("admin.portsAddTitle")} description={t("admin.portsAddDesc")} />
        <CardBody>
          <form action={action} className="space-y-4">
            <FormError message={state.error} />
            <FormSuccess message={state.success} />

            <input type="hidden" name="nodeId" value={nodeId} />

            <Field label={t("admin.portsIpLabel")} required hint={t("admin.portsIpHint")}>
              <Input name="ip" required placeholder="0.0.0.0" className="font-mono" />
            </Field>

            <Field label={t("admin.portsIpAliasLabel")} hint={t("admin.portsIpAliasHint")}>
              <Input name="ipAlias" placeholder="node1.sadlystudios.bond" />
            </Field>

            <Field label={t("admin.portsPortsLabel")} required hint={t("admin.portsPortsHint")}>
              <Input name="ports" required placeholder="25565-25575" className="font-mono" />
            </Field>

            <Field label={t("admin.portsNotesLabel")}>
              <Input name="notes" placeholder={t("admin.portsNotesPlaceholder")} />
            </Field>

            <SubmitButton className="w-full" pendingLabel={t("common.creating")}>
              <Plus className="size-3.5" />
              {t("admin.portsCreate")}
            </SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("admin.portsAllocations")}
          description={t("admin.portsAllocationsDesc", { total: allocations.length, reserved: assignedTotal, free: freeTotal })}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={showAssigned}
                  onChange={(event) => setShowAssigned(event.target.checked)}
                  className="size-3.5 rounded border-line bg-canvas accent-brand"
                />
                {t("admin.portsShowReserved")}
              </label>
              <Button
                variant="danger"
                loading={busy}
                disabled={freeTotal === 0}
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: t("admin.portsPruneConfirmTitle"),
                      description: t("admin.portsPruneConfirmDesc"),
                      tone: "danger",
                      confirmLabel: t("admin.portsPruneUnused"),
                    }))
                  )
                    return;
                  setBusy(true);
                  setNotice(await deleteUnusedNodeAllocationsAction(nodeId));
                  setBusy(false);
                }}
                className="px-2 py-1 text-xs"
              >
                {t("admin.portsPruneUnused")}
              </Button>
            </div>
          }
        />

        {notice.error ? (
          <CardBody className="border-b border-line-soft">
            <Alert tone="bad">{notice.error}</Alert>
          </CardBody>
        ) : null}
        {notice.success ? (
          <div className="border-b border-ok/30 bg-ok/10 px-5 py-2 text-xs text-ok">{notice.success}</div>
        ) : null}

        {allocations.length === 0 ? (
          <EmptyState
            icon={<Network className="size-5" />}
            title={t("admin.portsNoPorts")}
            description={t("admin.portsNoPortsDesc")}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Network className="size-5" />}
            title={t("admin.portsNoFree")}
            description={t("admin.portsNoFreeDesc")}
          />
        ) : (
          <div className="max-h-[640px] overflow-auto">
            <table className="table-base">
              <thead className="sticky top-0">
                <tr>
                  <th>{t("admin.portsThAddress")}</th>
                  <th>{t("admin.portsThAlias")}</th>
                  <th>{t("admin.portsThReservedBy")}</th>
                  <th>{t("admin.portsThNotes")}</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((allocation) => (
                  <tr key={allocation.id}>
                    <td className="font-mono text-xs text-ink">
                      {allocation.ip}:{allocation.port}
                    </td>
                    <td className="font-mono text-xs text-ink-dim">{allocation.ipAlias ?? "—"}</td>
                    <td className="text-xs">
                      {allocation.server ? (
                        <span className="flex items-center gap-1.5">
                          <Link href="/admin/servers" className="text-brand-soft hover:underline">
                            {allocation.server.name}
                          </Link>
                          {allocation.isPrimary ? <Badge tone="brand">{t("admin.portsPrimary")}</Badge> : null}
                        </span>
                      ) : (
                        <Badge tone="ok">{t("admin.portsFree")}</Badge>
                      )}
                    </td>
                    <td className="text-xs text-ink-dim">{allocation.notes ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        title={allocation.server ? t("admin.portsAssignedTitle") : t("admin.portsDeleteTitle")}
                        disabled={allocation.server !== null}
                        onClick={async () => {
                          setNotice(await deleteNodeAllocationAction(allocation.id));
                        }}
                        className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad disabled:opacity-25"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {dialog}
    </div>
  );
}

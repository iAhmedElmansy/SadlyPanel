"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Network, Plus, Trash2 } from "lucide-react";
import {
  createAllocationsAction,
  deleteAllocationAction,
  deleteUnusedAllocationsAction,
  type AllocationState,
} from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { useT } from "@/lib/i18n/preferences";

export interface AllocationRow {
  id: number;
  nodeId: number;
  ip: string;
  ipAlias: string | null;
  port: number;
  notes: string | null;
  isPrimary: boolean;
  server: { name: string; uuidShort: string } | null;
}

export function AllocationManager({
  nodes,
  allocations,
}: {
  nodes: { id: number; name: string; fqdn: string }[];
  allocations: AllocationRow[];
}) {
  const t = useT();
  const [state, action] = useActionState<AllocationState, FormData>(createAllocationsAction, {});
  const [notice, setNotice] = useState<AllocationState>({});
  const [nodeFilter, setNodeFilter] = useState<number>(nodes[0]?.id ?? 0);
  const [showAssigned, setShowAssigned] = useState(true);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const filtered = useMemo(
    () =>
      allocations.filter(
        (allocation) => allocation.nodeId === nodeFilter && (showAssigned || allocation.server === null),
      ),
    [allocations, nodeFilter, showAssigned],
  );

  const assigned = filtered.filter((allocation) => allocation.server !== null).length;

  if (nodes.length === 0) {
    return (
      <Card>
        <CardHeader title={t("admin.allocsNoNodes")} description={t("admin.allocsNoNodesDesc")} />
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader title={t("admin.portsAddTitle")} description={t("admin.allocsAddDesc")} />
        <CardBody>
          <form action={action} className="space-y-4">
            <FormError message={state.error} />
            <FormSuccess message={state.success} />

            <Field label={t("admin.allocsNode")} required>
              <Select name="nodeId" defaultValue={nodeFilter} required>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </Select>
            </Field>

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
          description={t("admin.allocsCountDesc", { total: filtered.length, assigned })}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select value={nodeFilter} onChange={(event) => setNodeFilter(Number(event.target.value))} className="w-40">
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </Select>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={showAssigned}
                  onChange={(event) => setShowAssigned(event.target.checked)}
                  className="size-3.5 rounded border-line bg-canvas accent-brand"
                />
                {t("admin.allocsShowAssigned")}
              </label>
              <Button
                variant="danger"
                loading={busy}
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
                  setNotice(await deleteUnusedAllocationsAction(nodeFilter));
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
        {notice.success ? <div className="border-b border-ok/30 bg-ok/10 px-5 py-2 text-xs text-ok">{notice.success}</div> : null}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Network className="size-5" />}
            title={t("admin.portsNoPorts")}
            description={t("admin.allocsNoPortsDesc")}
          />
        ) : (
          <div className="max-h-[640px] overflow-auto">
            <table className="table-base">
              <thead className="sticky top-0">
                <tr>
                  <th>{t("admin.portsThAddress")}</th>
                  <th>{t("admin.portsThAlias")}</th>
                  <th>{t("admin.allocsThAssignedTo")}</th>
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
                          <Link href={`/admin/servers`} className="text-brand-soft hover:underline">
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
                        title={t("admin.portsDeleteTitle")}
                        disabled={allocation.server !== null}
                        onClick={async () => {
                          setNotice(await deleteAllocationAction(allocation.id));
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

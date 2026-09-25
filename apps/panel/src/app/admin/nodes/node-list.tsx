"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HardDrive, Plus, RefreshCw, Server, Trash2, Wifi } from "lucide-react";
import { createLocationAction, deleteNodeAction, testNodeAction, type NodeState } from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/meter";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatMib, relativeTime } from "@/lib/utils";
import { NodeForm, EMPTY_NODE } from "./node-form";
import { useActionState } from "react";
import { useT } from "@/lib/i18n/preferences";

export type NodeHealth = "online" | "degraded" | "offline" | "unknown";

export interface NodeRow {
  id: number;
  name: string;
  fqdn: string;
  scheme: string;
  locationName: string | null;
  public: boolean;
  maintenanceMode: boolean;
  serverCount: number;
  allocationCount: number;
  freeAllocations: number;
  capacity: {
    memory: { used: number; total: number; overallocated: number };
    disk: { used: number; total: number; overallocated: number };
    cpu: { used: number; total: number; overallocated: number };
  };
  health: NodeHealth;
  lastHeartbeatAt: string | null;
  daemonVersion: string | null;
  live: {
    cpuPercent: number;
    memoryUsed: number;
    memoryTotal: number;
    diskUsed: number;
    diskTotal: number;
    runningServers: number;
    latencyMs: number;
  } | null;
}

const HEALTH_TONE: Record<NodeHealth, "ok" | "warn" | "bad" | "neutral"> = {
  online: "ok",
  degraded: "warn",
  offline: "bad",
  unknown: "neutral",
};

const HEALTH_KEY: Record<NodeHealth, "admin.healthOnline" | "admin.healthDegraded" | "admin.healthOffline" | "admin.healthUnknown"> = {
  online: "admin.healthOnline",
  degraded: "admin.healthDegraded",
  offline: "admin.healthOffline",
  unknown: "admin.healthUnknown",
};

/** Refresh interval for the node list; matches the daemon heartbeat cadence. */
const POLL_MS = 15_000;

export function NodeList({
  nodes,
  locations,
}: {
  nodes: NodeRow[];
  locations: { id: number; name: string; shortCode: string }[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [locationState, locationAction] = useActionState<NodeState, FormData>(createLocationAction, {});
  const toast = useToast();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const t = useT();

  // Live health without a websocket: re-render the server component on a timer.
  useEffect(() => {
    if (!autoRefresh || nodes.length === 0) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, nodes.length, router]);

  const report = (result: NodeState) => {
    if (result.error) toast.push(result.error, "bad");
    else if (result.success) toast.push(result.success, "ok");
    router.refresh();
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-dim">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => setAutoRefresh(event.target.checked)}
            className="size-3.5 cursor-pointer rounded border-line bg-canvas accent-brand"
          />
          <RefreshCw className={`size-3 ${autoRefresh ? "text-ok" : ""}`} />
          {t("admin.nlAutoRefresh", { seconds: POLL_MS / 1000 })}
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setLocationOpen(true)}>
            <Plus className="size-3.5" />
            {t("admin.nlAddLocation")}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            {t("admin.addNode")}
          </Button>
        </div>
      </div>

      {nodes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HardDrive className="size-5" />}
            title={t("admin.nlEmptyTitle")}
            description={t("admin.nlEmptyDesc")}
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-3.5" />
                {t("admin.overviewAddFirstNode")}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid animate-in gap-4 xl:grid-cols-2">
          {nodes.map((node) => (
            <Card key={node.id}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/nodes/${node.id}`} className="hover:text-brand-soft">
                      {node.name}
                    </Link>
                    <Badge tone={HEALTH_TONE[node.health]}>{t(HEALTH_KEY[node.health])}</Badge>
                    {node.maintenanceMode ? <Badge tone="warn">{t("admin.nlMaintenance")}</Badge> : null}
                    {!node.public ? <Badge tone="neutral">{t("admin.dmPrivate")}</Badge> : null}
                  </span>
                }
                description={
                  <span className="font-mono text-xs">
                    {node.scheme}://{node.fqdn}
                    {node.locationName ? ` · ${node.locationName}` : ""}
                    {node.daemonVersion ? ` · ${t("admin.nlDaemon", { version: node.daemonVersion })}` : ""}
                  </span>
                }
                action={
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost"
                      loading={testingId === node.id}
                      onClick={async () => {
                        setTestingId(node.id);
                        report(await testNodeAction(node.id));
                        setTestingId(null);
                      }}
                      className="px-2 py-1 text-xs"
                    >
                      <Wifi className="size-3" />
                      {t("admin.nlTest")}
                    </Button>
                    <Link href={`/admin/nodes/${node.id}`} className="btn btn-ghost px-2 py-1 text-xs">
                      {t("admin.nlConfigure")}
                    </Link>
                    <button
                      type="button"
                      title={t("admin.nlDeleteNode")}
                      onClick={async () => {
                        if (
                          !(await confirm({
                            title: t("admin.nlDeleteNodeTitle", { name: node.name }),
                            description: t("admin.nlDeleteNodeDesc"),
                            tone: "danger",
                            confirmLabel: t("admin.nlDeleteNode"),
                          }))
                        )
                          return;
                        report(await deleteNodeAction(node.id));
                      }}
                      className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                }
              />
              <CardBody className="space-y-4">
                <Meter
                  label={t("admin.nlMeterMemory")}
                  used={node.capacity.memory.used}
                  total={node.capacity.memory.overallocated}
                  valueLabel={`${formatMib(node.capacity.memory.used)} / ${formatMib(node.capacity.memory.overallocated)}`}
                />
                <Meter
                  label={t("admin.nlMeterDisk")}
                  used={node.capacity.disk.used}
                  total={node.capacity.disk.overallocated}
                  valueLabel={`${formatMib(node.capacity.disk.used)} / ${formatMib(node.capacity.disk.overallocated)}`}
                />
                <Meter
                  label={t("admin.nlMeterCpu")}
                  used={node.capacity.cpu.used}
                  total={node.capacity.cpu.overallocated}
                  valueLabel={`${node.capacity.cpu.used}% / ${node.capacity.cpu.overallocated}%`}
                />

                {node.live ? (
                  <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 text-xs sm:grid-cols-4">
                    <Live label={t("admin.nlHostCpu")} value={`${node.live.cpuPercent}%`} />
                    <Live
                      label={t("admin.nlHostRam")}
                      value={
                        node.live.memoryTotal > 0
                          ? `${Math.round((node.live.memoryUsed / node.live.memoryTotal) * 100)}%`
                          : "—"
                      }
                      hint={formatMib(node.live.memoryUsed)}
                    />
                    <Live
                      label={t("admin.nlHostDisk")}
                      value={
                        node.live.diskTotal > 0 ? `${Math.round((node.live.diskUsed / node.live.diskTotal) * 100)}%` : "—"
                      }
                      hint={formatMib(node.live.diskUsed)}
                    />
                    <Live label={t("admin.nlRunning")} value={String(node.live.runningServers)} hint={`${node.live.latencyMs}ms`} />
                  </div>
                ) : (
                  <p className="rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs text-ink-dim">
                    {t("admin.nlNoHeartbeatPre")} <span className="font-mono">remote</span> {t("admin.nlNoHeartbeatPost")}
                  </p>
                )}

                <dl className="grid grid-cols-4 gap-3 border-t border-line pt-3 text-xs">
                  <div>
                    <dt className="text-ink-dim">{t("admin.nlServers")}</dt>
                    <dd className="flex items-center gap-1 font-mono text-ink">
                      <Server className="size-3" />
                      {node.serverCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-dim">{t("admin.nlPorts")}</dt>
                    <dd className="font-mono text-ink">{node.allocationCount}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-dim">{t("admin.nlFreePorts")}</dt>
                    <dd className="font-mono text-ink">{node.freeAllocations}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-dim">{t("admin.nlHeartbeat")}</dt>
                    <dd className="font-mono text-ink">{relativeTime(node.lastHeartbeatAt)}</dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("admin.addNode")}
        description={t("admin.nlAddNodeDesc")}
        width="lg"
      >
        <NodeForm mode="create" values={EMPTY_NODE} locations={locations} onDone={() => setCreateOpen(false)} />
      </Modal>

      <Modal open={locationOpen} onClose={() => setLocationOpen(false)} title={t("admin.nlAddLocation")} description={t("admin.nlAddLocationDesc")}>
        <form action={locationAction} className="space-y-4">
          <FormError message={locationState.error} />
          <FormSuccess message={locationState.success} />
          <Field label={t("admin.nlShortCode")} required hint={t("admin.nlShortCodeHint")}>
            <Input name="shortCode" required placeholder="eu-west" />
          </Field>
          <Field label={t("admin.nlName")} required>
            <Input name="name" required placeholder="Europe West" />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => setLocationOpen(false)}>
              {t("common.close")}
            </Button>
            <SubmitButton pendingLabel={t("common.creating")}>{t("admin.nlCreateLocation")}</SubmitButton>
          </div>
        </form>
      </Modal>
      {dialog}
    </>
  );
}

function Live({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-ink-dim">{label}</p>
      <p className="truncate font-mono text-ink">{value}</p>
      {hint ? <p className="truncate text-[11px] text-ink-dim">{hint}</p> : null}
    </div>
  );
}

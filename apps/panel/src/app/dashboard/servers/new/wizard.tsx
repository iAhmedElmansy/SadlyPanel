"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Cpu,
  Database,
  HardDrive,
  Lock,
  MemoryStick,
  Network,
  Rocket,
  Server as ServerIcon,
  Wrench,
} from "lucide-react";
import { createUserServerAction, type CreateState } from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatMib } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";
import { serversThatFit, nodeIsFull, type FreeResources } from "@/lib/services/quota-math";

export interface UserWizardEggVariable {
  id: number;
  name: string;
  description: string | null;
  envVariable: string;
  defaultValue: string;
  userEditable: boolean;
  userViewable: boolean;
}

export interface UserWizardEgg {
  id: number;
  name: string;
  description: string | null;
  kind: string;
  nestName: string;
  variables: UserWizardEggVariable[];
}

/** Per-node capacity snapshot. Free amounts are null when the dimension is unlimited. */
export interface UserWizardNode {
  id: number;
  name: string;
  percentMemory: number;
  percentDisk: number;
  percentCpu: number;
  percentOverall: number;
  freeMemory: number | null;
  freeDisk: number | null;
  freeCpu: number | null;
  freeAllocations: number;
  planLocked: boolean;
  requiredPlanName: string | null;
  maintenance: boolean;
}

export interface UserWizardPlan {
  name: string;
  memory: number;
  disk: number;
  cpu: number;
  remainingMemory: number | null;
  remainingDisk: number | null;
  remainingCpu: number | null;
  usedMemory: number;
  usedDisk: number;
  usedCpu: number;
  allocationLimit: number;
  databaseLimit: number;
  backupLimit: number;
  serverCount: number;
}

const MEM_MIN = 128;
const DISK_MIN = 64;
const CPU_MIN = 25;

type NodeReason = "maintenance" | "plan" | "full" | "too-small" | null;

interface NodeState {
  locked: boolean;
  reason: NodeReason;
  fits: number | null;
}

/** Pure, size-aware node evaluation shared by the initial selection and live re-render. */
function evalNode(
  node: UserWizardNode,
  size: { memory: number; disk: number; cpu: number; allocations: number },
): NodeState {
  const free: FreeResources = {
    memory: node.freeMemory,
    disk: node.freeDisk,
    cpu: node.freeCpu,
    allocations: node.freeAllocations,
  };
  if (node.maintenance) return { locked: true, reason: "maintenance", fits: null };
  if (node.planLocked) return { locked: true, reason: "plan", fits: null };
  if (nodeIsFull(free)) return { locked: true, reason: "full", fits: 0 };
  const fits = serversThatFit(free, size);
  if (fits !== null && fits < 1) return { locked: true, reason: "too-small", fits };
  return { locked: false, reason: null, fits };
}

/** A slim used/free capacity bar. Turns amber past 75% and red past 90%. */
function CapacityBar({ label, percent, icon }: { label: string; percent: number; icon: ReactNode }) {
  const tone = percent >= 90 ? "bg-bad" : percent >= 75 ? "bg-warn" : "bg-brand";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-ink-dim">
        <span className="flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span>{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

export function UserServerWizard({
  eggs,
  nodes,
  plan,
}: {
  eggs: UserWizardEgg[];
  nodes: UserWizardNode[];
  plan: UserWizardPlan;
}) {
  const t = useT();
  const [state, action] = useActionState<CreateState, FormData>(createUserServerAction, {});

  const memUnlimited = plan.remainingMemory === null;
  const diskUnlimited = plan.remainingDisk === null;
  const cpuUnlimited = plan.remainingCpu === null;
  const remMem = plan.remainingMemory ?? Number.POSITIVE_INFINITY;
  const remDisk = plan.remainingDisk ?? Number.POSITIVE_INFINITY;
  const remCpu = plan.remainingCpu ?? Number.POSITIVE_INFINITY;

  // Fully-consumed plan: not enough of some capped dimension left for even a
  // minimum server. Block creation with a clear upgrade / free-up message.
  const outOfQuota =
    (!memUnlimited && remMem < MEM_MIN) ||
    (!diskUnlimited && remDisk < DISK_MIN) ||
    (!cpuUnlimited && remCpu < CPU_MIN);

  const maxPorts = Math.max(1, plan.allocationLimit);

  // Sensible defaults: unlimited dimensions get a modest starting size; capped
  // dimensions default to the whole remaining allowance (which equals the plan
  // total for a user who owns no servers yet).
  const initMemory = memUnlimited ? 2048 : Math.max(MEM_MIN, remMem);
  const initDisk = diskUnlimited ? 10240 : Math.max(DISK_MIN, remDisk);
  const initCpu = cpuUnlimited ? 100 : Math.max(CPU_MIN, remCpu);

  const [eggId, setEggId] = useState<number>(eggs[0]?.id ?? 0);
  const [memory, setMemory] = useState<number>(initMemory);
  const [disk, setDisk] = useState<number>(initDisk);
  const [cpu, setCpu] = useState<number>(initCpu);
  const [ports, setPorts] = useState<number>(1);
  const [databases, setDatabases] = useState<number>(plan.databaseLimit);

  const requestedSize = useMemo(() => ({ memory, disk, cpu, allocations: ports }), [memory, disk, cpu, ports]);

  const nodeStates = useMemo(() => {
    const map = new Map<number, NodeState>();
    for (const node of nodes) map.set(node.id, evalNode(node, requestedSize));
    return map;
  }, [nodes, requestedSize]);

  const selectableNodes = useMemo(() => nodes.filter((n) => !nodeStates.get(n.id)?.locked), [nodes, nodeStates]);
  const selectableIds = selectableNodes.map((n) => n.id).join(",");

  const [nodeId, setNodeId] = useState<number>(
    () =>
      nodes.find((n) => !evalNode(n, { memory: initMemory, disk: initDisk, cpu: initCpu, allocations: 1 }).locked)?.id ??
      0,
  );

  // Keep the selection valid: if resizing makes the chosen node unfit, hop to
  // the first node that still works (leaving deploy disabled when none do).
  useEffect(() => {
    const current = nodeStates.get(nodeId);
    if (!current || current.locked) {
      const first = selectableNodes[0]?.id;
      if (first) setNodeId(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectableIds, nodeId]);

  const egg = useMemo(() => eggs.find((item) => item.id === eggId), [eggs, eggId]);
  const grouped = useMemo(() => {
    const map = new Map<string, UserWizardEgg[]>();
    for (const item of eggs) {
      const list = map.get(item.nestName) ?? [];
      list.push(item);
      map.set(item.nestName, list);
    }
    return [...map.entries()];
  }, [eggs]);

  const viewableVars = egg?.variables.filter((v) => v.userViewable) ?? [];

  const overMemory = !memUnlimited && memory > remMem;
  const overDisk = !diskUnlimited && disk > remDisk;
  const overCpu = !cpuUnlimited && cpu > remCpu;
  const belowMin = memory < MEM_MIN || disk < DISK_MIN || cpu < CPU_MIN;

  const selectedState = nodeStates.get(nodeId);
  const nodeReady = !!selectedState && !selectedState.locked;
  const canDeploy =
    eggs.length > 0 && !outOfQuota && nodeReady && !overMemory && !overDisk && !overCpu && !belowMin;

  const kindLabel = (kind: string) =>
    ({
      game: t("dashboard.serversKindGame"),
      application: t("dashboard.serversKindApplication"),
      webhost: t("dashboard.serversKindWebhost"),
    })[kind] ?? kind;

  const fmtMem = (value: number, unlimited: boolean) => (unlimited ? t("dashboard.cswUnlimited") : formatMib(value));
  const usagePercent = (used: number, total: number) =>
    total > 0 ? Math.min(100, Math.max(0, Math.round((used / total) * 100))) : 0;

  const nodeReason = (node: UserWizardNode, s: NodeState): { text: string; icon: ReactNode } | null => {
    switch (s.reason) {
      case "maintenance":
        return { text: t("dashboard.cswNodeMaintenance"), icon: <Wrench className="size-3" /> };
      case "plan":
        return {
          text: t("dashboard.cswNodeRequires", {
            plan: node.requiredPlanName ?? t("dashboard.cswNodeRequiresFallback"),
          }),
          icon: <Lock className="size-3" />,
        };
      case "full":
        return { text: t("dashboard.cswNodeFull"), icon: <Lock className="size-3" /> };
      case "too-small":
        return { text: t("dashboard.cswNodeTooSmall"), icon: <Lock className="size-3" /> };
      default:
        return null;
    }
  };

  // --- Plan quota summary (rendered in every state) ---
  const quotaTiles: { label: string; icon: ReactNode; main: string; percent: number | null }[] = [
    {
      label: t("dashboard.cswRam"),
      icon: <MemoryStick className="size-3.5" />,
      main: memUnlimited
        ? t("dashboard.cswUnlimited")
        : t("dashboard.cswLeftOfTotal", { remaining: formatMib(remMem), total: formatMib(plan.memory) }),
      percent: memUnlimited ? null : usagePercent(plan.usedMemory, plan.memory),
    },
    {
      label: t("dashboard.cswDisk"),
      icon: <HardDrive className="size-3.5" />,
      main: diskUnlimited
        ? t("dashboard.cswUnlimited")
        : t("dashboard.cswLeftOfTotal", { remaining: formatMib(remDisk), total: formatMib(plan.disk) }),
      percent: diskUnlimited ? null : usagePercent(plan.usedDisk, plan.disk),
    },
    {
      label: t("dashboard.cswCpu"),
      icon: <Cpu className="size-3.5" />,
      main: cpuUnlimited
        ? t("dashboard.cswUnlimited")
        : t("dashboard.cswLeftOfTotal", { remaining: `${remCpu}%`, total: `${plan.cpu}%` }),
      percent: cpuUnlimited ? null : usagePercent(plan.usedCpu, plan.cpu),
    },
    { label: t("dashboard.cswPorts"), icon: <Network className="size-3.5" />, main: String(maxPorts), percent: null },
    {
      label: t("dashboard.cswDatabases"),
      icon: <Database className="size-3.5" />,
      main: String(plan.databaseLimit),
      percent: null,
    },
    {
      label: t("dashboard.cswBackups"),
      icon: <ServerIcon className="size-3.5" />,
      main: String(plan.backupLimit),
      percent: null,
    },
  ];

  const quotaPanel = (
    <Card>
      <CardHeader title={t("dashboard.cswPlanTitle", { plan: plan.name })} description={t("dashboard.cswPlanDesc")} />
      <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {quotaTiles.map((item) => (
          <div key={item.label} className="rounded-lg border border-line bg-surface-2/40 p-2.5">
            <span className="flex items-center gap-1 text-[11px] text-ink-dim">
              {item.icon}
              {item.label}
            </span>
            <p className="mt-0.5 text-sm font-semibold text-ink">{item.main}</p>
            {item.percent !== null ? (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cn(
                    "h-full rounded-full",
                    item.percent >= 90 ? "bg-bad" : item.percent >= 75 ? "bg-warn" : "bg-brand",
                  )}
                  style={{ width: `${item.percent}%` }}
                />
              </div>
            ) : null}
          </div>
        ))}
      </CardBody>
    </Card>
  );

  if (eggs.length === 0) {
    return (
      <div className="space-y-6">
        {quotaPanel}
        <Card>
          <CardHeader title={t("dashboard.serversNotReadyTitle")} />
          <CardBody className="text-sm text-ink-muted">{t("dashboard.serversNotReadyNoServices")}</CardBody>
        </Card>
      </div>
    );
  }

  if (outOfQuota) {
    return (
      <div className="space-y-6">
        {quotaPanel}
        <Card>
          <EmptyState
            icon={<Lock className="size-5" />}
            title={t("dashboard.cswNoQuotaTitle")}
            description={t("dashboard.cswNoQuotaDesc", { plan: plan.name })}
            action={
              <Link href="/dashboard/billing" className="btn btn-primary">
                {t("dashboard.cswViewPlans")}
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      <input type="hidden" name="eggId" value={eggId} />
      <input type="hidden" name="nodeId" value={nodeId} />

      {quotaPanel}

      <Card>
        <CardHeader
          title={t("dashboard.serversStepService")}
          description={t("dashboard.serversStepServiceDescription")}
        />
        <CardBody className="space-y-5">
          {grouped.map(([nest, items]) => (
            <div key={nest}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">{nest}</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => {
                  const active = item.id === eggId;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setEggId(item.id)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-lg border p-3 text-left transition",
                        active ? "border-brand bg-brand/10" : "border-line bg-surface-2/40 hover:bg-surface-2",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">{item.name}</span>
                        <Badge tone={active ? "brand" : "neutral"}>{kindLabel(item.kind)}</Badge>
                      </div>
                      {item.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-ink-dim">{item.description}</p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("dashboard.cswStepLocation")} description={t("dashboard.cswStepLocationDesc")} />
        <CardBody className="space-y-3">
          {selectableNodes.length === 0 ? <Alert tone="warn">{t("dashboard.cswNoNodes")}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {nodes.map((n) => {
              const s = nodeStates.get(n.id)!;
              const active = n.id === nodeId && !s.locked;
              const reason = nodeReason(n, s);
              const subline = !s.locked
                ? s.fits === null
                  ? t("dashboard.cswNodeRoomMany")
                  : t("dashboard.cswNodeRoomN", { count: s.fits })
                : s.reason === "too-small"
                  ? t("dashboard.cswNodeRoomNone")
                  : s.reason === "full"
                    ? t("dashboard.cswNodeFullPercent", { percent: n.percentOverall })
                    : null;
              return (
                <button
                  type="button"
                  key={n.id}
                  disabled={s.locked}
                  aria-pressed={active}
                  aria-disabled={s.locked}
                  onClick={() => !s.locked && setNodeId(n.id)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition",
                    s.locked
                      ? "cursor-not-allowed border-line bg-surface-2/20 opacity-60"
                      : active
                        ? "border-brand bg-brand/10"
                        : "border-line bg-surface-2/40 hover:bg-surface-2",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink">{n.name}</span>
                    {reason ? (
                      <Badge tone="warn">
                        {reason.icon}
                        {reason.text}
                      </Badge>
                    ) : (
                      <Badge tone="ok">
                        {s.fits === null
                          ? t("dashboard.cswNodeAvailable")
                          : t("dashboard.cswNodeSlots", { count: s.fits })}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 space-y-2">
                    <CapacityBar label={t("dashboard.cswRam")} percent={n.percentMemory} icon={<MemoryStick className="size-3" />} />
                    <CapacityBar label={t("dashboard.cswDisk")} percent={n.percentDisk} icon={<HardDrive className="size-3" />} />
                    <CapacityBar label={t("dashboard.cswCpu")} percent={n.percentCpu} icon={<Cpu className="size-3" />} />
                  </div>
                  {subline ? <p className="mt-2 text-[11px] text-ink-dim">{subline}</p> : null}
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("dashboard.cswStepName")} />
        <CardBody className="space-y-4">
          <Field label={t("dashboard.serversNameLabel")} required error={state.fieldErrors?.name}>
            <Input name="name" required maxLength={80} placeholder={t("dashboard.serversNamePlaceholder")} />
          </Field>
          <Field label={t("dashboard.serversDescriptionLabel")} hint={t("dashboard.serversDescriptionHint")}>
            <Textarea name="description" maxLength={500} rows={2} placeholder={t("dashboard.serversDescriptionPlaceholder")} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("dashboard.cswStepResources")} description={t("dashboard.cswStepResourcesDesc")} />
        <CardBody className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field
            label={<span className="flex items-center gap-1.5"><MemoryStick className="size-3.5" /> {t("dashboard.serversMemoryLabel")}</span>}
            required
            error={
              state.fieldErrors?.memory ??
              (overMemory
                ? t("dashboard.cswErrQuota", { resource: t("dashboard.cswRam"), remaining: formatMib(remMem) })
                : undefined)
            }
            hint={t("dashboard.cswAllowanceHint", { value: formatMib(memory), max: fmtMem(remMem, memUnlimited) })}
          >
            <Input
              name="memory"
              type="number"
              min={MEM_MIN}
              max={memUnlimited ? undefined : remMem}
              step={128}
              required
              value={memory}
              onChange={(event) => setMemory(Number(event.target.value))}
            />
          </Field>

          <Field
            label={<span className="flex items-center gap-1.5"><HardDrive className="size-3.5" /> {t("dashboard.serversDiskLabel")}</span>}
            required
            error={
              state.fieldErrors?.disk ??
              (overDisk
                ? t("dashboard.cswErrQuota", { resource: t("dashboard.cswDisk"), remaining: formatMib(remDisk) })
                : undefined)
            }
            hint={t("dashboard.cswAllowanceHint", { value: formatMib(disk), max: fmtMem(remDisk, diskUnlimited) })}
          >
            <Input
              name="disk"
              type="number"
              min={DISK_MIN}
              max={diskUnlimited ? undefined : remDisk}
              step={64}
              required
              value={disk}
              onChange={(event) => setDisk(Number(event.target.value))}
            />
          </Field>

          <Field
            label={<span className="flex items-center gap-1.5"><Cpu className="size-3.5" /> {t("dashboard.serversCpuLabel")}</span>}
            required
            error={
              state.fieldErrors?.cpu ??
              (overCpu
                ? t("dashboard.cswErrQuota", { resource: t("dashboard.cswCpu"), remaining: `${remCpu}%` })
                : undefined)
            }
            hint={t("dashboard.cswCpuHint", { value: cpu, max: cpuUnlimited ? t("dashboard.cswUnlimited") : remCpu })}
          >
            <Input
              name="cpu"
              type="number"
              min={CPU_MIN}
              max={cpuUnlimited ? undefined : remCpu}
              step={25}
              required
              value={cpu}
              onChange={(event) => setCpu(Number(event.target.value))}
            />
          </Field>

          <Field
            label={<span className="flex items-center gap-1.5"><Network className="size-3.5" /> {t("dashboard.cswPorts")}</span>}
            error={state.fieldErrors?.ports}
            hint={t("dashboard.cswPortsHint", { max: maxPorts })}
          >
            <Input
              name="ports"
              type="number"
              min={1}
              max={maxPorts}
              step={1}
              value={ports}
              onChange={(event) => setPorts(Number(event.target.value))}
            />
          </Field>

          <Field
            label={<span className="flex items-center gap-1.5"><Database className="size-3.5" /> {t("dashboard.cswDatabases")}</span>}
            error={state.fieldErrors?.databases}
            hint={t("dashboard.cswDatabasesHint", { max: plan.databaseLimit })}
          >
            <Input
              name="databases"
              type="number"
              min={0}
              max={plan.databaseLimit}
              step={1}
              value={databases}
              onChange={(event) => setDatabases(Number(event.target.value))}
            />
          </Field>
        </CardBody>
      </Card>

      {viewableVars.length > 0 ? (
        <Card>
          <CardHeader title={t("dashboard.cswStepOptions")} description={t("dashboard.cswStepOptionsDesc")} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {viewableVars.map((variable) => (
              <Field key={variable.id} label={variable.name} hint={variable.description ?? variable.envVariable}>
                <Input
                  name={`env__${variable.envVariable}`}
                  defaultValue={variable.defaultValue}
                  disabled={!variable.userEditable}
                />
              </Field>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <p className="flex items-center gap-1.5 text-xs text-ink-dim">
            <ServerIcon className="size-3.5" />
            {t("dashboard.cswDeployNote")}
          </p>
          <div className="flex flex-col items-end gap-1">
            <SubmitButton pendingLabel={t("dashboard.cswDeploying")} disabled={!canDeploy}>
              <Rocket className="size-4" />
              {t("dashboard.cswDeploy")}
            </SubmitButton>
            {!nodeReady && selectableNodes.length > 0 ? (
              <span className="text-[11px] text-ink-dim">{t("dashboard.cswSelectNodeFirst")}</span>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </form>
  );
}

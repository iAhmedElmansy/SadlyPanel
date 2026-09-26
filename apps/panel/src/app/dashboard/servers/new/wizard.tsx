"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
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
import { cn, formatMib } from "@/lib/utils";

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

/** Per-node capacity snapshot. `headroom` is null when the node is unlimited. */
export interface UserWizardNode {
  id: number;
  name: string;
  percentMemory: number;
  percentDisk: number;
  percentCpu: number;
  headroom: number | null;
  freePorts: number;
  planLocked: boolean;
  requiredPlanName: string | null;
  maintenance: boolean;
}

export interface UserWizardPlan {
  name: string;
  memory: number;
  disk: number;
  cpu: number;
  allocationLimit: number;
  databaseLimit: number;
  backupLimit: number;
}
// __CHUNK_2__

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
  const [state, action] = useActionState<CreateState, FormData>(createUserServerAction, {});

  const selectableNodes = useMemo(
    () => nodes.filter((n) => !n.planLocked && !n.maintenance && n.headroom !== 0),
    [nodes],
  );

  const [eggId, setEggId] = useState<number>(eggs[0]?.id ?? 0);
  const [nodeId, setNodeId] = useState<number>(selectableNodes[0]?.id ?? 0);
  const [memory, setMemory] = useState<number>(plan.memory);
  const [disk, setDisk] = useState<number>(plan.disk);
  const [cpu, setCpu] = useState<number>(plan.cpu);
  const [ports, setPorts] = useState<number>(1);
  const [databases, setDatabases] = useState<number>(plan.databaseLimit);

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

  const maxPorts = Math.max(1, plan.allocationLimit);
  const viewableVars = egg?.variables.filter((v) => v.userViewable) ?? [];
  const canDeploy = selectableNodes.length > 0 && nodeId > 0 && eggs.length > 0;

  const kindLabel = (kind: string) =>
    ({ game: "Game", application: "Application", webhost: "Website" })[kind] ?? kind;

  if (eggs.length === 0) {
    return (
      <Card>
        <CardHeader title="Nothing to deploy yet" />
        <CardBody className="text-sm text-ink-muted">
          No services are available right now. Please check back later or contact an administrator.
        </CardBody>
      </Card>
    );
  }
// __CHUNK_3__

  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      <input type="hidden" name="eggId" value={eggId} />
      <input type="hidden" name="nodeId" value={nodeId} />

      <Card>
        <CardHeader
          title={`Your ${plan.name} plan`}
          description="Everything below is capped by your plan. Pick a smaller size if you don't need it all."
        />
        <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "RAM", value: formatMib(plan.memory), icon: <MemoryStick className="size-3.5" /> },
            { label: "Disk", value: formatMib(plan.disk), icon: <HardDrive className="size-3.5" /> },
            { label: "CPU", value: `${plan.cpu}%`, icon: <Cpu className="size-3.5" /> },
            { label: "Ports", value: String(maxPorts), icon: <Network className="size-3.5" /> },
            { label: "Databases", value: String(plan.databaseLimit), icon: <Database className="size-3.5" /> },
            { label: "Backups", value: String(plan.backupLimit), icon: <ServerIcon className="size-3.5" /> },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-line bg-surface-2/40 p-2.5">
              <span className="flex items-center gap-1 text-[11px] text-ink-dim">
                {item.icon}
                {item.label}
              </span>
              <p className="mt-0.5 text-sm font-semibold text-ink">{item.value}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="1. Choose a service" description="What would you like to run?" />
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
// __CHUNK_4__

      <Card>
        <CardHeader
          title="2. Pick a location"
          description="Each node shows how full it is and how many more servers like yours it can host."
        />
        <CardBody className="space-y-3">
          {selectableNodes.length === 0 ? (
            <Alert tone="warn">
              No nodes are available for your plan right now. Please try again later or contact an administrator.
            </Alert>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {nodes.map((n) => {
              const active = n.id === nodeId;
              const locked = n.planLocked || n.maintenance || n.headroom === 0;
              const reason = n.maintenance
                ? "In maintenance"
                : n.planLocked
                  ? `Requires ${n.requiredPlanName ?? "a higher"} plan`
                  : n.headroom === 0
                    ? "Full"
                    : null;
              return (
                <button
                  type="button"
                  key={n.id}
                  disabled={locked}
                  aria-pressed={active}
                  aria-disabled={locked}
                  onClick={() => !locked && setNodeId(n.id)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition",
                    locked
                      ? "cursor-not-allowed border-line bg-surface-2/20 opacity-60"
                      : active
                        ? "border-brand bg-brand/10"
                        : "border-line bg-surface-2/40 hover:bg-surface-2",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink">{n.name}</span>
                    {locked ? (
                      <Badge tone="warn">
                        {n.maintenance ? <Wrench className="size-3" /> : <Lock className="size-3" />}
                        {reason}
                      </Badge>
                    ) : (
                      <Badge tone="ok">
                        {n.headroom === null ? "Available" : `${n.headroom} slot${n.headroom === 1 ? "" : "s"}`}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 space-y-2">
                    <CapacityBar label="RAM" percent={n.percentMemory} icon={<MemoryStick className="size-3" />} />
                    <CapacityBar label="Disk" percent={n.percentDisk} icon={<HardDrive className="size-3" />} />
                    <CapacityBar label="CPU" percent={n.percentCpu} icon={<Cpu className="size-3" />} />
                  </div>
                  <p className="mt-2 text-[11px] text-ink-dim">
                    {n.headroom === null
                      ? "Room for many more servers"
                      : `Room for ${n.headroom} more server${n.headroom === 1 ? "" : "s"} like yours`}
                  </p>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>
// __CHUNK_5__

      <Card>
        <CardHeader title="3. Name your server" />
        <CardBody className="space-y-4">
          <Field label="Server name" required error={state.fieldErrors?.name}>
            <Input name="name" required maxLength={80} placeholder="My awesome server" />
          </Field>
          <Field label="Description" hint="Optional — a short note to help you recognise it later.">
            <Textarea name="description" maxLength={500} rows={2} placeholder="What is this server for?" />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="4. Choose your resources" description="Slide down from your plan maximum if you'd like." />
        <CardBody className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field
            label={
              <span className="flex items-center gap-1.5">
                <MemoryStick className="size-3.5" /> Memory
              </span>
            }
            required
            error={state.fieldErrors?.memory}
            hint={`${formatMib(memory)} · plan allows up to ${formatMib(plan.memory)}`}
          >
            <Input
              name="memory"
              type="number"
              min={128}
              max={plan.memory}
              step={128}
              required
              value={memory}
              onChange={(event) => setMemory(Number(event.target.value))}
            />
          </Field>

          <Field
            label={
              <span className="flex items-center gap-1.5">
                <HardDrive className="size-3.5" /> Disk
              </span>
            }
            required
            error={state.fieldErrors?.disk}
            hint={`${formatMib(disk)} · plan allows up to ${formatMib(plan.disk)}`}
          >
            <Input
              name="disk"
              type="number"
              min={64}
              max={plan.disk}
              step={64}
              required
              value={disk}
              onChange={(event) => setDisk(Number(event.target.value))}
            />
          </Field>
// __CHUNK_6__

          <Field
            label={
              <span className="flex items-center gap-1.5">
                <Cpu className="size-3.5" /> CPU
              </span>
            }
            required
            error={state.fieldErrors?.cpu}
            hint={`${cpu}% · plan allows up to ${plan.cpu}% (100% = one core)`}
          >
            <Input
              name="cpu"
              type="number"
              min={25}
              max={plan.cpu}
              step={25}
              required
              value={cpu}
              onChange={(event) => setCpu(Number(event.target.value))}
            />
          </Field>

          <Field
            label={
              <span className="flex items-center gap-1.5">
                <Network className="size-3.5" /> Ports
              </span>
            }
            error={state.fieldErrors?.ports}
            hint={`A private IP + port is assigned automatically. Up to ${maxPorts}.`}
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
            label={
              <span className="flex items-center gap-1.5">
                <Database className="size-3.5" /> Databases
              </span>
            }
            error={state.fieldErrors?.databases}
            hint={`Up to ${plan.databaseLimit} included in your plan.`}
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
// __CHUNK_7__

      {viewableVars.length > 0 ? (
        <Card>
          <CardHeader title="5. Service options" description="These are passed to your server when it starts." />
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
            Your server installs on the node and starts automatically. Track progress on its console.
          </p>
          <SubmitButton pendingLabel="Deploying…" disabled={!canDeploy}>
            <Rocket className="size-4" />
            Deploy server
          </SubmitButton>
        </CardBody>
      </Card>
    </form>
  );
}

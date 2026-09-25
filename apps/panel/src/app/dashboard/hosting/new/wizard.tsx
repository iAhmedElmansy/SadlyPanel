"use client";

import { useActionState, useMemo, useState } from "react";
import { Code2, Cpu, FileCode2, Globe2, HardDrive, MemoryStick, Rocket } from "lucide-react";
import { createWebsiteAction, type CreateWebsiteState } from "../actions";
import { PHP_VERSIONS } from "@/lib/constants";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatMib } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

export interface HostingEgg {
  id: number;
  name: string;
  description: string | null;
  runtime: "html" | "php";
  images: Record<string, string>;
}

export interface HostingNode {
  id: number;
  name: string;
  maintenanceMode: boolean;
  free: { memory: number; disk: number; cpu: number };
}

export interface HostingAllocation {
  id: number;
  ip: string;
  ipAlias: string | null;
  port: number;
  nodeId: number;
}

export interface HostingDomain {
  id: number;
  name: string;
}

export interface HostingPackage {
  id: number;
  name: string;
  description: string | null;
  planId: number | null;
  limits: { memory: number; disk: number; cpu: number } | null;
}

const PRESETS = [
  { key: "starter", label: "Starter", memory: 512, disk: 2048, cpu: 100 },
  { key: "business", label: "Business", memory: 1024, disk: 5120, cpu: 200 },
  { key: "pro", label: "Pro", memory: 2048, disk: 10240, cpu: 400 },
];

export function CreateWebsiteWizard({
  nodes,
  eggs,
  allocations,
  domains,
  packages,
  isAdmin,
}: {
  nodes: HostingNode[];
  eggs: HostingEgg[];
  allocations: HostingAllocation[];
  domains: HostingDomain[];
  packages: HostingPackage[];
  isAdmin: boolean;
}) {
  const t = useT();
  const [state, action] = useActionState<CreateWebsiteState, FormData>(createWebsiteAction, {});

  const [eggId, setEggId] = useState<number>(eggs[0]?.id ?? 0);
  const [nodeId, setNodeId] = useState<number>(nodes[0]?.id ?? 0);
  const [packageId, setPackageId] = useState<number>(0);
  const [planId, setPlanId] = useState<number>(0);
  const [phpVersion, setPhpVersion] = useState<string>("8.3");
  const [limits, setLimits] = useState({ memory: 1024, disk: 5120, cpu: 200 });
  const [hostnameMode, setHostnameMode] = useState<"subdomain" | "custom" | "none">(
    domains.length ? "subdomain" : "none",
  );

  const egg = useMemo(() => eggs.find((e) => e.id === eggId), [eggs, eggId]);
  const node = useMemo(() => nodes.find((n) => n.id === nodeId), [nodes, nodeId]);
  const nodeAllocations = useMemo(() => allocations.filter((a) => a.nodeId === nodeId), [allocations, nodeId]);
  const isPhp = egg?.runtime === "php";

  const patch = (p: Partial<typeof limits>) => setLimits((c) => ({ ...c, ...p }));

  const applyPackage = (id: number) => {
    setPackageId(id);
    const pkg = packages.find((p) => p.id === id);
    if (!pkg) {
      setPlanId(0);
      return;
    }
    setPlanId(pkg.planId ?? 0);
    if (pkg.limits) setLimits({ memory: pkg.limits.memory, disk: pkg.limits.disk, cpu: pkg.limits.cpu });
  };

  if (eggs.length === 0 || nodes.length === 0 || nodeAllocations.length === 0) {
    return (
      <Card>
        <CardHeader title={t("dashboard.hostingNotReadyTitle")} />
        <CardBody className="space-y-2 text-sm text-ink-muted">
          {eggs.length === 0 ? (
            <p>{t("dashboard.hostingNotReadyNoRuntimes")}</p>
          ) : null}
          {nodes.length === 0 ? <p>{t("dashboard.hostingNotReadyNoNodes")}</p> : null}
          {nodes.length > 0 && nodeAllocations.length === 0 ? (
            <p>{t("dashboard.hostingNotReadyNoPorts")}</p>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  const overMemory = node ? limits.memory > node.free.memory && node.free.memory >= 0 : false;
  const overDisk = node ? limits.disk > node.free.disk && node.free.disk >= 0 : false;
  const overCpu = node ? limits.cpu > node.free.cpu && node.free.cpu >= 0 : false;
  const presetLabels: Record<string, string> = {
    starter: t("dashboard.hostingPresetStarter"),
    business: t("dashboard.hostingPresetBusiness"),
    pro: t("dashboard.hostingPresetPro"),
  };

  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      <input type="hidden" name="eggId" value={eggId} />
      <input type="hidden" name="nodeId" value={nodeId} />
      <input type="hidden" name="packageId" value={packageId || ""} />
      <input type="hidden" name="planId" value={planId || ""} />
      <input type="hidden" name="webRuntime" value={egg?.runtime ?? "html"} />
      <input type="hidden" name="memory" value={limits.memory} />
      <input type="hidden" name="disk" value={limits.disk} />
      <input type="hidden" name="cpu" value={limits.cpu} />
      {isPhp ? <input type="hidden" name="phpVersion" value={phpVersion} /> : null}

      {/* 1. Domain */}
      <Card>
        <CardHeader
          title={t("dashboard.hostingStepDomainTitle")}
          description={t("dashboard.hostingStepDomainDesc")}
        />
        <CardBody className="space-y-4">
          <input type="hidden" name="hostnameMode" value={hostnameMode} />
          <div className="flex flex-wrap gap-2">
            {(["subdomain", "custom", "none"] as const).map((mode) => {
              const disabled = mode === "subdomain" && domains.length === 0;
              const labels = {
                subdomain: t("dashboard.hostingDomainModeSubdomain"),
                custom: t("dashboard.hostingDomainModeCustom"),
                none: t("dashboard.hostingDomainModeNone"),
              };
              return (
                <button
                  type="button"
                  key={mode}
                  disabled={disabled}
                  onClick={() => setHostnameMode(mode)}
                  className={cn(
                    "btn",
                    hostnameMode === mode ? "btn-primary" : "btn-ghost",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <Globe2 className="size-4" />
                  {labels[mode]}
                </button>
              );
            })}
          </div>

          {hostnameMode === "subdomain" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("dashboard.hostingSubdomainLabel")} required error={state.fieldErrors?.subdomainLabel} hint={t("dashboard.hostingSubdomainHint")}>
                <Input name="subdomainLabel" placeholder="my-site" required />
              </Field>
              <Field label={t("dashboard.hostingDomainLabel")} required error={state.fieldErrors?.domainId}>
                <Select name="domainId" required>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      .{d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          {hostnameMode === "custom" ? (
            <Field
              label={t("dashboard.hostingCustomDomainLabel")}
              required
              error={state.fieldErrors?.customHostname}
              hint={t("dashboard.hostingCustomDomainHint")}
            >
              <Input name="customHostname" placeholder="www.example.com" required />
            </Field>
          ) : null}

          {hostnameMode === "none" ? (
            <p className="text-xs text-ink-dim">
              {t("dashboard.hostingDomainNoneHint")}
            </p>
          ) : null}
        </CardBody>
      </Card>

      {/* 2. Application type */}
      <Card>
        <CardHeader
          title={t("dashboard.hostingStepAppTitle")}
          description={t("dashboard.hostingStepAppDesc")}
        />
        <CardBody className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {eggs.map((item) => {
            const active = item.id === eggId;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setEggId(item.id)}
                aria-pressed={active}
                className={cn(
                  "rounded-lg border p-3 text-start transition",
                  active ? "border-brand bg-brand/10" : "border-line bg-surface-2/40 hover:bg-surface-2",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-ink">
                    {item.runtime === "php" ? <Code2 className="size-4" /> : <FileCode2 className="size-4" />}
                    {item.name}
                  </span>
                  <Badge tone={active ? "brand" : "neutral"}>{item.runtime === "php" ? "PHP" : t("dashboard.hostingBadgeStatic")}</Badge>
                </div>
                {item.description ? <p className="mt-1 line-clamp-2 text-xs text-ink-dim">{item.description}</p> : null}
              </button>
            );
          })}
        </CardBody>
      </Card>

      {/* 3. Site details + runtime */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("dashboard.hostingStepDetailsTitle")} />
          <CardBody className="space-y-4">
            <Field label={t("dashboard.hostingNameLabel")} required error={state.fieldErrors?.name} hint={t("dashboard.hostingNameHint")}>
              <Input name="name" required maxLength={80} placeholder={t("dashboard.hostingNamePlaceholder")} />
            </Field>
            <Field label={t("dashboard.hostingDocRootLabel")} hint={t("dashboard.hostingDocRootHint")}>
              <Input name="documentRoot" defaultValue="/public" />
            </Field>
            {isPhp ? (
              <Field label={t("dashboard.hostingPhpVersionLabel")} required>
                <Select name="phpVersionSelect" value={phpVersion} onChange={(e) => setPhpVersion(e.target.value)}>
                  {PHP_VERSIONS.map((v) => (
                    <option key={v} value={v}>
                      PHP {v}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="text-xs text-ink-dim">{t("dashboard.hostingStaticServeNote")}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("dashboard.hostingStepNodeTitle")} description={t("dashboard.hostingStepNodeDesc")} />
          <CardBody className="space-y-4">
            <Field label={t("dashboard.hostingNodeLabel")} required error={state.fieldErrors?.nodeId}>
              <Select value={nodeId} onChange={(e) => setNodeId(Number(e.target.value))} name="nodeSelect" required>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id} disabled={n.maintenanceMode}>
                    {n.name} {n.maintenanceMode ? t("dashboard.hostingNodeMaintenance") : `— ${t("dashboard.hostingNodeRamFree", { ram: formatMib(n.free.memory) })}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("dashboard.hostingPortLabel")} required error={state.fieldErrors?.allocationId}>
              <Select name="allocationId" required>
                {nodeAllocations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.ipAlias || a.ip}:{a.port}
                  </option>
                ))}
              </Select>
            </Field>
            {node ? (
              <p className="text-xs text-ink-dim">
                {t("dashboard.hostingNodeFreeSummary", { node: node.name, ram: formatMib(node.free.memory), disk: formatMib(node.free.disk), cpu: String(node.free.cpu) })}
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {/* 5. Resources / package */}
      <Card>
        <CardHeader
          title={t("dashboard.hostingStepResourcesTitle")}
          description={t("dashboard.hostingStepResourcesDesc")}
          action={
            <div className="flex gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.key}
                  onClick={() => {
                    setPackageId(0);
                    setPlanId(0);
                    patch({ memory: preset.memory, disk: preset.disk, cpu: preset.cpu });
                  }}
                  className="btn btn-ghost px-2 py-1 text-xs"
                >
                  {presetLabels[preset.key]}
                </button>
              ))}
            </div>
          }
        />
        <CardBody className="space-y-4">
          {packages.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <button
                type="button"
                onClick={() => applyPackage(0)}
                aria-pressed={packageId === 0}
                className={cn(
                  "rounded-lg border p-3 text-start transition",
                  packageId === 0 ? "border-brand bg-brand/10" : "border-line bg-surface-2/40 hover:bg-surface-2",
                )}
              >
                <span className="text-sm font-medium text-ink">{t("dashboard.hostingCustomSize")}</span>
                <p className="mt-1 text-xs text-ink-dim">{t("dashboard.hostingCustomSizeHint")}</p>
              </button>
              {packages.map((pkg) => {
                const active = pkg.id === packageId;
                return (
                  <button
                    type="button"
                    key={pkg.id}
                    onClick={() => applyPackage(pkg.id)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-lg border p-3 text-start transition",
                      active ? "border-brand bg-brand/10" : "border-line bg-surface-2/40 hover:bg-surface-2",
                    )}
                  >
                    <span className="truncate text-sm font-medium text-ink">{pkg.name}</span>
                    {pkg.limits ? (
                      <p className="mt-1 text-xs text-ink-dim">
                        {t("dashboard.hostingResourceSummary", { ram: formatMib(pkg.limits.memory), disk: formatMib(pkg.limits.disk), cpu: String(pkg.limits.cpu) })}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label={<span className="flex items-center gap-1.5"><MemoryStick className="size-3.5" /> {t("dashboard.hostingMemoryLabel")}</span>}
              error={overMemory ? t("dashboard.hostingOverMemory") : undefined}
              hint={`≈ ${formatMib(limits.memory)}`}
            >
              <Input type="number" min={0} max={1048576} step={128} value={limits.memory} onChange={(e) => patch({ memory: Number(e.target.value) })} />
            </Field>
            <Field
              label={<span className="flex items-center gap-1.5"><HardDrive className="size-3.5" /> {t("dashboard.hostingDiskLabel")}</span>}
              error={overDisk ? t("dashboard.hostingOverDisk") : undefined}
              hint={`≈ ${formatMib(limits.disk)}`}
            >
              <Input type="number" min={64} step={512} value={limits.disk} onChange={(e) => patch({ disk: Number(e.target.value) })} />
            </Field>
            <Field
              label={<span className="flex items-center gap-1.5"><Cpu className="size-3.5" /> {t("dashboard.hostingCpuLabel")}</span>}
              error={overCpu ? t("dashboard.hostingOverCpu") : undefined}
              hint={t("dashboard.hostingCpuHint")}
            >
              <Input type="number" min={0} max={6400} step={25} value={limits.cpu} onChange={(e) => patch({ cpu: Number(e.target.value) })} />
            </Field>
          </div>
          {isAdmin ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("dashboard.hostingDatabaseLimitLabel")}><Input name="databaseLimit" type="number" min={0} max={100} defaultValue={2} /></Field>
              <Field label={t("dashboard.hostingBackupLimitLabel")}><Input name="backupLimit" type="number" min={0} max={100} defaultValue={3} /></Field>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* 6. Deploy */}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-ink-dim">
            {t("dashboard.hostingDeployNote")}
          </p>
          <SubmitButton pendingLabel={t("dashboard.hostingDeploying")}>
            <Rocket className="size-4" />
            {t("dashboard.hostingDeployButton")}
          </SubmitButton>
        </CardBody>
      </Card>
    </form>
  );
}

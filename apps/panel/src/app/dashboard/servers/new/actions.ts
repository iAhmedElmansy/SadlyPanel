"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, requireUser } from "@/lib/auth/session";
import { serverCreateSchema } from "@/lib/validation";
import { provisionServer, pickFreeAllocations } from "@/lib/services/provision";
import { assertUserCanUseNode, getUserPlanQuota, quotaExceededDimension } from "@/lib/services/entitlements";
import { assertNodeHasCapacity } from "@/lib/services/capacity";
import { getSetting } from "@/lib/settings";
import { SETTING_KEYS } from "@/lib/constants";
import { parseJsonSafe, formatMib } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export interface CreateState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Minimum sensible per-server size for a capped dimension (mirrors the wizard). */
const FLOORS = { memory: 128, disk: 64, cpu: 25 } as const;

/**
 * The limited self-service payload. Users pick a service, a node, a name and
 * how much RAM / disk / CPU / ports / databases they want — everything else
 * (docker image, raw allocations, swap, io, hostname) is derived server-side
 * from their plan and the node. Memory / disk / CPU are pooled: a request is
 * rejected when it exceeds what the plan grants minus what the user's existing
 * servers already consume. Ports / databases are per-server caps clamped down.
 */
const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Server name is required.").max(80),
  description: z.string().trim().max(500).optional(),
  nodeId: z.coerce.number().int().positive(),
  eggId: z.coerce.number().int().positive(),
  memory: z.coerce.number().int().min(0),
  disk: z.coerce.number().int().min(64),
  cpu: z.coerce.number().int().min(0),
  ports: z.coerce.number().int().min(1).max(50),
  databases: z.coerce.number().int().min(0).max(100),
});

/**
 * Client-facing server creation. Non-admin users always own the server they
 * create, are bound by the panel-wide server limit, and can only consume
 * resources up to their subscribed plan on a node their plan unlocks.
 */
export async function createUserServerAction(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const user = await requireUser();
  const t = await getT();

  const environment: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("env__") && typeof value === "string") environment[key.slice(5)] = value;
  }

  const parsed = userCreateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    nodeId: formData.get("nodeId"),
    eggId: formData.get("eggId"),
    memory: formData.get("memory"),
    disk: formData.get("disk"),
    cpu: formData.get("cpu"),
    ports: formData.get("ports") ?? 1,
    databases: formData.get("databases") ?? 0,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: t("dashboard.cswErrReviewFields") };
  }

  // A plan is mandatory for self-service, and it also bounds how much RAM / disk
  // / CPU is left across the user's existing servers. The UI shows a subscribe
  // prompt, but this is the authoritative gate.
  const quota = await getUserPlanQuota(user.id);
  if (!quota) {
    return { error: t("dashboard.cswErrPlanRequired") };
  }
  const { plan } = quota;

  // The node must be public, out of maintenance, and unlocked for the plan.
  const node = await prisma.node.findUnique({
    where: { id: parsed.data.nodeId },
    select: { public: true, maintenanceMode: true },
  });
  if (!node?.public) return { error: t("dashboard.cswErrNodeUnavailable") };
  if (node.maintenanceMode) return { error: t("dashboard.cswErrNodeMaintenance") };

  const gate = await assertUserCanUseNode(user, parsed.data.nodeId);
  if (!gate.ok) {
    return {
      error: gate.requiredPlanName
        ? t("dashboard.cswErrNodeLockedPlan", { plan: gate.requiredPlanName })
        : t("dashboard.cswErrNodeLocked"),
    };
  }

  // Panel-wide server count cap for non-admins.
  if (user.role !== "admin") {
    const limit = Number((await getSetting(SETTING_KEYS.defaultServerLimit)) || 2);
    if (limit > 0 && quota.serverCount >= limit) {
      return { error: t("dashboard.cswErrServerLimit", { limit }) };
    }
  }

  // Never trust the client: floor each capped dimension to a sane minimum (so a
  // forged 0 can't request "unlimited" on a capped plan), clamp to the hard
  // schema ceiling, then reject anything above the pooled remaining allowance.
  const effective = (dim: "memory" | "disk" | "cpu", hardMax: number) => {
    const raw = parsed.data[dim];
    const floored = quota.unlimited[dim] ? raw : Math.max(FLOORS[dim], raw);
    return clamp(floored, 0, hardMax);
  };
  const memory = effective("memory", 1_048_576);
  const disk = effective("disk", 10_485_760);
  const cpu = effective("cpu", 6400);

  const over = quotaExceededDimension(quota, { memory, disk, cpu });
  if (over) {
    const resource = t(over === "memory" ? "dashboard.cswRam" : over === "disk" ? "dashboard.cswDisk" : "dashboard.cswCpu");
    const remaining = over === "cpu" ? `${quota.remaining.cpu}%` : formatMib(quota.remaining[over]);
    const message = t("dashboard.cswErrQuota", { resource, remaining });
    return { fieldErrors: { [over]: message }, error: message };
  }

  const maxPorts = Math.max(1, plan.allocationLimit);
  const ports = clamp(parsed.data.ports, 1, maxPorts);
  const databases = clamp(parsed.data.databases, 0, plan.databaseLimit);
  const io = clamp(plan.io || 500, 10, 1000);
  const swap = clamp(plan.swap, -1, 1_048_576);

  // Users never choose a docker image — use the egg's first configured image.
  const egg = await prisma.egg.findUnique({ where: { id: parsed.data.eggId }, select: { dockerImages: true } });
  if (!egg) return { error: t("dashboard.cswErrServiceGone") };
  const dockerImage = Object.values(parseJsonSafe<Record<string, string>>(egg.dockerImages, {}))[0];
  if (!dockerImage) {
    return { error: t("dashboard.cswErrNoImage") };
  }

  // Reserve random ports up-front; raw IP:port pairs are never shown to users.
  let allocationId: number;
  let additionalAllocationIds: number[];
  try {
    const picked = await pickFreeAllocations(parsed.data.nodeId, ports);
    allocationId = picked.allocationId;
    additionalAllocationIds = picked.additionalAllocationIds;
  } catch {
    return { error: t("dashboard.cswErrNoPorts") };
  }

  // Assemble a payload the shared provisioner understands. Re-validate through
  // the canonical schema so any drift surfaces here rather than mid-provision.
  const payload = serverCreateSchema.safeParse({
    name: parsed.data.name,
    description: parsed.data.description,
    nodeId: parsed.data.nodeId,
    eggId: parsed.data.eggId,
    planId: plan.id,
    dockerImage,
    allocationId,
    additionalAllocationIds,
    memory,
    swap,
    disk,
    cpu,
    io,
    threads: plan.threads ?? undefined,
    oomKiller: plan.oomKiller,
    databaseLimit: databases,
    allocationLimit: maxPorts,
    backupLimit: plan.backupLimit,
    startOnCompletion: true,
    skipScripts: false,
    documentRoot: "/",
    hostnameMode: "none",
    environment,
  });
  if (!payload.success) {
    return { error: t("dashboard.cswErrInvalidConfig") };
  }

  // Friendly capacity pre-check (provisionServer re-checks authoritatively).
  try {
    await assertNodeHasCapacity(parsed.data.nodeId, { memory, disk, cpu });
  } catch {
    return { error: t("dashboard.cswErrCapacity") };
  }

  let uuidShort: string;
  try {
    const result = await provisionServer({
      ...payload.data,
      actingUserId: user.id,
      ownerIdResolved: user.id,
      ip: await clientIp(),
    });
    uuidShort = result.uuidShort;
    if (result.daemonError) {
      return { error: t("dashboard.cswErrDaemon", { error: result.daemonError }) };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : t("dashboard.cswErrGeneric") };
  }

  redirect(`/dashboard/servers/${uuidShort}?created=1`);
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, requireUser } from "@/lib/auth/session";
import { serverCreateSchema } from "@/lib/validation";
import { provisionServer, pickFreeAllocations } from "@/lib/services/provision";
import { assertUserCanUseNode, getUserPlan } from "@/lib/services/entitlements";
import { assertNodeHasCapacity } from "@/lib/services/capacity";
import { getSetting } from "@/lib/settings";
import { SETTING_KEYS } from "@/lib/constants";
import { parseJsonSafe } from "@/lib/utils";

export interface CreateState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The limited self-service payload. Users pick a service, a node, a name and
 * how much RAM / disk / CPU / ports / databases they want — everything else
 * (docker image, raw allocations, swap, io, hostname) is derived server-side
 * from their plan and the node. The plan is the hard ceiling; requested values
 * are clamped down to it, never up.
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
    return { fieldErrors, error: "Please review the highlighted fields." };
  }

  // A plan is mandatory for self-service. The UI shows a subscribe prompt, but
  // this is the authoritative gate.
  const plan = await getUserPlan(user.id);
  if (!plan) {
    return { error: "You need an active plan to deploy a server. Choose a plan from the Billing page first." };
  }

  // The node must be public, out of maintenance, and unlocked for the plan.
  const node = await prisma.node.findUnique({
    where: { id: parsed.data.nodeId },
    select: { public: true, maintenanceMode: true },
  });
  if (!node?.public) return { error: "That node is not available for self-service deployment." };
  if (node.maintenanceMode) return { error: "That node is in maintenance. Please pick another node." };

  const gate = await assertUserCanUseNode(user, parsed.data.nodeId);
  if (!gate.ok) return { error: gate.error ?? "This node is not available on your current plan." };

  // Panel-wide server count cap for non-admins.
  if (user.role !== "admin") {
    const limit = Number((await getSetting(SETTING_KEYS.defaultServerLimit)) || 2);
    if (limit > 0) {
      const owned = await prisma.server.count({ where: { ownerId: user.id } });
      if (owned >= limit) {
        return { error: `You have reached your limit of ${limit} server(s). Contact an administrator for more.` };
      }
    }
  }

  // Clamp every tunable down to the plan ceiling (and the schema's hard caps).
  const memory = clamp(Math.min(parsed.data.memory, plan.memory || parsed.data.memory), 0, 1_048_576);
  const disk = clamp(Math.min(parsed.data.disk, plan.disk || parsed.data.disk), 64, 10_485_760);
  const cpu = clamp(Math.min(parsed.data.cpu, plan.cpu || parsed.data.cpu), 0, 6400);
  const maxPorts = Math.max(1, plan.allocationLimit);
  const ports = clamp(parsed.data.ports, 1, maxPorts);
  const databases = clamp(parsed.data.databases, 0, plan.databaseLimit);
  const io = clamp(plan.io || 500, 10, 1000);
  const swap = clamp(plan.swap, -1, 1_048_576);

  // Users never choose a docker image — use the egg's first configured image.
  const egg = await prisma.egg.findUnique({ where: { id: parsed.data.eggId }, select: { dockerImages: true } });
  if (!egg) return { error: "The selected service no longer exists." };
  const dockerImage = Object.values(parseJsonSafe<Record<string, string>>(egg.dockerImages, {}))[0];
  if (!dockerImage) {
    return { error: "The selected service has no runtime image configured. Contact an administrator." };
  }

  // Reserve random ports up-front; raw IP:port pairs are never shown to users.
  let allocationId: number;
  let additionalAllocationIds: number[];
  try {
    const picked = await pickFreeAllocations(parsed.data.nodeId, ports);
    allocationId = picked.allocationId;
    additionalAllocationIds = picked.additionalAllocationIds;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That node has no free ports right now." };
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
    return { error: "We couldn't build a valid server configuration. Please adjust your selections and try again." };
  }

  // Friendly capacity pre-check (provisionServer re-checks authoritatively).
  try {
    await assertNodeHasCapacity(parsed.data.nodeId, { memory, disk, cpu });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That node doesn't have enough capacity right now." };
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
      return {
        error: `Server record created, but the node could not be reached: ${result.daemonError}. An administrator can retry the install.`,
      };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create the server." };
  }

  redirect(`/dashboard/servers/${uuidShort}?created=1`);
}

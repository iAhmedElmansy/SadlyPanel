"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission, clientIp } from "@/lib/auth/session";
import { serverBuildSchema, serverCreateSchema } from "@/lib/validation";
import { assertNodeHasCapacity } from "@/lib/services/capacity";
import { deleteServer, provisionServer } from "@/lib/services/provision";
import { syncServerToNode, daemonForServer } from "@/lib/daemon";
import { logActivity } from "@/lib/activity";
import { buildServerSpec } from "@/lib/daemon/spec";

export interface AdminServerState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

export async function adminCreateServerAction(_prev: AdminServerState, formData: FormData): Promise<AdminServerState> {
  const admin = await requirePermission("servers.manage");

  const environment: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("env__") && typeof value === "string") environment[key.slice(5)] = value;
  }

  const parsed = serverCreateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    ownerId: formData.get("ownerId"),
    nodeId: formData.get("nodeId"),
    eggId: formData.get("eggId"),
    planId: formData.get("planId") || undefined,
    packageId: formData.get("packageId") || undefined,
    dockerImage: formData.get("dockerImage"),
    allocationId: formData.get("allocationId"),
    additionalAllocationIds: formData
      .getAll("additionalAllocationIds")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
    memory: formData.get("memory"),
    swap: formData.get("swap") ?? 0,
    disk: formData.get("disk"),
    cpu: formData.get("cpu"),
    io: formData.get("io") ?? 500,
    threads: formData.get("threads") ?? undefined,
    oomKiller: formData.get("oomKiller") === "on",
    databaseLimit: formData.get("databaseLimit") ?? 2,
    allocationLimit: formData.get("allocationLimit") ?? 2,
    backupLimit: formData.get("backupLimit") ?? 3,
    startOnCompletion: formData.get("startOnCompletion") !== null,
    skipScripts: formData.get("skipScripts") === "on",
    webRuntime: formData.get("webRuntime") ?? undefined,
    phpVersion: formData.get("phpVersion") ?? undefined,
    documentRoot: formData.get("documentRoot") ?? "/",
    hostnameMode: formData.get("hostnameMode") ?? "none",
    domainId: formData.get("domainId") ?? undefined,
    subdomainLabel: formData.get("subdomainLabel") ?? undefined,
    customHostname: formData.get("customHostname") ?? undefined,
    environment,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Please review the highlighted fields." };
  }

  const ownerId = parsed.data.ownerId ?? admin.id;
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!owner) return { error: "The selected owner no longer exists." };

  try {
    const result = await provisionServer({
      ...parsed.data,
      actingUserId: admin.id,
      ownerIdResolved: ownerId,
      ip: await clientIp(),
    });
    revalidatePath("/admin/servers");
    return result.daemonError
      ? { success: `Server created, but the node reported: ${result.daemonError}` }
      : { success: `${parsed.data.name} deployed${result.hostname ? ` at ${result.hostname}` : ""}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create the server." };
  }
}

export async function updateServerBuildAction(_prev: AdminServerState, formData: FormData): Promise<AdminServerState> {
  const admin = await requirePermission("servers.manage");
  const serverId = Number(formData.get("serverId"));
  if (!Number.isInteger(serverId)) return { error: "Invalid server." };

  const parsed = serverBuildSchema.safeParse({
    memory: formData.get("memory"),
    swap: formData.get("swap"),
    disk: formData.get("disk"),
    cpu: formData.get("cpu"),
    io: formData.get("io"),
    threads: formData.get("threads") ?? undefined,
    oomKiller: formData.get("oomKiller") === "on",
    databaseLimit: formData.get("databaseLimit"),
    allocationLimit: formData.get("allocationLimit"),
    backupLimit: formData.get("backupLimit"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid resource limits." };

  const server = await prisma.server.findUnique({ where: { id: serverId }, select: { nodeId: true } });
  if (!server) return { error: "Server not found." };

  try {
    await assertNodeHasCapacity(server.nodeId, {
      memory: parsed.data.memory,
      disk: parsed.data.disk,
      cpu: parsed.data.cpu,
      excludeServerId: serverId,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Node capacity check failed." };
  }

  await prisma.server.update({
    where: { id: serverId },
    data: {
      memory: parsed.data.memory,
      swap: parsed.data.swap,
      disk: parsed.data.disk,
      cpu: parsed.data.cpu,
      io: parsed.data.io,
      threads: parsed.data.threads || null,
      oomKiller: parsed.data.oomKiller,
      databaseLimit: parsed.data.databaseLimit,
      allocationLimit: parsed.data.allocationLimit,
      backupLimit: parsed.data.backupLimit,
    },
  });

  let syncError: string | undefined;
  try {
    await syncServerToNode(serverId);
  } catch (error) {
    syncError = error instanceof Error ? error.message : "unknown error";
  }

  await logActivity({ event: "admin:server.build", userId: admin.id, serverId, properties: { ...parsed.data } });
  revalidatePath("/admin/servers");

  return syncError
    ? { success: `Limits saved, but the node could not be updated: ${syncError}` }
    : { success: "Resource limits updated and pushed to the node." };
}

export async function toggleSuspendServerAction(serverId: number): Promise<AdminServerState> {
  const admin = await requirePermission("servers.manage");
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) return { error: "Server not found." };

  const suspended = !server.suspended;
  await prisma.server.update({
    where: { id: serverId },
    data: { suspended, status: suspended ? "suspended" : "offline" },
  });

  try {
    const { client, uuid } = await daemonForServer(serverId);
    if (suspended) await client.power(uuid, "kill").catch(() => undefined);
    await client.syncServer(await buildServerSpec(serverId));
  } catch {
    // The panel state is authoritative; the node re-syncs when it reconnects.
  }

  await logActivity({ event: suspended ? "admin:server.suspend" : "admin:server.unsuspend", userId: admin.id, serverId });
  revalidatePath("/admin/servers");
  return { success: suspended ? "Server suspended." : "Server unsuspended." };
}

export async function transferOwnerAction(serverId: number, ownerId: number): Promise<AdminServerState> {
  const admin = await requirePermission("servers.manage");
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { username: true } });
  if (!owner) return { error: "User not found." };

  await prisma.server.update({ where: { id: serverId }, data: { ownerId } });
  await logActivity({ event: "admin:server.transfer", userId: admin.id, serverId, properties: { to: owner.username } });
  revalidatePath("/admin/servers");
  return { success: `Ownership transferred to ${owner.username}.` };
}

export async function adminDeleteServerAction(serverId: number): Promise<AdminServerState> {
  const admin = await requirePermission("servers.manage");
  try {
    const result = await deleteServer(serverId, admin.id);
    revalidatePath("/admin/servers");
    return result.daemonError
      ? { success: `Server removed from the panel, but the node reported: ${result.daemonError}` }
      : { success: "Server deleted." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to delete the server." };
  }
}

/**
 * A mount is eligible for a server when its node/egg restriction rows either
 * do not exist (= allowed everywhere) or include the server's node/egg.
 */
function mountEligible(
  mount: { nodes: { nodeId: number }[]; eggs: { eggId: number }[] },
  server: { nodeId: number; eggId: number },
): boolean {
  const nodeOk = mount.nodes.length === 0 || mount.nodes.some((row) => row.nodeId === server.nodeId);
  const eggOk = mount.eggs.length === 0 || mount.eggs.some((row) => row.eggId === server.eggId);
  return nodeOk && eggOk;
}

export async function setServerMountAction(
  serverId: number,
  mountId: number,
  attach: boolean,
): Promise<AdminServerState> {
  const admin = await requirePermission("servers.manage");

  const server = await prisma.server.findUnique({ where: { id: serverId }, select: { nodeId: true, eggId: true } });
  if (!server) return { error: "Server not found." };

  const mount = await prisma.mount.findUnique({
    where: { id: mountId },
    include: { nodes: { select: { nodeId: true } }, eggs: { select: { eggId: true } } },
  });
  if (!mount) return { error: "Mount not found." };

  if (attach) {
    if (!mountEligible(mount, server)) return { error: "This mount is not eligible for the server's node or service." };
    await prisma.serverMount.upsert({
      where: { mountId_serverId: { mountId, serverId } },
      create: { mountId, serverId },
      update: {},
    });
  } else {
    await prisma.serverMount.deleteMany({ where: { mountId, serverId } });
  }

  let syncError: string | undefined;
  try {
    await syncServerToNode(serverId);
  } catch (error) {
    syncError = error instanceof Error ? error.message : "unknown error";
  }

  await logActivity({
    event: attach ? "admin:server.mount.attach" : "admin:server.mount.detach",
    userId: admin.id,
    serverId,
    properties: { mountId, mount: mount.name },
  });
  revalidatePath("/admin/servers");

  const verb = attach ? "attached" : "detached";
  return syncError
    ? { success: `Mount ${verb}, but the node could not be updated: ${syncError}` }
    : { success: `Mount ${verb} and pushed to the node.` };
}

export async function retryInstallAction(serverId: number): Promise<AdminServerState> {
  const admin = await requirePermission("servers.manage");
  try {
    const spec = await buildServerSpec(serverId);
    const { client } = await daemonForServer(serverId);
    await client.createServer(spec, false);
    await prisma.server.update({
      where: { id: serverId },
      data: { status: "installing", installStatus: "running" },
    });
    await logActivity({ event: "admin:server.retry_install", userId: admin.id, serverId });
    revalidatePath("/admin/servers");
    return { success: "Install re-queued on the node." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The node rejected the install." };
  }
}

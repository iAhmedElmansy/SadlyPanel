"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { encrypt, randomHex, randomToken, uuid } from "@/lib/crypto";
import { nodeSchema } from "@/lib/validation";
import { daemonForNode } from "@/lib/daemon";
import { logActivity } from "@/lib/activity";

export interface NodeState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

function parseNodeForm(formData: FormData) {
  return nodeSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    locationId: formData.get("locationId") ? Number(formData.get("locationId")) : null,
    fqdn: formData.get("fqdn"),
    scheme: formData.get("scheme") ?? "https",
    behindProxy: formData.get("behindProxy") !== null,
    public: formData.get("public") !== null,
    maintenanceMode: formData.get("maintenanceMode") !== null,
    memory: formData.get("memory"),
    memoryOverallocate: formData.get("memoryOverallocate") ?? 0,
    disk: formData.get("disk"),
    diskOverallocate: formData.get("diskOverallocate") ?? 0,
    cpu: formData.get("cpu"),
    cpuOverallocate: formData.get("cpuOverallocate") ?? 0,
    uploadSize: formData.get("uploadSize") ?? 256,
    daemonBase: formData.get("daemonBase") ?? "/var/lib/spanel/volumes",
    daemonListenHost: formData.get("daemonListenHost") ?? "",
    daemonPort: formData.get("daemonPort") ?? 8080,
    daemonSftpPort: formData.get("daemonSftpPort") ?? 2022,
    proxyEnabled: formData.get("proxyEnabled") !== null,
    proxyHttpPort: formData.get("proxyHttpPort") ?? 80,
    proxyHttpsPort: formData.get("proxyHttpsPort") ?? 443,
  });
}

/**
 * Optional plan-gating field. Kept out of the shared `nodeSchema` (owned
 * elsewhere): read straight off the form and coerce an empty value to null,
 * otherwise a positive Int. Anything else is treated as "no restriction".
 */
function parseRequiredPlanId(formData: FormData): number | null {
  const raw = formData.get("requiredPlanId");
  if (raw == null || raw === "") return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function createNodeAction(_prev: NodeState, formData: FormData): Promise<NodeState> {
  const admin = await requireAdmin();
  const parsed = parseNodeForm(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Please fix the highlighted fields." };
  }

  const token = randomToken(32);
  const node = await prisma.node.create({
    data: {
      ...parsed.data,
      description: parsed.data.description ?? null,
      locationId: parsed.data.locationId ?? null,
      requiredPlanId: parseRequiredPlanId(formData),
      uuid: uuid(),
      daemonTokenId: randomHex(8),
      daemonToken: encrypt(token),
    },
  });

  await logActivity({ event: "admin:node.create", userId: admin.id, properties: { name: node.name, fqdn: node.fqdn } });
  revalidatePath("/admin/nodes");
  return { success: `Node ${node.name} created. Open it to copy the daemon configuration.` };
}

export async function updateNodeAction(_prev: NodeState, formData: FormData): Promise<NodeState> {
  const admin = await requireAdmin();
  const nodeId = Number(formData.get("nodeId"));
  if (!Number.isInteger(nodeId)) return { error: "Invalid node." };

  const parsed = parseNodeForm(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Please fix the highlighted fields." };
  }

  await prisma.node.update({
    where: { id: nodeId },
    data: {
      ...parsed.data,
      description: parsed.data.description ?? null,
      locationId: parsed.data.locationId ?? null,
      requiredPlanId: parseRequiredPlanId(formData),
    },
  });

  await logActivity({ event: "admin:node.update", userId: admin.id, properties: { nodeId } });
  revalidatePath("/admin/nodes");
  revalidatePath(`/admin/nodes/${nodeId}`);
  return { success: "Node updated." };
}

export async function deleteNodeAction(nodeId: number): Promise<NodeState> {
  const admin = await requireAdmin();
  const servers = await prisma.server.count({ where: { nodeId } });
  if (servers > 0) return { error: `This node still hosts ${servers} server(s). Delete them first.` };

  const node = await prisma.node.findUnique({ where: { id: nodeId }, select: { name: true } });
  await prisma.node.delete({ where: { id: nodeId } });

  await logActivity({ event: "admin:node.delete", userId: admin.id, properties: { name: node?.name } });
  revalidatePath("/admin/nodes");
  return { success: `Node ${node?.name ?? nodeId} deleted.` };
}

export async function rotateNodeTokenAction(nodeId: number): Promise<NodeState> {
  const admin = await requireAdmin();
  const token = randomToken(32);
  await prisma.node.update({
    where: { id: nodeId },
    data: { daemonTokenId: randomHex(8), daemonToken: encrypt(token) },
  });
  await logActivity({ event: "admin:node.rotate_token", userId: admin.id, properties: { nodeId } });
  revalidatePath(`/admin/nodes/${nodeId}`);
  return { success: "Token rotated. Update the daemon config and restart it." };
}

export async function testNodeAction(nodeId: number): Promise<NodeState> {
  try {
    const client = await daemonForNode(nodeId);
    const info = await client.system();
    // Ask the daemon to beat immediately so the health panel updates without
    // waiting for its next scheduled interval.
    await client.requestHeartbeat().catch(() => undefined);
    revalidatePath("/admin/nodes");
    revalidatePath(`/admin/nodes/${nodeId}`);
    return {
      success: `Connected — daemon ${info.version}, ${info.cpuCount} CPU(s), docker ${info.dockerVersion}, ${info.serverCount} server(s).`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to reach the daemon." };
  }
}

export async function createLocationAction(_prev: NodeState, formData: FormData): Promise<NodeState> {
  await requireAdmin();
  const shortCode = String(formData.get("shortCode") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!/^[a-z0-9-]{2,20}$/.test(shortCode)) return { error: "Short code must be 2–20 lowercase letters, numbers or dashes." };
  if (!name) return { error: "Name is required." };

  const clash = await prisma.location.findUnique({ where: { shortCode } });
  if (clash) return { error: "That short code is already used." };

  await prisma.location.create({ data: { shortCode, name } });
  revalidatePath("/admin/nodes");
  return { success: `Location ${shortCode} created.` };
}

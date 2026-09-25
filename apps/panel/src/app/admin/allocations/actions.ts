"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { allocationSchema, expandPortSpec } from "@/lib/validation";
import { logActivity } from "@/lib/activity";

export interface AllocationState {
  error?: string;
  success?: string;
}

export async function createAllocationsAction(_prev: AllocationState, formData: FormData): Promise<AllocationState> {
  const admin = await requireAdmin();

  const parsed = allocationSchema.safeParse({
    nodeId: formData.get("nodeId"),
    ip: formData.get("ip"),
    ipAlias: formData.get("ipAlias") || undefined,
    ports: formData.get("ports"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid allocation." };

  let ports: number[];
  try {
    ports = expandPortSpec(parsed.data.ports);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid port specification." };
  }
  if (ports.length === 0) return { error: "No valid ports were provided." };

  // SQLite has no `skipDuplicates`, so existing ip:port rows are filtered first.
  const existing = await prisma.allocation.findMany({
    where: { nodeId: parsed.data.nodeId, ip: parsed.data.ip, port: { in: ports } },
    select: { port: true },
  });
  const taken = new Set(existing.map((row) => row.port));
  const fresh = ports.filter((port) => !taken.has(port));

  const result =
    fresh.length > 0
      ? await prisma.allocation.createMany({
          data: fresh.map((port) => ({
            nodeId: parsed.data.nodeId,
            ip: parsed.data.ip,
            ipAlias: parsed.data.ipAlias ?? null,
            port,
            notes: parsed.data.notes ?? null,
          })),
        })
      : { count: 0 };

  await logActivity({
    event: "admin:allocation.create",
    userId: admin.id,
    properties: { nodeId: parsed.data.nodeId, ip: parsed.data.ip, requested: ports.length, created: result.count },
  });

  revalidatePath("/admin/allocations");
  const skipped = ports.length - result.count;
  return {
    success: `Created ${result.count} port(s)${skipped > 0 ? ` — ${skipped} already existed.` : "."}`,
  };
}

export async function deleteAllocationAction(allocationId: number): Promise<AllocationState> {
  const admin = await requireAdmin();
  const allocation = await prisma.allocation.findUnique({ where: { id: allocationId } });
  if (!allocation) return { error: "Allocation not found." };
  if (allocation.serverId) return { error: "This port is assigned to a server. Detach it first." };

  await prisma.allocation.delete({ where: { id: allocationId } });
  await logActivity({
    event: "admin:allocation.delete",
    userId: admin.id,
    properties: { ip: allocation.ip, port: allocation.port },
  });

  revalidatePath("/admin/allocations");
  return { success: `Removed ${allocation.ip}:${allocation.port}.` };
}

export async function deleteUnusedAllocationsAction(nodeId: number): Promise<AllocationState> {
  const admin = await requireAdmin();
  const result = await prisma.allocation.deleteMany({ where: { nodeId, serverId: null } });
  await logActivity({ event: "admin:allocation.prune", userId: admin.id, properties: { nodeId, removed: result.count } });
  revalidatePath("/admin/allocations");
  return { success: `Removed ${result.count} unassigned port(s).` };
}

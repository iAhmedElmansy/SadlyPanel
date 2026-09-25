"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { uuid } from "@/lib/crypto";
import { mountSchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { syncServerToNode } from "@/lib/daemon";

export interface MountState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

function fieldErrorsOf(issues: { path: (string | number | symbol)[]; message: string }[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function numberList(formData: FormData, key: string): number[] {
  return formData
    .getAll(key)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function parseMount(formData: FormData) {
  return mountSchema.safeParse({
    name: formData.get("name"),
    description: text(formData, "description"),
    source: formData.get("source"),
    target: formData.get("target"),
    readOnly: formData.get("readOnly") !== null,
    userMountable: formData.get("userMountable") !== null,
    nodeIds: numberList(formData, "nodeIds"),
    eggIds: numberList(formData, "eggIds"),
  });
}

export async function createMountAction(_prev: MountState, formData: FormData): Promise<MountState> {
  const admin = await requireAdmin();
  const parsed = parseMount(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const clash = await prisma.mount.findFirst({ where: { name: parsed.data.name } });
  if (clash) return { error: `A mount named "${parsed.data.name}" already exists.` };

  const mount = await prisma.mount.create({
    data: {
      uuid: uuid(),
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      source: parsed.data.source,
      target: parsed.data.target,
      readOnly: parsed.data.readOnly,
      userMountable: parsed.data.userMountable,
      nodes: { create: parsed.data.nodeIds.map((nodeId) => ({ nodeId })) },
      eggs: { create: parsed.data.eggIds.map((eggId) => ({ eggId })) },
    },
  });

  await logActivity({ event: "admin:mount.create", userId: admin.id, properties: { name: mount.name } });
  revalidatePath("/admin/mounts");
  return { success: `Mount ${mount.name} created.` };
}

export async function updateMountAction(_prev: MountState, formData: FormData): Promise<MountState> {
  const admin = await requireAdmin();
  const mountId = Number(formData.get("mountId"));
  if (!Number.isInteger(mountId)) return { error: "Invalid mount." };

  const parsed = parseMount(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const clash = await prisma.mount.findFirst({ where: { name: parsed.data.name, id: { not: mountId } } });
  if (clash) return { error: `A mount named "${parsed.data.name}" already exists.` };

  // Replace the restriction rows wholesale so the picker is the source of truth.
  await prisma.$transaction([
    prisma.mount.update({
      where: { id: mountId },
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        source: parsed.data.source,
        target: parsed.data.target,
        readOnly: parsed.data.readOnly,
        userMountable: parsed.data.userMountable,
      },
    }),
    prisma.mountNode.deleteMany({ where: { mountId } }),
    prisma.mountEgg.deleteMany({ where: { mountId } }),
    prisma.mountNode.createMany({ data: parsed.data.nodeIds.map((nodeId) => ({ mountId, nodeId })) }),
    prisma.mountEgg.createMany({ data: parsed.data.eggIds.map((eggId) => ({ mountId, eggId })) }),
  ]);

  // Push the (possibly changed) source/target/readOnly to every attached server.
  const attached = await prisma.serverMount.findMany({ where: { mountId }, select: { serverId: true } });
  await Promise.all(
    attached.map((row) => syncServerToNode(row.serverId).catch(() => undefined)),
  );

  await logActivity({ event: "admin:mount.update", userId: admin.id, properties: { mountId } });
  revalidatePath("/admin/mounts");
  return { success: "Mount updated." };
}

export async function deleteMountAction(mountId: number): Promise<MountState> {
  const admin = await requireAdmin();
  const mount = await prisma.mount.findUnique({
    where: { id: mountId },
    select: { name: true, servers: { select: { serverId: true } } },
  });
  if (!mount) return { error: "Mount not found." };

  const affected = mount.servers.map((row) => row.serverId);
  // Cascade removes the join rows; deleting a mount never removes servers.
  await prisma.mount.delete({ where: { id: mountId } });

  // Re-sync servers that had it attached so the bind is dropped on the node.
  await Promise.all(affected.map((serverId) => syncServerToNode(serverId).catch(() => undefined)));

  await logActivity({ event: "admin:mount.delete", userId: admin.id, properties: { name: mount.name } });
  revalidatePath("/admin/mounts");
  return { success: `Mount ${mount.name} deleted.` };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { encrypt } from "@/lib/crypto";
import { databaseHostSchema } from "@/lib/validation";
import { probeDatabaseHost, refreshDatabaseHostHealth } from "@/lib/services/db-health";
import { logActivity } from "@/lib/activity";

export interface DatabaseHostState {
  error?: string;
  success?: string;
}

export async function createDatabaseHostAction(_prev: DatabaseHostState, formData: FormData): Promise<DatabaseHostState> {
  const admin = await requireAdmin();

  const parsed = databaseHostSchema.safeParse({
    name: formData.get("name"),
    host: formData.get("host"),
    port: formData.get("port"),
    username: formData.get("username"),
    password: formData.get("password"),
    maxDatabases: formData.get("maxDatabases") ?? 0,
    phpMyAdminUrl: formData.get("phpMyAdminUrl") || undefined,
    nodeId: formData.get("nodeId") ? Number(formData.get("nodeId")) : null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid database host." };
  if (!parsed.data.password) return { error: "A password is required." };

  const clash = await prisma.databaseHost.findUnique({
    where: { host_port: { host: parsed.data.host, port: parsed.data.port } },
  });
  if (clash) return { error: "A host with that address and port already exists." };

  const created = await prisma.databaseHost.create({
    data: {
      name: parsed.data.name,
      host: parsed.data.host,
      port: parsed.data.port,
      username: parsed.data.username,
      password: encrypt(parsed.data.password),
      maxDatabases: parsed.data.maxDatabases,
      phpMyAdminUrl: parsed.data.phpMyAdminUrl ?? null,
      nodeId: parsed.data.nodeId ?? null,
    },
  });

  const test = await probeDatabaseHost(created);
  await logActivity({
    event: "admin:database_host.create",
    userId: admin.id,
    properties: { host: created.host, reachable: test.reachable },
  });

  revalidatePath("/admin/databases");
  return test.reachable
    ? { success: `${created.name} added and reachable (MySQL ${test.version ?? "unknown"}).` }
    : { success: `${created.name} added, but the connection test failed: ${test.note}` };
}

export async function updateDatabaseHostAction(_prev: DatabaseHostState, formData: FormData): Promise<DatabaseHostState> {
  await requireAdmin();
  const hostId = Number(formData.get("hostId"));
  if (!Number.isInteger(hostId)) return { error: "Invalid host." };

  const parsed = databaseHostSchema.safeParse({
    name: formData.get("name"),
    host: formData.get("host"),
    port: formData.get("port"),
    username: formData.get("username"),
    password: formData.get("password"),
    maxDatabases: formData.get("maxDatabases") ?? 0,
    phpMyAdminUrl: formData.get("phpMyAdminUrl") || undefined,
    nodeId: formData.get("nodeId") ? Number(formData.get("nodeId")) : null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid database host." };

  await prisma.databaseHost.update({
    where: { id: hostId },
    data: {
      name: parsed.data.name,
      host: parsed.data.host,
      port: parsed.data.port,
      username: parsed.data.username,
      maxDatabases: parsed.data.maxDatabases,
      phpMyAdminUrl: parsed.data.phpMyAdminUrl ?? null,
      nodeId: parsed.data.nodeId ?? null,
      ...(parsed.data.password ? { password: encrypt(parsed.data.password) } : {}),
    },
  });

  revalidatePath("/admin/databases");
  return { success: "Database host updated." };
}

export async function deleteDatabaseHostAction(hostId: number): Promise<DatabaseHostState> {
  const admin = await requireAdmin();
  const count = await prisma.serverDatabase.count({ where: { databaseHostId: hostId } });
  if (count > 0) return { error: `${count} server database(s) still live on this host.` };

  const host = await prisma.databaseHost.findUnique({ where: { id: hostId }, select: { name: true } });
  await prisma.databaseHost.delete({ where: { id: hostId } });

  await logActivity({ event: "admin:database_host.delete", userId: admin.id, properties: { name: host?.name } });
  revalidatePath("/admin/databases");
  return { success: `${host?.name ?? "Host"} removed.` };
}

export async function testDatabaseHostAction(hostId: number): Promise<DatabaseHostState> {
  await requireAdmin();
  const host = await prisma.databaseHost.findUnique({ where: { id: hostId } });
  if (!host) return { error: "Host not found." };

  const result = await probeDatabaseHost(host);
  revalidatePath("/admin/databases");
  return result.reachable
    ? { success: `Connected — MySQL ${result.version ?? "unknown"} in ${result.latencyMs}ms.` }
    : { error: result.note ?? "Connection failed." };
}

/** Re-probes every host; used by the "check all" button on the databases page. */
export async function refreshDatabaseHealthAction(): Promise<DatabaseHostState> {
  await requireAdmin();
  const checked = await refreshDatabaseHostHealth({ force: true });
  revalidatePath("/admin/databases");
  return { success: checked === 0 ? "No database hosts to check." : `Checked ${checked} host(s).` };
}

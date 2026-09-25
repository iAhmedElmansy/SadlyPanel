"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can, resolveServerAccess } from "@/lib/auth/rbac";
import { daemonForServer, syncServerToNode } from "@/lib/daemon";
import { logActivity } from "@/lib/activity";
import { commandSchema, powerSchema, renameSchema } from "@/lib/validation";
import {
  buildDatabaseName,
  buildDatabaseUsername,
  dropDatabase,
  provisionDatabase,
  rotateDatabasePassword,
} from "@/lib/databases";
import { encrypt, generatePassword, randomHex } from "@/lib/crypto";
import { attachHostname, detachHostname, applyProxy } from "@/lib/services/network";
import { createServerBackup } from "@/lib/services/backups";
import { computeNextRun, runScheduleNow } from "@/lib/services/scheduler";
import { scheduleSchema, taskSchema } from "@/lib/validation";
import type { SubuserPermission } from "@/lib/constants";

export interface Result {
  ok: boolean;
  error?: string;
  message?: string;
}

async function guard(serverUuid: string, permission: SubuserPermission) {
  const user = await requireUser();
  const access = await resolveServerAccess(user, serverUuid);
  if (!access) throw new Error("Server not found or access denied.");
  if (!can(access, permission)) throw new Error("You do not have permission to do that.");
  return { user, access };
}

function fail(error: unknown): Result {
  return { ok: false, error: error instanceof Error ? error.message : "Unexpected error." };
}

// ---------------------------------------------------------------------------
// Power + console
// ---------------------------------------------------------------------------

export async function powerAction(serverUuid: string, rawAction: string): Promise<Result> {
  try {
    const parsed = powerSchema.parse({ action: rawAction });
    const permission = (
      {
        start: "control.start",
        stop: "control.stop",
        restart: "control.restart",
        kill: "control.stop",
      } as const
    )[parsed.action];

    const { user, access } = await guard(serverUuid, permission);
    const { client, uuid: id } = await daemonForServer(access.serverId);
    await client.power(id, parsed.action);

    await logActivity({
      event: `server:power.${parsed.action}`,
      userId: user.id,
      serverId: access.serverId,
    });
    revalidatePath(`/dashboard/servers/${serverUuid}`);
    return { ok: true, message: `Sent ${parsed.action} to the server.` };
  } catch (error) {
    return fail(error);
  }
}

export async function sendCommandAction(serverUuid: string, command: string): Promise<Result> {
  try {
    const parsed = commandSchema.parse({ command });
    const { access } = await guard(serverUuid, "control.console");
    const { client, uuid: id } = await daemonForServer(access.serverId);
    await client.sendCommand(id, parsed.command);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export async function listFilesAction(serverUuid: string, directory: string) {
  const { access } = await guard(serverUuid, "file.read");
  const { client, uuid: id } = await daemonForServer(access.serverId);
  return client.listDirectory(id, directory || "/");
}

export async function readFileAction(serverUuid: string, file: string): Promise<{ ok: boolean; contents?: string; error?: string }> {
  try {
    const { access } = await guard(serverUuid, "file.read");
    const { client, uuid: id } = await daemonForServer(access.serverId);
    const contents = await client.readFile(id, file);
    return { ok: true, contents };
  } catch (error) {
    return fail(error);
  }
}

export async function writeFileAction(serverUuid: string, file: string, contents: string): Promise<Result> {
  try {
    const { user, access } = await guard(serverUuid, "file.write");
    const { client, uuid: id } = await daemonForServer(access.serverId);
    await client.writeFile(id, file, contents);
    await logActivity({ event: "server:file.write", userId: user.id, serverId: access.serverId, properties: { file } });
    return { ok: true, message: "Saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function createDirectoryAction(serverUuid: string, root: string, name: string): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "file.write");
    const { client, uuid: id } = await daemonForServer(access.serverId);
    await client.createDirectory(id, root, name);
    return { ok: true, message: "Folder created." };
  } catch (error) {
    return fail(error);
  }
}

export async function renameFileAction(serverUuid: string, root: string, from: string, to: string): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "file.write");
    const { client, uuid: id } = await daemonForServer(access.serverId);
    await client.renameFiles(id, root, [{ from, to }]);
    return { ok: true, message: "Renamed." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteFilesAction(serverUuid: string, root: string, files: string[]): Promise<Result> {
  try {
    const { user, access } = await guard(serverUuid, "file.delete");
    const { client, uuid: id } = await daemonForServer(access.serverId);
    await client.deleteFiles(id, root, files);
    await logActivity({
      event: "server:file.delete",
      userId: user.id,
      serverId: access.serverId,
      properties: { root, count: files.length },
    });
    return { ok: true, message: `Deleted ${files.length} item(s).` };
  } catch (error) {
    return fail(error);
  }
}

export async function compressFilesAction(serverUuid: string, root: string, files: string[]): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "file.archive");
    const { client, uuid: id } = await daemonForServer(access.serverId);
    const created = await client.compressFiles(id, root, files);
    return { ok: true, message: `Created ${created.name}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function decompressFileAction(serverUuid: string, root: string, file: string): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "file.archive");
    const { client, uuid: id } = await daemonForServer(access.serverId);
    await client.decompressFile(id, root, file);
    return { ok: true, message: "Archive extracted." };
  } catch (error) {
    return fail(error);
  }
}

export async function pullFileAction(serverUuid: string, root: string, url: string, fileName?: string): Promise<Result> {
  try {
    if (!/^https?:\/\//i.test(url)) throw new Error("Only http(s) URLs can be pulled.");
    const { access } = await guard(serverUuid, "file.write");
    const { client, uuid: id } = await daemonForServer(access.serverId);
    await client.pullFile(id, root, url, fileName);
    return { ok: true, message: "Download queued." };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Databases
// ---------------------------------------------------------------------------

export async function createDatabaseAction(serverUuid: string, name: string, remote: string): Promise<Result> {
  try {
    const { user, access } = await guard(serverUuid, "database.create");
    const server = await prisma.server.findUniqueOrThrow({
      where: { id: access.serverId },
      include: { databases: true, node: true },
    });
    if (server.databases.length >= server.databaseLimit) {
      throw new Error(`This server is limited to ${server.databaseLimit} database(s).`);
    }

    const host =
      (await prisma.databaseHost.findFirst({ where: { nodeId: server.nodeId } })) ??
      (await prisma.databaseHost.findFirst());
    if (!host) throw new Error("No database host has been configured by an administrator.");

    if (host.maxDatabases > 0) {
      const used = await prisma.serverDatabase.count({ where: { databaseHostId: host.id } });
      if (used >= host.maxDatabases) throw new Error("The database host has reached its database limit.");
    }

    const dbName = buildDatabaseName(server.id, name);
    const dbUser = buildDatabaseUsername(server.id, randomHex(4));
    const password = generatePassword(24);
    const remotePattern = remote.trim() || "%";

    await provisionDatabase({ host, database: dbName, username: dbUser, password, remote: remotePattern });

    await prisma.serverDatabase.create({
      data: {
        serverId: server.id,
        databaseHostId: host.id,
        database: dbName,
        username: dbUser,
        password: encrypt(password),
        remote: remotePattern,
      },
    });

    await logActivity({
      event: "server:database.create",
      userId: user.id,
      serverId: server.id,
      properties: { database: dbName, host: host.name },
    });
    revalidatePath(`/dashboard/servers/${serverUuid}/databases`);
    return { ok: true, message: `Database ${dbName} created.` };
  } catch (error) {
    return fail(error);
  }
}

export async function rotateDatabasePasswordAction(serverUuid: string, databaseId: number): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "database.rotate");
    const record = await prisma.serverDatabase.findFirst({
      where: { id: databaseId, serverId: access.serverId },
      include: { host: true },
    });
    if (!record) throw new Error("Database not found.");

    const password = generatePassword(24);
    await rotateDatabasePassword(record.host, record.username, record.remote, password);
    await prisma.serverDatabase.update({ where: { id: record.id }, data: { password: encrypt(password) } });

    revalidatePath(`/dashboard/servers/${serverUuid}/databases`);
    return { ok: true, message: "Password rotated." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteDatabaseAction(serverUuid: string, databaseId: number): Promise<Result> {
  try {
    const { user, access } = await guard(serverUuid, "database.delete");
    const record = await prisma.serverDatabase.findFirst({
      where: { id: databaseId, serverId: access.serverId },
      include: { host: true },
    });
    if (!record) throw new Error("Database not found.");

    await dropDatabase(record.host, record.database, record.username, record.remote);
    await prisma.serverDatabase.delete({ where: { id: record.id } });

    await logActivity({
      event: "server:database.delete",
      userId: user.id,
      serverId: access.serverId,
      properties: { database: record.database },
    });
    revalidatePath(`/dashboard/servers/${serverUuid}/databases`);
    return { ok: true, message: "Database removed." };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Network / hostnames
// ---------------------------------------------------------------------------

export async function attachHostnameAction(
  serverUuid: string,
  input: {
    mode: "subdomain" | "custom";
    domainId?: number;
    label?: string;
    hostname?: string;
    kind: string;
    httpsMode: string;
    forceHttps: boolean;
    targetPort?: number | null;
    isPrimary: boolean;
  },
): Promise<Result> {
  try {
    const { user, access } = await guard(serverUuid, "network.update");
    const binding = await attachHostname({ serverId: access.serverId, ...input });
    await logActivity({
      event: "server:network.attach",
      userId: user.id,
      serverId: access.serverId,
      properties: { hostname: binding.hostname },
    });
    revalidatePath(`/dashboard/servers/${serverUuid}/network`);
    return { ok: true, message: `${binding.hostname} attached.` };
  } catch (error) {
    return fail(error);
  }
}

export async function detachHostnameAction(serverUuid: string, bindingId: number): Promise<Result> {
  try {
    const { user, access } = await guard(serverUuid, "network.update");
    await detachHostname(access.serverId, bindingId);
    await logActivity({ event: "server:network.detach", userId: user.id, serverId: access.serverId });
    revalidatePath(`/dashboard/servers/${serverUuid}/network`);
    return { ok: true, message: "Hostname removed." };
  } catch (error) {
    return fail(error);
  }
}

export async function reapplyProxyAction(serverUuid: string): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "network.update");
    const result = await applyProxy(access.serverId);
    revalidatePath(`/dashboard/servers/${serverUuid}/network`);
    return result.ok ? { ok: true, message: "Proxy configuration applied." } : { ok: false, error: result.error };
  } catch (error) {
    return fail(error);
  }
}

export async function setPrimaryAllocationAction(serverUuid: string, allocationId: number): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "network.update");
    const allocation = await prisma.allocation.findFirst({ where: { id: allocationId, serverId: access.serverId } });
    if (!allocation) throw new Error("Allocation not found.");

    await prisma.$transaction([
      prisma.allocation.updateMany({ where: { serverId: access.serverId }, data: { isPrimary: false } }),
      prisma.allocation.update({ where: { id: allocationId }, data: { isPrimary: true } }),
    ]);

    await syncServerToNode(access.serverId).catch(() => undefined);
    await applyProxy(access.serverId).catch(() => undefined);
    revalidatePath(`/dashboard/servers/${serverUuid}/network`);
    return { ok: true, message: "Primary port updated." };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

export async function createBackupAction(serverUuid: string, name: string, ignore: string): Promise<Result> {
  try {
    const { user, access } = await guard(serverUuid, "backup.create");
    await createServerBackup({
      serverId: access.serverId,
      name,
      ignore: ignore.split("\n"),
    });

    await logActivity({ event: "server:backup.create", userId: user.id, serverId: access.serverId });
    revalidatePath(`/dashboard/servers/${serverUuid}/backups`);
    return { ok: true, message: "Backup started." };
  } catch (error) {
    return fail(error);
  }
}

export async function restoreBackupAction(serverUuid: string, backupId: number, truncate: boolean): Promise<Result> {
  try {
    const { user, access } = await guard(serverUuid, "backup.restore");
    const backup = await prisma.backup.findFirst({ where: { id: backupId, serverId: access.serverId } });
    if (!backup) throw new Error("Backup not found.");
    if (!backup.isSuccessful) throw new Error("This backup has not completed successfully.");

    const { client, uuid: id } = await daemonForServer(access.serverId);
    await client.restoreBackup(id, backup.uuid, truncate);

    await logActivity({ event: "server:backup.restore", userId: user.id, serverId: access.serverId });
    return { ok: true, message: "Restore started." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteBackupAction(serverUuid: string, backupId: number): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "backup.delete");
    const backup = await prisma.backup.findFirst({ where: { id: backupId, serverId: access.serverId } });
    if (!backup) throw new Error("Backup not found.");
    if (backup.isLocked) throw new Error("This backup is locked.");

    const { client, uuid: id } = await daemonForServer(access.serverId);
    await client.deleteBackup(id, backup.uuid).catch(() => undefined);
    await prisma.backup.delete({ where: { id: backup.id } });

    revalidatePath(`/dashboard/servers/${serverUuid}/backups`);
    return { ok: true, message: "Backup deleted." };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function renameServerAction(serverUuid: string, name: string, description: string): Promise<Result> {
  try {
    const parsed = renameSchema.parse({ name, description });
    const { access } = await guard(serverUuid, "settings.rename");
    await prisma.server.update({
      where: { id: access.serverId },
      data: { name: parsed.name, description: parsed.description || null },
    });
    revalidatePath(`/dashboard/servers/${serverUuid}`);
    return { ok: true, message: "Server details updated." };
  } catch (error) {
    return fail(error);
  }
}

export async function reinstallServerAction(serverUuid: string): Promise<Result> {
  try {
    const { user, access } = await guard(serverUuid, "settings.reinstall");
    await prisma.server.update({
      where: { id: access.serverId },
      data: { status: "installing", installStatus: "running" },
    });
    const { client, uuid: id } = await daemonForServer(access.serverId);
    await client.reinstallServer(id);
    await logActivity({ event: "server:reinstall", userId: user.id, serverId: access.serverId });
    revalidatePath(`/dashboard/servers/${serverUuid}`);
    return { ok: true, message: "Reinstall started." };
  } catch (error) {
    return fail(error);
  }
}

export async function updateStartupVariableAction(serverUuid: string, variableId: number, value: string): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "settings.rename");
    const variable = await prisma.eggVariable.findUnique({ where: { id: variableId } });
    if (!variable) throw new Error("Variable not found.");
    if (!variable.userEditable) throw new Error("That variable is locked by an administrator.");

    await prisma.serverVariable.upsert({
      where: { serverId_variableId: { serverId: access.serverId, variableId } },
      create: { serverId: access.serverId, variableId, value },
      update: { value },
    });

    await syncServerToNode(access.serverId).catch(() => undefined);
    revalidatePath(`/dashboard/servers/${serverUuid}/startup`);
    return { ok: true, message: "Variable saved." };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Subusers
// ---------------------------------------------------------------------------

export async function addSubuserAction(serverUuid: string, email: string, permissions: string[]): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "user.create");
    const target = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!target) throw new Error("No user with that email address exists.");

    const server = await prisma.server.findUniqueOrThrow({ where: { id: access.serverId } });
    if (target.id === server.ownerId) throw new Error("The owner already has full access.");

    await prisma.subuser.upsert({
      where: { serverId_userId: { serverId: access.serverId, userId: target.id } },
      create: { serverId: access.serverId, userId: target.id, permissions: JSON.stringify(permissions) },
      update: { permissions: JSON.stringify(permissions) },
    });

    revalidatePath(`/dashboard/servers/${serverUuid}/users`);
    return { ok: true, message: `${target.username} now has access.` };
  } catch (error) {
    return fail(error);
  }
}

export async function removeSubuserAction(serverUuid: string, subuserId: number): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "user.delete");
    await prisma.subuser.deleteMany({ where: { id: subuserId, serverId: access.serverId } });
    revalidatePath(`/dashboard/servers/${serverUuid}/users`);
    return { ok: true, message: "Subuser removed." };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Schedules + tasks
// ---------------------------------------------------------------------------

const schedulesPath = (serverUuid: string) => `/dashboard/servers/${serverUuid}/schedules`;

export async function createScheduleAction(serverUuid: string, input: unknown): Promise<Result> {
  try {
    const { user, access } = await guard(serverUuid, "schedule.update");
    const data = scheduleSchema.parse(input);
    const nextRunAt = computeNextRun(
      {
        cronMinute: data.cronMinute,
        cronHour: data.cronHour,
        cronDayMonth: data.cronDayMonth,
        cronMonth: data.cronMonth,
        cronDayWeek: data.cronDayWeek,
      },
      new Date(),
    );

    const schedule = await prisma.schedule.create({
      data: {
        serverId: access.serverId,
        name: data.name,
        cronMinute: data.cronMinute,
        cronHour: data.cronHour,
        cronDayMonth: data.cronDayMonth,
        cronMonth: data.cronMonth,
        cronDayWeek: data.cronDayWeek,
        isActive: data.isActive,
        onlyWhenOnline: data.onlyWhenOnline,
        nextRunAt: data.isActive ? nextRunAt : null,
      },
    });

    await logActivity({ event: "server:schedule.create", userId: user.id, serverId: access.serverId, properties: { name: data.name } });
    revalidatePath(schedulesPath(serverUuid));
    return { ok: true, message: `Schedule "${schedule.name}" created.` };
  } catch (error) {
    return fail(error);
  }
}

export async function updateScheduleAction(serverUuid: string, scheduleId: number, input: unknown): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "schedule.update");
    const existing = await prisma.schedule.findFirst({ where: { id: scheduleId, serverId: access.serverId } });
    if (!existing) throw new Error("Schedule not found.");

    const data = scheduleSchema.parse(input);
    const nextRunAt = computeNextRun(
      {
        cronMinute: data.cronMinute,
        cronHour: data.cronHour,
        cronDayMonth: data.cronDayMonth,
        cronMonth: data.cronMonth,
        cronDayWeek: data.cronDayWeek,
      },
      new Date(),
    );

    await prisma.schedule.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        cronMinute: data.cronMinute,
        cronHour: data.cronHour,
        cronDayMonth: data.cronDayMonth,
        cronMonth: data.cronMonth,
        cronDayWeek: data.cronDayWeek,
        isActive: data.isActive,
        onlyWhenOnline: data.onlyWhenOnline,
        nextRunAt: data.isActive ? nextRunAt : null,
      },
    });

    revalidatePath(schedulesPath(serverUuid));
    return { ok: true, message: "Schedule updated." };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleScheduleAction(serverUuid: string, scheduleId: number, isActive: boolean): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "schedule.update");
    const existing = await prisma.schedule.findFirst({ where: { id: scheduleId, serverId: access.serverId } });
    if (!existing) throw new Error("Schedule not found.");

    await prisma.schedule.update({
      where: { id: existing.id },
      data: {
        isActive,
        nextRunAt: isActive ? computeNextRun(existing, new Date()) : null,
      },
    });

    revalidatePath(schedulesPath(serverUuid));
    return { ok: true, message: isActive ? "Schedule activated." : "Schedule paused." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteScheduleAction(serverUuid: string, scheduleId: number): Promise<Result> {
  try {
    const { user, access } = await guard(serverUuid, "schedule.update");
    const deleted = await prisma.schedule.deleteMany({ where: { id: scheduleId, serverId: access.serverId } });
    if (deleted.count === 0) throw new Error("Schedule not found.");

    await logActivity({ event: "server:schedule.delete", userId: user.id, serverId: access.serverId });
    revalidatePath(schedulesPath(serverUuid));
    return { ok: true, message: "Schedule removed." };
  } catch (error) {
    return fail(error);
  }
}

export async function runScheduleNowAction(serverUuid: string, scheduleId: number): Promise<Result> {
  try {
    const { user, access } = await guard(serverUuid, "schedule.update");
    const schedule = await prisma.schedule.findFirst({ where: { id: scheduleId, serverId: access.serverId } });
    if (!schedule) throw new Error("Schedule not found.");

    const result = await runScheduleNow(schedule.id, user.id);
    revalidatePath(schedulesPath(serverUuid));

    const failedTasks = result.outcomes.filter((o) => !o.ok);
    if (failedTasks.length > 0) {
      return { ok: true, message: `Ran ${result.ran} task(s); ${failedTasks.length} failed: ${failedTasks[0]?.error ?? ""}` };
    }
    return { ok: true, message: `Ran ${result.ran} task(s).` };
  } catch (error) {
    return fail(error);
  }
}

async function assertScheduleOwned(serverId: number, scheduleId: number) {
  const schedule = await prisma.schedule.findFirst({ where: { id: scheduleId, serverId } });
  if (!schedule) throw new Error("Schedule not found.");
  return schedule;
}

export async function createTaskAction(serverUuid: string, scheduleId: number, input: unknown): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "schedule.update");
    await assertScheduleOwned(access.serverId, scheduleId);
    const data = taskSchema.parse(input);

    const last = await prisma.task.findFirst({ where: { scheduleId }, orderBy: { sequenceId: "desc" } });
    await prisma.task.create({
      data: {
        scheduleId,
        sequenceId: (last?.sequenceId ?? 0) + 1,
        action: data.action,
        payload: data.payload,
        timeOffset: data.timeOffset,
        continueOnFailure: data.continueOnFailure,
      },
    });

    revalidatePath(schedulesPath(serverUuid));
    return { ok: true, message: "Task added." };
  } catch (error) {
    return fail(error);
  }
}

export async function updateTaskAction(serverUuid: string, scheduleId: number, taskId: number, input: unknown): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "schedule.update");
    await assertScheduleOwned(access.serverId, scheduleId);
    const task = await prisma.task.findFirst({ where: { id: taskId, scheduleId } });
    if (!task) throw new Error("Task not found.");

    const data = taskSchema.parse(input);
    await prisma.task.update({
      where: { id: task.id },
      data: {
        action: data.action,
        payload: data.payload,
        timeOffset: data.timeOffset,
        continueOnFailure: data.continueOnFailure,
      },
    });

    revalidatePath(schedulesPath(serverUuid));
    return { ok: true, message: "Task updated." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteTaskAction(serverUuid: string, scheduleId: number, taskId: number): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "schedule.update");
    await assertScheduleOwned(access.serverId, scheduleId);
    await prisma.task.deleteMany({ where: { id: taskId, scheduleId } });
    revalidatePath(schedulesPath(serverUuid));
    return { ok: true, message: "Task removed." };
  } catch (error) {
    return fail(error);
  }
}

/** Persists a new task order. `orderedTaskIds` lists task ids in the desired order. */
export async function reorderTasksAction(serverUuid: string, scheduleId: number, orderedTaskIds: number[]): Promise<Result> {
  try {
    const { access } = await guard(serverUuid, "schedule.update");
    await assertScheduleOwned(access.serverId, scheduleId);
    const tasks = await prisma.task.findMany({ where: { scheduleId }, select: { id: true } });
    const owned = new Set(tasks.map((t) => t.id));
    if (orderedTaskIds.some((id) => !owned.has(id)) || orderedTaskIds.length !== tasks.length) {
      throw new Error("Task ordering does not match this schedule.");
    }

    await prisma.$transaction(
      orderedTaskIds.map((id, index) =>
        prisma.task.update({ where: { id }, data: { sequenceId: index + 1 } }),
      ),
    );

    revalidatePath(schedulesPath(serverUuid));
    return { ok: true, message: "Task order saved." };
  } catch (error) {
    return fail(error);
  }
}

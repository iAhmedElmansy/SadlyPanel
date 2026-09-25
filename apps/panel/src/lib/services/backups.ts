import { prisma } from "../db";
import { daemonForServer } from "../daemon";
import { uuid } from "../crypto";

/**
 * Shared server-backup creation path.
 *
 * Both the interactive backup action (server actions) and the background
 * scheduler use this so there is a single, tested place that enforces the
 * backup limit, writes the `Backup` row and dispatches the daemon job. If the
 * daemon call fails the row is rolled back so panel state never drifts.
 */
export async function createServerBackup(input: {
  serverId: number;
  name?: string;
  ignore?: string[];
}): Promise<{ id: number; uuid: string; name: string }> {
  const server = await prisma.server.findUniqueOrThrow({
    where: { id: input.serverId },
    include: { backups: true },
  });
  if (server.backups.length >= server.backupLimit) {
    throw new Error(`This server is limited to ${server.backupLimit} backup(s).`);
  }

  const ignored = (input.ignore ?? []).map((line) => line.trim()).filter(Boolean);
  const backupUuid = uuid();
  const name = input.name?.trim() || `backup-${new Date().toISOString().slice(0, 16)}`;

  const backup = await prisma.backup.create({
    data: {
      uuid: backupUuid,
      serverId: server.id,
      name,
      ignoredFiles: JSON.stringify(ignored),
    },
  });

  const { client, uuid: id } = await daemonForServer(server.id);
  try {
    await client.createBackup(id, backupUuid, ignored);
  } catch (error) {
    await prisma.backup.delete({ where: { id: backup.id } });
    throw error;
  }

  return { id: backup.id, uuid: backupUuid, name };
}

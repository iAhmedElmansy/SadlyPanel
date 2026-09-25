import { getWebsiteContext } from "@/lib/services/hosting";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { BackupPanel } from "@/app/dashboard/servers/[server]/backups/backup-panel";

export const dynamic = "force-dynamic";

export default async function WebsiteBackupsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: identifier } = await params;
  const { server, access } = await getWebsiteContext(identifier);
  const t = await getT();

  if (!can(access, "backup.read")) {
    return (
      <Card>
        <CardHeader title={t("dashboard.hostingBackupNoAccessTitle")} />
        <CardBody className="text-sm text-ink-muted">{t("dashboard.hostingBackupNoAccessBody")}</CardBody>
      </Card>
    );
  }

  const backups = await prisma.backup.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <BackupPanel
      serverUuid={server.uuidShort}
      limit={server.backupLimit}
      canCreate={can(access, "backup.create")}
      canDelete={can(access, "backup.delete")}
      canRestore={can(access, "backup.restore")}
      backups={backups.map((backup) => ({
        id: backup.id,
        uuid: backup.uuid,
        name: backup.name,
        bytes: backup.bytes,
        isSuccessful: backup.isSuccessful,
        isLocked: backup.isLocked,
        completedAt: backup.completedAt?.toISOString() ?? null,
        createdAt: backup.createdAt.toISOString(),
      }))}
    />
  );
}

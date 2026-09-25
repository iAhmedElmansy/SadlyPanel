import { getWebsiteContext } from "@/lib/services/hosting";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getT } from "@/lib/i18n/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DatabasePanel } from "@/app/dashboard/servers/[server]/databases/database-panel";

export const dynamic = "force-dynamic";

export default async function WebsiteDatabasesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: identifier } = await params;
  const { server, access } = await getWebsiteContext(identifier);
  const t = await getT();

  if (!can(access, "database.read")) {
    return (
      <Card>
        <CardHeader title={t("dashboard.hostingDbNoAccessTitle")} />
        <CardBody className="text-sm text-ink-muted">{t("dashboard.hostingDbNoAccessBody")}</CardBody>
      </Card>
    );
  }

  const rows = await prisma.serverDatabase.findMany({
    where: { serverId: server.id },
    include: { host: { select: { name: true, host: true, port: true, phpMyAdminUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
  const hostCount = await prisma.databaseHost.count();

  return (
    <div className="space-y-6">
      {hostCount === 0 ? (
        <Card className="border-warn/40">
          <CardHeader
            title={t("dashboard.hostingDbNoHostTitle")}
            description={t("dashboard.hostingDbNoHostDesc")}
          />
        </Card>
      ) : null}

      <DatabasePanel
        serverUuid={server.uuidShort}
        limit={server.databaseLimit}
        canCreate={can(access, "database.create")}
        canDelete={can(access, "database.delete")}
        canRotate={can(access, "database.rotate")}
        databases={rows.map((row) => ({
          id: row.id,
          database: row.database,
          username: row.username,
          password: decrypt(row.password),
          remote: row.remote,
          host: row.host,
          createdAt: row.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}

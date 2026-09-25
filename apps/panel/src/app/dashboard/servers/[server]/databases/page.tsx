import { getServerContext } from "@/lib/server-context";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DatabasePanel } from "./database-panel";

export const dynamic = "force-dynamic";

export default async function ServerDatabasesPage({ params }: { params: Promise<{ server: string }> }) {
  const { server: identifier } = await params;
  const { server, access } = await getServerContext(identifier);
  const t = await getT();

  if (!can(access, "database.read")) {
    return (
      <Card>
        <CardHeader title={t("dashboard.serverDbNoAccessTitle")} />
        <CardBody className="text-sm text-ink-muted">{t("dashboard.serverDbNoAccessBody")}</CardBody>
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
            title={t("dashboard.serverDbNoHostTitle")}
            description={t("dashboard.serverDbNoHostDescription")}
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

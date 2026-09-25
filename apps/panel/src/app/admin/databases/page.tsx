import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { databaseHostStatus, refreshDatabaseHostHealth } from "@/lib/services/db-health";
import { PageHeader } from "@/components/layout/page-header";
import { DatabaseHostManager } from "./database-host-manager";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.databasesMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminDatabasesPage() {
  await requireAdmin();
  const t = await getT();

  // Refresh stale probes in the background so the table always has a status
  // without making the request wait on an unreachable host.
  void refreshDatabaseHostHealth().catch(() => undefined);

  const [hosts, nodes] = await Promise.all([
    prisma.databaseHost.findMany({
      include: { node: { select: { name: true } }, _count: { select: { databases: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.node.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title={t("admin.databasesTitle")}
        description={t("admin.databasesDesc")}
      />
      <DatabaseHostManager
        nodes={nodes}
        hosts={hosts.map((host) => ({
          id: host.id,
          name: host.name,
          host: host.host,
          port: host.port,
          username: host.username,
          maxDatabases: host.maxDatabases,
          phpMyAdminUrl: host.phpMyAdminUrl,
          nodeId: host.nodeId,
          nodeName: host.node?.name ?? null,
          databaseCount: host._count.databases,
          status: databaseHostStatus(host),
          serverVersion: host.serverVersion,
          statusNote: host.statusNote,
          latencyMs: host.latencyMs,
          lastCheckedAt: host.lastCheckedAt?.toISOString() ?? null,
        }))}
      />
    </>
  );
}

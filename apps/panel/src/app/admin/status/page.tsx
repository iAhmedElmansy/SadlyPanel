import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { StatusManager } from "./status-manager";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.statusMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminStatusPage() {
  await requirePermission("status.manage");
  const t = await getT();

  const [categories, components, incidents] = await Promise.all([
    prisma.statusCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.statusComponent.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.incident.findMany({
      orderBy: [{ startedAt: "desc" }],
      take: 50,
      include: { updates: { orderBy: { createdAt: "desc" } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={t("admin.statusTitle")}
        description={t("admin.statusDesc")}
      />

      <StatusManager
        categories={categories.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder }))}
        components={components.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          categoryId: c.categoryId,
          sortOrder: c.sortOrder,
          monitorEnabled: c.monitorEnabled,
          monitorType: c.monitorType,
          monitorTarget: c.monitorTarget,
          intervalSeconds: c.intervalSeconds,
          visible: c.visible,
          lastStatus: c.lastStatus,
          lastCheckedAt: c.lastCheckedAt ? c.lastCheckedAt.toISOString() : null,
          lastLatencyMs: c.lastLatencyMs,
        }))}
        incidents={incidents.map((i) => ({
          id: i.id,
          title: i.title,
          impact: i.impact,
          status: i.status,
          startedAt: i.startedAt.toISOString(),
          resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
          updates: i.updates.map((u) => ({
            id: u.id,
            body: u.body,
            status: u.status,
            createdAt: u.createdAt.toISOString(),
          })),
        }))}
      />
    </>
  );
}

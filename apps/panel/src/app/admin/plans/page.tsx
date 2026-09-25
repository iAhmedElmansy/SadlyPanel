import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PlanManager } from "./plan-manager";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.plansMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  await requirePermission("plans.manage");
  const t = await getT();

  const plans = await prisma.plan.findMany({
    include: { _count: { select: { packages: true, servers: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader
        title={t("admin.plansTitle")}
        description={t("admin.plansDesc")}
      />

      <PlanManager
        plans={plans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          description: plan.description,
          isActive: plan.isActive,
          isPublic: plan.isPublic,
          priceCents: plan.priceCents,
          currency: plan.currency,
          billingCycle: plan.billingCycle,
          sortOrder: plan.sortOrder,
          memory: plan.memory,
          swap: plan.swap,
          disk: plan.disk,
          io: plan.io,
          cpu: plan.cpu,
          threads: plan.threads,
          oomKiller: plan.oomKiller,
          databaseLimit: plan.databaseLimit,
          allocationLimit: plan.allocationLimit,
          backupLimit: plan.backupLimit,
          packageCount: plan._count.packages,
          serverCount: plan._count.servers,
        }))}
      />

      <Card className="mt-6">
        <CardHeader title={t("admin.plansHowTitle")} />
        <CardBody className="space-y-2 text-xs text-ink-muted">
          <p>{t("admin.plansHowP1")}</p>
          <p className="text-ink-dim">{t("admin.plansHowP2")}</p>
        </CardBody>
      </Card>
    </>
  );
}

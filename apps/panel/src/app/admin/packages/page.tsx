import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PackageManager } from "./package-manager";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.packagesMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminPackagesPage() {
  await requirePermission("plans.manage");
  const t = await getT();

  const [packages, plans, eggs, nests] = await Promise.all([
    prisma.package.findMany({
      include: {
        plan: { select: { name: true } },
        requiredPlan: { select: { name: true } },
        egg: { select: { name: true } },
        plans: { select: { planId: true } },
        _count: { select: { servers: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.egg.findMany({
      include: { nest: { select: { name: true } } },
      orderBy: [{ nestId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.nest.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title={t("admin.packagesTitle")}
        description={t("admin.packagesDesc")}
      />

      <PackageManager
        packages={packages.map((pkg) => ({
          id: pkg.id,
          name: pkg.name,
          description: pkg.description,
          isPublic: pkg.isPublic,
          sortOrder: pkg.sortOrder,
          planId: pkg.planId,
          requiredPlanId: pkg.requiredPlanId,
          eggId: pkg.eggId,
          nestId: pkg.nestId,
          planName: pkg.plan?.name ?? null,
          requiredPlanName: pkg.requiredPlan?.name ?? null,
          availablePlanIds: pkg.plans.map((row) => row.planId),
          eggName: pkg.egg?.name ?? null,
          serverCount: pkg._count.servers,
        }))}
        plans={plans.map((plan) => ({ id: plan.id, name: plan.name, isActive: plan.isActive }))}
        eggs={eggs.map((egg) => ({ id: egg.id, name: egg.name, nestId: egg.nestId, nestName: egg.nest.name }))}
        nests={nests.map((nest) => ({ id: nest.id, name: nest.name }))}
      />

      <Card className="mt-6">
        <CardHeader title={t("admin.packagesHowTitle")} />
        <CardBody className="space-y-2 text-xs text-ink-muted">
          <p>{t("admin.packagesHowP1")}</p>
          <p className="text-ink-dim">{t("admin.packagesHowP2")}</p>
        </CardBody>
      </Card>
    </>
  );
}

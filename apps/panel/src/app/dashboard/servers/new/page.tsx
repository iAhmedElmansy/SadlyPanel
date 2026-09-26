import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getNodeCapacitySummary, freeResourcesFromSummary } from "@/lib/services/capacity";
import { getUserPlanQuota, planSatisfiesNode } from "@/lib/services/entitlements";
import { UserServerWizard, type UserWizardNode } from "./wizard";

export const metadata: Metadata = { title: "Create server" };
export const dynamic = "force-dynamic";

/**
 * Self-service server creation. Users only pick a service, a location and how
 * much of their plan to use — raw allocations, docker images and node internals
 * stay hidden. The plan grants a pooled RAM/disk/CPU allowance shared across
 * their servers; a plan is required, and without one we send them to Billing.
 */
export default async function NewServerPage() {
  const user = await requireUser();
  const t = await getT();
  const quota = await getUserPlanQuota(user.id);

  if (!quota) {
    return (
      <>
        <PageHeader title={t("dashboard.serversNewTitle")} description={t("dashboard.cswPageDesc")} />
        <div className="panel-card">
          <EmptyState
            icon={<Sparkles className="size-5" />}
            title={t("dashboard.cswNoPlanTitle")}
            description={t("dashboard.cswNoPlanDesc")}
            action={
              <Link href="/dashboard/billing" className="btn btn-primary">
                {t("dashboard.cswViewPlans")}
                <ArrowRight className="size-4" />
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const { plan } = quota;

  const [eggRows, nodeRows] = await Promise.all([
    prisma.egg.findMany({
      include: { nest: { select: { name: true } }, variables: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ nestId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.node.findMany({
      where: { public: true },
      include: { requiredPlan: { select: { name: true, sortOrder: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const planShape = { id: plan.id, sortOrder: plan.sortOrder };

  const nodes: UserWizardNode[] = await Promise.all(
    nodeRows.map(async (node) => {
      const summary = await getNodeCapacitySummary(node.id);
      const free = freeResourcesFromSummary(summary);
      return {
        id: node.id,
        name: node.name,
        percentMemory: summary.percentMemory,
        percentDisk: summary.percentDisk,
        percentCpu: summary.percentCpu,
        percentOverall: Math.max(summary.percentMemory, summary.percentDisk, summary.percentCpu),
        // Infinity isn't serializable across the RSC boundary — unlimited → null.
        freeMemory: free.memory,
        freeDisk: free.disk,
        freeCpu: free.cpu,
        freeAllocations: free.allocations,
        planLocked: !planSatisfiesNode(
          { requiredPlanId: node.requiredPlanId, requiredPlan: node.requiredPlan },
          planShape,
        ),
        requiredPlanName: node.requiredPlan?.name ?? null,
        maintenance: node.maintenanceMode,
      };
    }),
  );

  return (
    <>
      <PageHeader title={t("dashboard.serversNewTitle")} description={t("dashboard.cswPageDesc")} />
      <UserServerWizard
        plan={{
          name: plan.name,
          memory: plan.memory,
          disk: plan.disk,
          cpu: plan.cpu,
          // Infinity → null so the RSC payload stays serializable.
          remainingMemory: quota.unlimited.memory ? null : quota.remaining.memory,
          remainingDisk: quota.unlimited.disk ? null : quota.remaining.disk,
          remainingCpu: quota.unlimited.cpu ? null : quota.remaining.cpu,
          usedMemory: quota.used.memory,
          usedDisk: quota.used.disk,
          usedCpu: quota.used.cpu,
          allocationLimit: plan.allocationLimit,
          databaseLimit: plan.databaseLimit,
          backupLimit: plan.backupLimit,
          serverCount: quota.serverCount,
        }}
        nodes={nodes}
        eggs={eggRows.map((egg) => ({
          id: egg.id,
          name: egg.name,
          description: egg.description,
          kind: egg.kind,
          nestName: egg.nest.name,
          variables: egg.variables.map((variable) => ({
            id: variable.id,
            name: variable.name,
            description: variable.description,
            envVariable: variable.envVariable,
            defaultValue: variable.defaultValue,
            userEditable: variable.userEditable,
            userViewable: variable.userViewable,
          })),
        }))}
      />
    </>
  );
}

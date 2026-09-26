import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getNodeCapacitySummary, getNodeServerHeadroom } from "@/lib/services/capacity";
import { getUserPlan, planSatisfiesNode } from "@/lib/services/entitlements";
import { UserServerWizard, type UserWizardNode } from "./wizard";

export const metadata: Metadata = { title: "Create server" };
export const dynamic = "force-dynamic";

/**
 * Self-service server creation. Users only pick a service, a location and how
 * much of their plan to use — raw allocations, docker images and node internals
 * stay hidden. A plan is required; without one we send them to Billing.
 */
export default async function NewServerPage() {
  const user = await requireUser();
  const plan = await getUserPlan(user.id);

  if (!plan) {
    return (
      <>
        <PageHeader title="Create a server" description="Deploy a game, app or website in a couple of clicks." />
        <div className="panel-card">
          <EmptyState
            icon={<Sparkles className="size-5" />}
            title="Choose a plan to get started"
            description="Servers are deployed from your subscription. Pick a plan and you'll be able to create servers right away."
            action={
              <Link href="/dashboard/billing" className="btn btn-primary">
                View plans
                <ArrowRight className="size-4" />
              </Link>
            }
          />
        </div>
      </>
    );
  }

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
      const [summary, headroom] = await Promise.all([
        getNodeCapacitySummary(node.id),
        getNodeServerHeadroom(node.id, { memory: plan.memory, disk: plan.disk, cpu: plan.cpu, allocations: 1 }),
      ]);
      return {
        id: node.id,
        name: node.name,
        percentMemory: summary.percentMemory,
        percentDisk: summary.percentDisk,
        percentCpu: summary.percentCpu,
        // Infinity isn't serializable across the RSC boundary — map to null.
        headroom: Number.isFinite(headroom) ? headroom : null,
        freePorts: summary.freeAllocations,
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
      <PageHeader title="Create a server" description="Deploy a game, app or website in a couple of clicks." />
      <UserServerWizard
        plan={{
          name: plan.name,
          memory: plan.memory,
          disk: plan.disk,
          cpu: plan.cpu,
          allocationLimit: plan.allocationLimit,
          databaseLimit: plan.databaseLimit,
          backupLimit: plan.backupLimit,
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

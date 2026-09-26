import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { getNodeCapacity } from "@/lib/services/capacity";
import { getAvailablePackagesForUser } from "@/lib/services/entitlements";
import { CreateServerWizard, type WizardNode, type WizardPackage } from "./wizard";

export const metadata: Metadata = { title: "Create server" };
export const dynamic = "force-dynamic";

/**
 * Admin-only full server creation. Unlike the self-service dashboard wizard,
 * this exposes every node (including private/maintenance), every package, the
 * raw allocation picker, all resource limits, an owner selector and the
 * skip-install-script escape hatch. Gating is intentionally absent — an admin
 * with servers.manage can deploy anything for anyone.
 */
export default async function AdminNewServerPage({
  searchParams,
}: {
  searchParams: Promise<{ package?: string }>;
}) {
  const admin = await requirePermission("servers.manage");
  const t = await getT();
  const { package: packageParam } = await searchParams;

  const [nodeRows, eggRows, allocationRows, domainRows, users] = await Promise.all([
    prisma.node.findMany({ orderBy: { name: "asc" } }),
    prisma.egg.findMany({
      include: { nest: { select: { name: true } }, variables: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ nestId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.allocation.findMany({
      where: { serverId: null },
      orderBy: [{ nodeId: "asc" }, { port: "asc" }],
      take: 500,
    }),
    prisma.domain.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true } }),
  ]);

  // Admins are never locked, so every package is available; still resolve plan
  // limits so applying a package copies the right resource numbers.
  const entitlements = await getAvailablePackagesForUser(admin);
  const planIds = [...new Set(entitlements.map((e) => e.package.planId).filter((id): id is number => id !== null))];
  const planRows = await prisma.plan.findMany({ where: { id: { in: planIds } } });
  const planMap = new Map(planRows.map((plan) => [plan.id, plan]));

  const parsedPackageId = Number(packageParam);
  const initialPackageId =
    Number.isInteger(parsedPackageId) &&
    parsedPackageId > 0 &&
    entitlements.some((entry) => entry.package.id === parsedPackageId)
      ? parsedPackageId
      : 0;

  const nodes: WizardNode[] = await Promise.all(
    nodeRows.map(async (node) => {
      const capacity = await getNodeCapacity(node.id);
      return {
        id: node.id,
        name: node.name,
        fqdn: node.fqdn,
        maintenanceMode: node.maintenanceMode,
        free: {
          memory: Math.max(0, capacity.memory.overallocated - capacity.memory.used),
          disk: Math.max(0, capacity.disk.overallocated - capacity.disk.used),
          cpu: Math.max(0, capacity.cpu.overallocated - capacity.cpu.used),
        },
      };
    }),
  );

  return (
    <>
      <PageHeader
        title={t("dashboard.serversNewTitle")}
        description={t("dashboard.serversNewDescription")}
        actions={
          <Link href="/admin/servers" className="btn btn-ghost">
            <ArrowLeft className="size-4" />
            Back to servers
          </Link>
        }
      />
      <CreateServerWizard
        isAdmin
        initialPackageId={initialPackageId}
        users={users}
        nodes={nodes}
        eggs={eggRows.map((egg) => ({
          id: egg.id,
          name: egg.name,
          description: egg.description,
          kind: egg.kind,
          nestName: egg.nest.name,
          dockerImages: egg.dockerImages,
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
        allocations={allocationRows.map((allocation) => ({
          id: allocation.id,
          ip: allocation.ip,
          ipAlias: allocation.ipAlias,
          port: allocation.port,
          nodeId: allocation.nodeId,
        }))}
        domains={domainRows.map((domain) => ({ id: domain.id, name: domain.name }))}
        packages={entitlements.map<WizardPackage>(({ package: pkg, locked, requiredPlanName }) => {
          const plan = pkg.planId !== null ? planMap.get(pkg.planId) : undefined;
          return {
            id: pkg.id,
            name: pkg.name,
            description: pkg.description,
            planId: pkg.planId,
            eggId: pkg.eggId,
            locked,
            requiredPlanName: requiredPlanName ?? null,
            limits: plan
              ? {
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
                }
              : null,
          };
        })}
      />
    </>
  );
}

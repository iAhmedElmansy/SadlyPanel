import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { getNodeCapacity } from "@/lib/services/capacity";
import { getAvailablePackagesForUser } from "@/lib/services/entitlements";
import { CreateServerWizard, type WizardNode, type WizardPackage } from "./wizard";

export const metadata: Metadata = { title: "Create server" };
export const dynamic = "force-dynamic";

export default async function NewServerPage({
  searchParams,
}: {
  searchParams: Promise<{ package?: string }>;
}) {
  const user = await requireUser();
  const t = await getT();
  const isAdmin = user.role === "admin";
  const { package: packageParam } = await searchParams;

  const [nodeRows, eggRows, allocationRows, domainRows] = await Promise.all([
    prisma.node.findMany({
      where: isAdmin ? {} : { public: true, maintenanceMode: false },
      orderBy: { name: "asc" },
    }),
    prisma.egg.findMany({
      include: { nest: { select: { name: true } }, variables: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ nestId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.allocation.findMany({
      where: { serverId: null },
      orderBy: [{ nodeId: "asc" }, { port: "asc" }],
      take: 500,
    }),
    prisma.domain.findMany({ where: { isPublic: true }, orderBy: { name: "asc" } }),
  ]);

  // Entitlements annotate each package with lock state for this user. Clients
  // only see public packages (locked ones are shown disabled); admins see all.
  const entitlements = await getAvailablePackagesForUser(user);
  const visible = isAdmin ? entitlements : entitlements.filter((entry) => entry.package.isPublic);
  const planIds = [...new Set(visible.map((entry) => entry.package.planId).filter((id): id is number => id !== null))];
  const planRows = await prisma.plan.findMany({ where: { id: { in: planIds } } });
  const planMap = new Map(planRows.map((plan) => [plan.id, plan]));

  // Preselect a package from ?package=. It must be a visible, non-locked
  // entitlement; anything missing/invalid/locked falls back to 0 (no preselect).
  const parsedPackageId = Number(packageParam);
  const initialPackageId =
    Number.isInteger(parsedPackageId) &&
    parsedPackageId > 0 &&
    visible.some((entry) => entry.package.id === parsedPackageId && !entry.locked)
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
      />
      <CreateServerWizard
        isAdmin={isAdmin}
        initialPackageId={initialPackageId}
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
        packages={visible.map<WizardPackage>(({ package: pkg, locked, requiredPlanName }) => {
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

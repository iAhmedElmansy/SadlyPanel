import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getNodeCapacity } from "@/lib/services/capacity";
import { parseJsonSafe } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { getT } from "@/lib/i18n/server";
import { CreateWebsiteWizard, type HostingEgg, type HostingNode, type HostingPackage } from "./wizard";

export const metadata: Metadata = { title: "Create website" };
export const dynamic = "force-dynamic";

export default async function NewWebsitePage() {
  const t = await getT();
  const user = await requireUser();
  const isAdmin = user.role === "admin";

  const [nodeRows, eggRows, allocationRows, domainRows, packageRows] = await Promise.all([
    prisma.node.findMany({
      where: isAdmin ? {} : { public: true, maintenanceMode: false },
      orderBy: { name: "asc" },
    }),
    // Only webhost eggs — this keeps the hosting experience separate from games.
    prisma.egg.findMany({
      where: { kind: "webhost" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.allocation.findMany({
      where: { serverId: null },
      orderBy: [{ nodeId: "asc" }, { port: "asc" }],
      take: 500,
    }),
    prisma.domain.findMany({ where: { isPublic: true }, orderBy: { name: "asc" } }),
    prisma.package.findMany({
      where: isAdmin ? {} : { isPublic: true },
      include: { plan: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const nodes: HostingNode[] = await Promise.all(
    nodeRows.map(async (node) => {
      const capacity = await getNodeCapacity(node.id);
      return {
        id: node.id,
        name: node.name,
        maintenanceMode: node.maintenanceMode,
        free: {
          memory: Math.max(0, capacity.memory.overallocated - capacity.memory.used),
          disk: Math.max(0, capacity.disk.overallocated - capacity.disk.used),
          cpu: Math.max(0, capacity.cpu.overallocated - capacity.cpu.used),
        },
      };
    }),
  );

  const eggs: HostingEgg[] = eggRows.map((egg) => {
    const features = parseJsonSafe<string[]>(egg.features, []);
    const supportsPhp = features.includes("php");
    return {
      id: egg.id,
      name: egg.name,
      description: egg.description,
      runtime: supportsPhp ? "php" : "html",
      images: parseJsonSafe<Record<string, string>>(egg.dockerImages, {}),
    };
  });

  return (
    <>
      <PageHeader
        title={t("dashboard.hostingNewTitle")}
        description={t("dashboard.hostingNewDescription")}
        breadcrumb={
          <Link href="/dashboard/hosting" className="inline-flex items-center gap-1 hover:text-ink">
            <ChevronLeft className="size-3.5" />
            {t("dashboard.hostingTitle")}
          </Link>
        }
      />
      <CreateWebsiteWizard
        isAdmin={isAdmin}
        nodes={nodes}
        eggs={eggs}
        allocations={allocationRows.map((a) => ({ id: a.id, ip: a.ip, ipAlias: a.ipAlias, port: a.port, nodeId: a.nodeId }))}
        domains={domainRows.map((d) => ({ id: d.id, name: d.name }))}
        packages={packageRows.map<HostingPackage>((pkg) => ({
          id: pkg.id,
          name: pkg.name,
          description: pkg.description,
          planId: pkg.planId,
          limits: pkg.plan
            ? { memory: pkg.plan.memory, disk: pkg.plan.disk, cpu: pkg.plan.cpu }
            : null,
        }))}
      />
    </>
  );
}

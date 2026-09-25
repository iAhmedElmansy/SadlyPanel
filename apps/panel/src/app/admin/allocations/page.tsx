import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { AllocationManager } from "./allocation-manager";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.allocsMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminAllocationsPage() {
  await requireAdmin();
  const t = await getT();

  const [nodes, allocations] = await Promise.all([
    prisma.node.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, fqdn: true } }),
    prisma.allocation.findMany({
      include: { server: { select: { name: true, uuidShort: true } } },
      orderBy: [{ nodeId: "asc" }, { ip: "asc" }, { port: "asc" }],
      take: 3000,
    }),
  ]);

  return (
    <>
      <PageHeader
        title={t("admin.allocsTitle")}
        description={t("admin.allocsDesc")}
      />
      <AllocationManager
        nodes={nodes}
        allocations={allocations.map((allocation) => ({
          id: allocation.id,
          nodeId: allocation.nodeId,
          ip: allocation.ip,
          ipAlias: allocation.ipAlias,
          port: allocation.port,
          notes: allocation.notes,
          isPrimary: allocation.isPrimary,
          server: allocation.server,
        }))}
      />
    </>
  );
}

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { LocationManager } from "./location-manager";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.locationsMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminLocationsPage() {
  await requirePermission("nodes.view");
  const t = await getT();

  const locations = await prisma.location.findMany({
    include: { _count: { select: { nodes: true } } },
    orderBy: { shortCode: "asc" },
  });

  return (
    <>
      <PageHeader
        title={t("admin.locationsTitle")}
        description={t("admin.locationsDesc")}
      />

      <LocationManager
        locations={locations.map((location) => ({
          id: location.id,
          shortCode: location.shortCode,
          name: location.name,
          nodeCount: location._count.nodes,
          createdAt: location.createdAt.toISOString(),
        }))}
      />
    </>
  );
}

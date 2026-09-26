import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NodeForm } from "../../node-form";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.nodeSettingsMeta") };
}
export const dynamic = "force-dynamic";

export default async function NodeSettingsPage({ params }: { params: Promise<{ node: string }> }) {
  await requireAdmin();
  const t = await getT();
  const { node: nodeParam } = await params;
  const nodeId = Number(nodeParam);
  if (!Number.isInteger(nodeId)) notFound();

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) notFound();

  const [locations, plans] = await Promise.all([
    prisma.location.findMany({ orderBy: { shortCode: "asc" } }),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <Card>
      <CardHeader title={t("admin.nodeSettingsConfig")} description={t("admin.nodeSettingsConfigDesc")} />
      <CardBody>
        <NodeForm
          mode="edit"
          locations={locations.map((l) => ({ id: l.id, name: l.name, shortCode: l.shortCode }))}
          plans={plans}
          values={{
            id: node.id,
            name: node.name,
            description: node.description ?? "",
            locationId: node.locationId,
            requiredPlanId: node.requiredPlanId,
            fqdn: node.fqdn,
            scheme: node.scheme,
            behindProxy: node.behindProxy,
            public: node.public,
            maintenanceMode: node.maintenanceMode,
            memory: node.memory,
            memoryOverallocate: node.memoryOverallocate,
            disk: node.disk,
            diskOverallocate: node.diskOverallocate,
            cpu: node.cpu,
            cpuOverallocate: node.cpuOverallocate,
            uploadSize: node.uploadSize,
            daemonBase: node.daemonBase,
            daemonListenHost: (node as any).daemonListenHost ?? "",
            daemonPort: node.daemonPort,
            daemonSftpPort: node.daemonSftpPort,
            proxyEnabled: node.proxyEnabled,
            proxyHttpPort: node.proxyHttpPort,
            proxyHttpsPort: node.proxyHttpsPort,
          }}
        />
      </CardBody>
    </Card>
  );
}

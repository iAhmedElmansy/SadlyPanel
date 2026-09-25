import { getServerContext } from "@/lib/server-context";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NetworkPanel } from "./network-panel";

export const dynamic = "force-dynamic";

export default async function ServerNetworkPage({ params }: { params: Promise<{ server: string }> }) {
  const { server: identifier } = await params;
  const { server, access } = await getServerContext(identifier);
  const t = await getT();

  if (!can(access, "network.read")) {
    return (
      <Card>
        <CardHeader title={t("dashboard.serverNetNoAccessTitle")} />
        <CardBody className="text-sm text-ink-muted">{t("dashboard.serverNetNoAccessBody")}</CardBody>
      </Card>
    );
  }

  const domains = await prisma.domain.findMany({
    where: { isPublic: true, OR: [{ nodeId: server.nodeId }, { nodeId: null }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const primary = server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];

  return (
    <NetworkPanel
      serverUuid={server.uuidShort}
      serviceKind={server.serviceKind}
      canUpdate={can(access, "network.update")}
      nodeIp={primary ? `${primary.ip}:${primary.port}` : server.node.fqdn}
      domains={domains}
      allocations={server.allocations.map((allocation) => ({
        id: allocation.id,
        ip: allocation.ip,
        ipAlias: allocation.ipAlias,
        port: allocation.port,
        isPrimary: allocation.isPrimary,
        notes: allocation.notes,
      }))}
      bindings={server.bindings.map((binding) => ({
        id: binding.id,
        hostname: binding.hostname,
        kind: binding.kind,
        httpsMode: binding.httpsMode,
        forceHttps: binding.forceHttps,
        targetPort: binding.targetPort,
        isPrimary: binding.isPrimary,
        status: binding.status,
        statusNote: binding.statusNote,
      }))}
    />
  );
}

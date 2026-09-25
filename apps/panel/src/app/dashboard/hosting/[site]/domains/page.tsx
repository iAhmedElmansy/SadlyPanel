import { getWebsiteContext } from "@/lib/services/hosting";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NetworkPanel } from "@/app/dashboard/servers/[server]/network/network-panel";

export const dynamic = "force-dynamic";

export default async function WebsiteDomainsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: identifier } = await params;
  const { server, access } = await getWebsiteContext(identifier);
  const t = await getT();

  if (!can(access, "network.read")) {
    return (
      <Card>
        <CardHeader title={t("dashboard.hostingDomainsNoAccessTitle")} />
        <CardBody className="text-sm text-ink-muted">{t("dashboard.hostingDomainsNoAccessBody")}</CardBody>
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
      allocations={server.allocations.map((a) => ({
        id: a.id,
        ip: a.ip,
        ipAlias: a.ipAlias,
        port: a.port,
        isPrimary: a.isPrimary,
        notes: a.notes,
      }))}
      bindings={server.bindings.map((b) => ({
        id: b.id,
        hostname: b.hostname,
        kind: b.kind,
        httpsMode: b.httpsMode,
        forceHttps: b.forceHttps,
        targetPort: b.targetPort,
        isPrimary: b.isPrimary,
        status: b.status,
        statusNote: b.statusNote,
      }))}
    />
  );
}

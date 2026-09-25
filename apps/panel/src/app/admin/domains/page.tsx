import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { DomainManager } from "./domain-manager";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.domainsMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminDomainsPage() {
  await requireAdmin();
  const t = await getT();

  const [domains, nodes, servers, bindings] = await Promise.all([
    prisma.domain.findMany({
      include: {
        node: { select: { name: true } },
        subdomains: {
          include: { server: { select: { name: true } }, bindings: { select: { status: true } } },
          orderBy: { label: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.node.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.server.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, uuidShort: true } }),
    prisma.domainBinding.groupBy({ by: ["domainId"], _count: { _all: true } }),
  ]);

  const bindingCounts = new Map(bindings.map((row) => [row.domainId, row._count._all]));

  return (
    <>
      <PageHeader
        title={t("admin.domainsTitle")}
        description={t("admin.domainsDesc")}
      />
      <DomainManager
        nodes={nodes}
        servers={servers}
        domains={domains.map((domain) => ({
          id: domain.id,
          name: domain.name,
          nodeName: domain.node?.name ?? null,
          isPublic: domain.isPublic,
          wildcardDns: domain.wildcardDns,
          targetIp: domain.targetIp,
          dnsProvider: domain.dnsProvider,
          bindingCount: bindingCounts.get(domain.id) ?? 0,
          subdomains: domain.subdomains.map((subdomain) => ({
            id: subdomain.id,
            label: subdomain.label,
            recordType: subdomain.recordType,
            serverName: subdomain.server?.name ?? null,
            status: subdomain.bindings[0]?.status ?? (subdomain.serverId ? "pending" : "active"),
          })),
        }))}
      />
    </>
  );
}

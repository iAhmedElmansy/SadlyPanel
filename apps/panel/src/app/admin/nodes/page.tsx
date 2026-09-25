import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getNodeCapacity } from "@/lib/services/capacity";
import { healthOf, nodeHealthSummary, refreshNodeHealth } from "@/lib/services/heartbeat";
import { PageHeader, StatCard } from "@/components/layout/page-header";
import { NodeList, type NodeRow } from "./node-list";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.nodesMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminNodesPage() {
  await requirePermission("nodes.view");
  const t = await getT();

  // Reconcile heartbeatStatus with the clock so a node that stopped beating is
  // not reported as online for ever.
  await refreshNodeHealth().catch(() => undefined);

  const [nodeRows, locations, health] = await Promise.all([
    prisma.node.findMany({ include: { location: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { shortCode: "asc" } }),
    nodeHealthSummary(),
  ]);

  const latestBeats = await prisma.nodeHeartbeat.findMany({
    where: { nodeId: { in: nodeRows.map((node) => node.id) } },
    orderBy: { id: "desc" },
    distinct: ["nodeId"],
  });
  const beatByNode = new Map(latestBeats.map((beat) => [beat.nodeId, beat]));

  const nodes: NodeRow[] = await Promise.all(
    nodeRows.map(async (node) => {
      const capacity = await getNodeCapacity(node.id);
      const beat = beatByNode.get(node.id);
      return {
        id: node.id,
        name: node.name,
        fqdn: node.fqdn,
        scheme: node.scheme,
        locationName: node.location?.name ?? null,
        public: node.public,
        maintenanceMode: node.maintenanceMode,
        serverCount: capacity.servers,
        allocationCount: capacity.allocations.total,
        freeAllocations: capacity.allocations.free,
        capacity: { memory: capacity.memory, disk: capacity.disk, cpu: capacity.cpu },
        health: healthOf(node.lastHeartbeatAt),
        lastHeartbeatAt: node.lastHeartbeatAt?.toISOString() ?? null,
        daemonVersion: node.daemonVersion,
        live: beat
          ? {
              cpuPercent: beat.cpuPercent,
              memoryUsed: beat.memoryUsed,
              memoryTotal: beat.memoryTotal,
              diskUsed: beat.diskUsed,
              diskTotal: beat.diskTotal,
              runningServers: beat.runningServers,
              latencyMs: beat.latencyMs,
            }
          : null,
      };
    }),
  );

  return (
    <>
      <PageHeader
        title={t("admin.nodesTitle")}
        description={t("admin.nodesDesc")}
      />

      {nodes.length > 0 ? (
        <div className="mb-6 grid animate-in gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("admin.nodesStatTotal")} value={health.total} />
          <StatCard label={t("admin.nodesStatOnline")} value={health.online} tone="ok" />
          <StatCard label={t("admin.nodesStatDegraded")} value={health.degraded} tone="warn" />
          <StatCard
            label={t("admin.nodesStatOfflineUnknown")}
            value={health.offline + health.unknown}
            tone={health.offline > 0 ? "bad" : "info"}
            hint={health.unknown > 0 ? t("admin.nodesNeverReported", { count: health.unknown }) : undefined}
          />
        </div>
      ) : null}

      <NodeList nodes={nodes} locations={locations.map((l) => ({ id: l.id, name: l.name, shortCode: l.shortCode }))} />
    </>
  );
}

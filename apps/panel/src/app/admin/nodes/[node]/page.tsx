import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getNodeCapacity } from "@/lib/services/capacity";
import { healthOf, heartbeatSeries } from "@/lib/services/heartbeat";
import { StatCard } from "@/components/layout/page-header";
import { NodeTelemetry } from "./node-telemetry";
import { LiveRefresh } from "./live-refresh";
import { formatMib } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.nodeOvMeta") };
}
export const dynamic = "force-dynamic";

export default async function NodeOverviewPage({ params }: { params: Promise<{ node: string }> }) {
  await requirePermission("nodes.view");
  const t = await getT();
  const { node: nodeParam } = await params;
  const nodeId = Number(nodeParam);
  if (!Number.isInteger(nodeId)) notFound();

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) notFound();

  const [capacity, series, latest] = await Promise.all([
    getNodeCapacity(node.id),
    heartbeatSeries(node.id, 60),
    prisma.nodeHeartbeat.findFirst({ where: { nodeId: node.id }, orderBy: { id: "desc" } }),
  ]);

  const health = healthOf(node.lastHeartbeatAt);

  return (
    <>
      <LiveRefresh intervalMs={15000} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("admin.nodeOvServers")} value={capacity.servers} />
        <StatCard
          label={t("admin.nodeOvMemoryUsed")}
          value={formatMib(capacity.memory.used)}
          hint={t("admin.nodeOvOf", { value: formatMib(capacity.memory.overallocated) })}
          tone="info"
        />
        <StatCard
          label={t("admin.nodeOvDiskUsed")}
          value={formatMib(capacity.disk.used)}
          hint={t("admin.nodeOvOf", { value: formatMib(capacity.disk.overallocated) })}
          tone="warn"
        />
        <StatCard
          label={t("admin.nodeOvPorts")}
          value={`${capacity.allocations.assigned}/${capacity.allocations.total}`}
          hint={t("admin.nodeOvFree", { count: capacity.allocations.free })}
          tone="ok"
        />
      </div>

      <NodeTelemetry
        nodeId={node.id}
        health={health}
        lastHeartbeatAt={node.lastHeartbeatAt?.toISOString() ?? null}
        daemonVersion={node.daemonVersion}
        system={{
          os: node.systemOs,
          arch: node.systemArch,
          kernel: node.systemKernel,
          cpuModel: node.systemCpuModel,
          cpuCores: node.systemCpuCores,
          memoryTotal: node.systemMemoryTotal,
          diskTotal: node.systemDiskTotal,
          dockerVersion: node.dockerVersion,
        }}
        latest={
          latest
            ? {
                memoryUsed: latest.memoryUsed,
                memoryTotal: latest.memoryTotal,
                diskUsed: latest.diskUsed,
                diskTotal: latest.diskTotal,
                cpuPercent: latest.cpuPercent,
                loadAverage: latest.loadAverage,
                latencyMs: latest.latencyMs,
                runningServers: latest.runningServers,
                totalServers: latest.totalServers,
                uptimeSeconds: latest.uptimeSeconds,
              }
            : null
        }
        series={series}
      />
    </>
  );
}

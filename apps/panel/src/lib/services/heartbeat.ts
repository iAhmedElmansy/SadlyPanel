import type { Node } from "@prisma/client";
import { prisma } from "../db";

/**
 * Node liveness tracking.
 *
 * The daemon POSTs to /api/remote/nodes/heartbeat every `HEARTBEAT_INTERVAL_MS`.
 * Each beat updates the node row (so lists stay cheap to render) and appends a
 * sample to `node_heartbeats`, which is trimmed to `SAMPLE_RETENTION` rows so
 * SQLite does not grow without bound.
 */

/** Daemons are expected to beat every 15 seconds. */
export const HEARTBEAT_INTERVAL_MS = 15_000;
/** No beat for this long -> the node is considered offline. */
export const HEARTBEAT_OFFLINE_MS = 60_000;
/** A beat older than this (but still within the offline window) is degraded. */
export const HEARTBEAT_DEGRADED_MS = 35_000;
/** Rolling window kept per node (240 * 15s = 1 hour). */
export const SAMPLE_RETENTION = 240;

export type NodeHealth = "unknown" | "online" | "degraded" | "offline";

export interface HeartbeatPayload {
  daemonVersion?: string;
  system?: {
    os?: string;
    arch?: string;
    kernel?: string;
    cpuModel?: string;
    cpuCores?: number;
    memoryTotal?: number;
    diskTotal?: number;
    dockerVersion?: string;
  };
  usage?: {
    memoryUsed?: number;
    memoryTotal?: number;
    diskUsed?: number;
    diskTotal?: number;
    cpuPercent?: number;
    loadAverage?: number;
    runningServers?: number;
    totalServers?: number;
    uptimeSeconds?: number;
  };
  /** Round-trip latency of the daemon's previous beat, in milliseconds. */
  latencyMs?: number;
}

function int(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function float(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed * 100) / 100);
}

function text(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Derives the health of a node from the age of its last heartbeat. */
export function healthOf(lastHeartbeatAt: Date | null | undefined, now = Date.now()): NodeHealth {
  if (!lastHeartbeatAt) return "unknown";
  const age = now - lastHeartbeatAt.getTime();
  if (age <= HEARTBEAT_DEGRADED_MS) return "online";
  if (age <= HEARTBEAT_OFFLINE_MS) return "degraded";
  return "offline";
}

export interface RecordedHeartbeat {
  status: NodeHealth;
  intervalMs: number;
  /** Server uuids the panel believes live on this node, for reconciliation. */
  servers: { uuid: string; suspended: boolean }[];
}

/** Persists one heartbeat and returns what the daemon should do next. */
export async function recordHeartbeat(node: Node, payload: HeartbeatPayload): Promise<RecordedHeartbeat> {
  const usage = payload.usage ?? {};
  const system = payload.system ?? {};
  const now = new Date();

  const sample = {
    memoryUsed: int(usage.memoryUsed),
    memoryTotal: int(usage.memoryTotal),
    diskUsed: int(usage.diskUsed),
    diskTotal: int(usage.diskTotal),
    cpuPercent: float(usage.cpuPercent),
    loadAverage: float(usage.loadAverage),
    latencyMs: int(payload.latencyMs),
    runningServers: int(usage.runningServers),
    totalServers: int(usage.totalServers),
    uptimeSeconds: int(usage.uptimeSeconds),
  };

  await prisma.$transaction([
    prisma.node.update({
      where: { id: node.id },
      data: {
        lastHeartbeatAt: now,
        heartbeatStatus: "online",
        heartbeatFailures: 0,
        daemonVersion: text(payload.daemonVersion, 40) ?? node.daemonVersion,
        systemOs: text(system.os) ?? node.systemOs,
        systemArch: text(system.arch, 40) ?? node.systemArch,
        systemKernel: text(system.kernel) ?? node.systemKernel,
        systemCpuModel: text(system.cpuModel) ?? node.systemCpuModel,
        systemCpuCores: system.cpuCores === undefined ? node.systemCpuCores : int(system.cpuCores),
        systemMemoryTotal: system.memoryTotal === undefined ? node.systemMemoryTotal : int(system.memoryTotal),
        systemDiskTotal: system.diskTotal === undefined ? node.systemDiskTotal : int(system.diskTotal),
        dockerVersion: text(system.dockerVersion, 60) ?? node.dockerVersion,
      },
    }),
    prisma.nodeHeartbeat.create({ data: { nodeId: node.id, ...sample } }),
  ]);

  await trimHeartbeats(node.id);

  const servers = await prisma.server.findMany({
    where: { nodeId: node.id },
    select: { uuid: true, suspended: true },
    orderBy: { id: "asc" },
  });

  return { status: "online", intervalMs: HEARTBEAT_INTERVAL_MS, servers };
}

/** Keeps at most SAMPLE_RETENTION rows per node. */
export async function trimHeartbeats(nodeId: number): Promise<number> {
  const total = await prisma.nodeHeartbeat.count({ where: { nodeId } });
  if (total <= SAMPLE_RETENTION) return 0;

  const stale = await prisma.nodeHeartbeat.findMany({
    where: { nodeId },
    orderBy: { id: "desc" },
    skip: SAMPLE_RETENTION,
    select: { id: true },
  });
  if (stale.length === 0) return 0;

  const { count } = await prisma.nodeHeartbeat.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  return count;
}

/**
 * Reconciles `heartbeatStatus` for every node with the wall clock. Called by the
 * admin pages so a node that stopped beating is not shown as online forever.
 */
export async function refreshNodeHealth(): Promise<void> {
  const nodes = await prisma.node.findMany({
    select: { id: true, lastHeartbeatAt: true, heartbeatStatus: true, heartbeatFailures: true },
  });
  const now = Date.now();

  await Promise.all(
    nodes.map((node) => {
      const status = healthOf(node.lastHeartbeatAt, now);
      if (status === node.heartbeatStatus) return Promise.resolve();
      return prisma.node
        .update({
          where: { id: node.id },
          data: {
            heartbeatStatus: status,
            heartbeatFailures: status === "offline" ? node.heartbeatFailures + 1 : node.heartbeatFailures,
          },
        })
        .then(() => undefined)
        .catch(() => undefined);
    }),
  );
}

export interface HeartbeatSeries {
  at: string;
  memoryPercent: number;
  diskPercent: number;
  cpuPercent: number;
  latencyMs: number;
  runningServers: number;
}

/** Chart-ready samples for one node, oldest first. */
export async function heartbeatSeries(nodeId: number, take = 60): Promise<HeartbeatSeries[]> {
  const rows = await prisma.nodeHeartbeat.findMany({
    where: { nodeId },
    orderBy: { id: "desc" },
    take: Math.min(SAMPLE_RETENTION, Math.max(1, take)),
  });

  return rows.reverse().map((row) => ({
    at: row.createdAt.toISOString(),
    memoryPercent: row.memoryTotal > 0 ? Math.round((row.memoryUsed / row.memoryTotal) * 100) : 0,
    diskPercent: row.diskTotal > 0 ? Math.round((row.diskUsed / row.diskTotal) * 100) : 0,
    cpuPercent: Math.round(row.cpuPercent),
    latencyMs: row.latencyMs,
    runningServers: row.runningServers,
  }));
}

export interface NodeHealthSummary {
  total: number;
  online: number;
  degraded: number;
  offline: number;
  unknown: number;
}

export async function nodeHealthSummary(): Promise<NodeHealthSummary> {
  const nodes = await prisma.node.findMany({ select: { lastHeartbeatAt: true } });
  const now = Date.now();
  const summary: NodeHealthSummary = { total: nodes.length, online: 0, degraded: 0, offline: 0, unknown: 0 };
  for (const node of nodes) summary[healthOf(node.lastHeartbeatAt, now)] += 1;
  return summary;
}

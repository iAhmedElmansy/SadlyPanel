import { prisma } from "../db";

export interface NodeCapacity {
  memory: { used: number; total: number; overallocated: number };
  disk: { used: number; total: number; overallocated: number };
  cpu: { used: number; total: number; overallocated: number };
  servers: number;
  allocations: { total: number; assigned: number; free: number };
}

function withOverallocation(total: number, overallocate: number): number {
  if (overallocate <= 0) return total;
  return Math.floor(total * (1 + overallocate / 100));
}

export async function getNodeCapacity(nodeId: number): Promise<NodeCapacity> {
  const node = await prisma.node.findUniqueOrThrow({ where: { id: nodeId } });
  const [aggregate, servers, allocationTotal, allocationAssigned] = await Promise.all([
    prisma.server.aggregate({
      where: { nodeId },
      _sum: { memory: true, disk: true, cpu: true },
    }),
    prisma.server.count({ where: { nodeId } }),
    prisma.allocation.count({ where: { nodeId } }),
    prisma.allocation.count({ where: { nodeId, serverId: { not: null } } }),
  ]);

  return {
    memory: {
      used: aggregate._sum.memory ?? 0,
      total: node.memory,
      overallocated: withOverallocation(node.memory, node.memoryOverallocate),
    },
    disk: {
      used: aggregate._sum.disk ?? 0,
      total: node.disk,
      overallocated: withOverallocation(node.disk, node.diskOverallocate),
    },
    cpu: {
      used: aggregate._sum.cpu ?? 0,
      total: node.cpu,
      overallocated: withOverallocation(node.cpu, node.cpuOverallocate),
    },
    servers,
    allocations: {
      total: allocationTotal,
      assigned: allocationAssigned,
      free: allocationTotal - allocationAssigned,
    },
  };
}

export interface CapacityRequest {
  memory: number;
  disk: number;
  cpu: number;
  /** When editing an existing server, exclude its current usage. */
  excludeServerId?: number;
}

/** Throws when the node cannot fit the requested resources. */
export async function assertNodeHasCapacity(nodeId: number, req: CapacityRequest): Promise<void> {
  const node = await prisma.node.findUniqueOrThrow({ where: { id: nodeId } });
  if (node.maintenanceMode) throw new Error(`Node "${node.name}" is in maintenance mode.`);

  const aggregate = await prisma.server.aggregate({
    where: { nodeId, ...(req.excludeServerId ? { id: { not: req.excludeServerId } } : {}) },
    _sum: { memory: true, disk: true, cpu: true },
  });

  const usedMemory = aggregate._sum.memory ?? 0;
  const usedDisk = aggregate._sum.disk ?? 0;
  const usedCpu = aggregate._sum.cpu ?? 0;

  const limitMemory = withOverallocation(node.memory, node.memoryOverallocate);
  const limitDisk = withOverallocation(node.disk, node.diskOverallocate);
  const limitCpu = withOverallocation(node.cpu, node.cpuOverallocate);

  if (node.memoryOverallocate !== -1 && req.memory > 0 && usedMemory + req.memory > limitMemory) {
    throw new Error(
      `Node "${node.name}" has only ${limitMemory - usedMemory} MiB of memory left (requested ${req.memory} MiB).`,
    );
  }
  if (node.diskOverallocate !== -1 && req.disk > 0 && usedDisk + req.disk > limitDisk) {
    throw new Error(`Node "${node.name}" has only ${limitDisk - usedDisk} MiB of disk left (requested ${req.disk} MiB).`);
  }
  if (node.cpuOverallocate !== -1 && req.cpu > 0 && usedCpu + req.cpu > limitCpu) {
    throw new Error(`Node "${node.name}" has only ${limitCpu - usedCpu}% CPU left (requested ${req.cpu}%).`);
  }
}

/**
 * A node's remaining headroom, expressed as percentages used per dimension plus
 * the absolute free amounts. `*Unlimited` is true when the operator set the
 * matching overallocation to -1 (treat as unbounded). `free*` is
 * Number.POSITIVE_INFINITY for unlimited dimensions — callers rendering to the
 * client should map that to null.
 */
export interface NodeCapacitySummary {
  percentMemory: number;
  percentDisk: number;
  percentCpu: number;
  freeMemory: number;
  freeDisk: number;
  freeCpu: number;
  freeAllocations: number;
  memoryUnlimited: boolean;
  diskUnlimited: boolean;
  cpuUnlimited: boolean;
}

export async function getNodeCapacitySummary(nodeId: number): Promise<NodeCapacitySummary> {
  const [cap, node] = await Promise.all([
    getNodeCapacity(nodeId),
    prisma.node.findUniqueOrThrow({
      where: { id: nodeId },
      select: { memoryOverallocate: true, diskOverallocate: true, cpuOverallocate: true },
    }),
  ]);

  const dim = (used: number, limit: number, over: number) => {
    const unlimited = over === -1;
    const free = unlimited ? Number.POSITIVE_INFINITY : Math.max(0, limit - used);
    const percent = unlimited || limit <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
    return { free, percent, unlimited };
  };

  const m = dim(cap.memory.used, cap.memory.overallocated, node.memoryOverallocate);
  const d = dim(cap.disk.used, cap.disk.overallocated, node.diskOverallocate);
  const c = dim(cap.cpu.used, cap.cpu.overallocated, node.cpuOverallocate);

  return {
    percentMemory: m.percent,
    percentDisk: d.percent,
    percentCpu: c.percent,
    freeMemory: m.free,
    freeDisk: d.free,
    freeCpu: c.free,
    freeAllocations: cap.allocations.free,
    memoryUnlimited: m.unlimited,
    diskUnlimited: d.unlimited,
    cpuUnlimited: c.unlimited,
  };
}

/**
 * How many MORE servers of the given plan shape fit on a node, limited by the
 * tightest of memory / disk / cpu / free port allocations. Unlimited dimensions
 * (overallocate -1) and non-positive plan limits are skipped. Free allocations
 * always bound the result, since every server needs at least one port. Never
 * negative.
 */
export async function getNodeServerHeadroom(
  nodeId: number,
  planLimits: { memory: number; disk: number; cpu: number; allocations?: number },
): Promise<number> {
  const s = await getNodeCapacitySummary(nodeId);
  const candidates: number[] = [];

  if (planLimits.memory > 0 && !s.memoryUnlimited) candidates.push(Math.floor(s.freeMemory / planLimits.memory));
  if (planLimits.disk > 0 && !s.diskUnlimited) candidates.push(Math.floor(s.freeDisk / planLimits.disk));
  if (planLimits.cpu > 0 && !s.cpuUnlimited) candidates.push(Math.floor(s.freeCpu / planLimits.cpu));

  const portsPerServer = planLimits.allocations && planLimits.allocations > 0 ? planLimits.allocations : 1;
  candidates.push(Math.floor(s.freeAllocations / portsPerServer));

  if (candidates.length === 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(...candidates));
}

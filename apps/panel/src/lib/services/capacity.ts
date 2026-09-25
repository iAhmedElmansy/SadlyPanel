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

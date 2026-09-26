/**
 * Pure capacity math shared by the server-side capacity service and the
 * client-side self-service wizard (which recomputes headroom live as the
 * customer changes the requested server size). This module intentionally has NO
 * prisma / server-only imports so it is safe to bundle into a client component.
 */

/** A node's free resource amounts. `null` marks an unlimited (uncapped) dimension. */
export interface FreeResources {
  memory: number | null;
  disk: number | null;
  cpu: number | null;
  allocations: number;
}

/** The size of a single server being placed. */
export interface RequestedSize {
  memory: number;
  disk: number;
  cpu: number;
  allocations: number;
}

/**
 * How many more servers of `size` fit into `free`, bounded by the tightest of
 * memory / disk / cpu / allocations. Unlimited dimensions (null) and
 * non-positive requested amounts are skipped. Every server needs at least one
 * port, so free allocations always bound the result. Returns `null` when
 * nothing bounds the result (every capped dimension is unlimited and ports are
 * effectively unbounded) so callers can render "many". Never negative.
 */
export function serversThatFit(free: FreeResources, size: RequestedSize): number | null {
  const candidates: number[] = [];

  if (free.memory !== null && size.memory > 0) candidates.push(Math.floor(free.memory / size.memory));
  if (free.disk !== null && size.disk > 0) candidates.push(Math.floor(free.disk / size.disk));
  if (free.cpu !== null && size.cpu > 0) candidates.push(Math.floor(free.cpu / size.cpu));

  const portsPerServer = size.allocations > 0 ? size.allocations : 1;
  candidates.push(Math.floor(free.allocations / portsPerServer));

  if (candidates.length === 0) return null;
  return Math.max(0, Math.min(...candidates));
}

/**
 * True when a node has no remaining capacity at all — no free ports, or any
 * capped dimension fully consumed. Size-independent: a "full" node can't host
 * even the smallest server, so the wizard greys it out and locks it.
 */
export function nodeIsFull(free: FreeResources): boolean {
  if (free.allocations <= 0) return true;
  if (free.memory !== null && free.memory <= 0) return true;
  if (free.disk !== null && free.disk <= 0) return true;
  if (free.cpu !== null && free.cpu <= 0) return true;
  return false;
}

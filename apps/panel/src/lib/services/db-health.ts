import type { DatabaseHost } from "@prisma/client";
import { prisma } from "../db";
import { testDatabaseHost } from "../databases";

/**
 * Health probes for configured MySQL/MariaDB hosts.
 *
 * `testDatabaseHost` opens a real connection, so probes are only run on demand
 * (admin pages, the "test" button) and the result is cached on the row. The
 * cache is what the UI renders, so a page load never blocks on a dead host.
 */

/** Results older than this are considered stale by the admin UI. */
export const DB_HEALTH_TTL_MS = 5 * 60 * 1000;

export interface DbHealthResult {
  reachable: boolean;
  version: string | null;
  note: string | null;
  latencyMs: number;
}

/** Probes one host and caches the outcome on the row. */
export async function probeDatabaseHost(host: DatabaseHost): Promise<DbHealthResult> {
  const startedAt = Date.now();
  const outcome = await testDatabaseHost(host);
  const latencyMs = Date.now() - startedAt;

  const result: DbHealthResult = {
    reachable: outcome.ok,
    version: outcome.version ?? null,
    note: outcome.ok ? null : (outcome.error ?? "Connection failed.").slice(0, 300),
    latencyMs,
  };

  await prisma.databaseHost
    .update({
      where: { id: host.id },
      data: {
        lastCheckedAt: new Date(),
        reachable: result.reachable,
        serverVersion: result.version,
        statusNote: result.note,
        latencyMs,
      },
    })
    .catch(() => undefined);

  return result;
}

/**
 * Probes every host whose cached result is missing or older than the TTL.
 * Runs the probes concurrently and never throws.
 */
export async function refreshDatabaseHostHealth(options: { force?: boolean } = {}): Promise<number> {
  const hosts = await prisma.databaseHost.findMany();
  const cutoff = Date.now() - DB_HEALTH_TTL_MS;

  const stale = hosts.filter(
    (host) => options.force || !host.lastCheckedAt || host.lastCheckedAt.getTime() < cutoff,
  );
  if (stale.length === 0) return 0;

  await Promise.all(stale.map((host) => probeDatabaseHost(host).catch(() => undefined)));
  return stale.length;
}

export type DbHealthStatus = "unknown" | "reachable" | "unreachable" | "stale";

/** UI-facing status derived from the cached probe. */
export function databaseHostStatus(host: {
  reachable: boolean | null;
  lastCheckedAt: Date | null;
}, now = Date.now()): DbHealthStatus {
  if (host.reachable === null || !host.lastCheckedAt) return "unknown";
  if (now - host.lastCheckedAt.getTime() > DB_HEALTH_TTL_MS * 3) return "stale";
  return host.reachable ? "reachable" : "unreachable";
}

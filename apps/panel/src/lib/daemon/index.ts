import type { Node } from "@prisma/client";
import { prisma } from "../db";
import { DaemonClient, DaemonError, nodeTarget } from "./client";
import { buildServerSpec } from "./spec";

export { DaemonClient, DaemonError };

export async function daemonForNode(nodeId: number): Promise<DaemonClient> {
  const node = await prisma.node.findUniqueOrThrow({ where: { id: nodeId } });
  return new DaemonClient(nodeTarget(node));
}

export function daemonFor(node: Node): DaemonClient {
  return new DaemonClient(nodeTarget(node));
}

export interface ServerWithNode {
  id: number;
  uuid: string;
  nodeId: number;
}

export async function daemonForServer(serverId: number): Promise<{ client: DaemonClient; uuid: string }> {
  const server = await prisma.server.findUniqueOrThrow({
    where: { id: serverId },
    select: { uuid: true, node: true },
  });
  return { client: new DaemonClient(nodeTarget(server.node)), uuid: server.uuid };
}

/**
 * Pushes the current database state of a server to its node. Safe to call after
 * any mutation; failures are surfaced but never corrupt panel state.
 */
export async function syncServerToNode(serverId: number, opts: { create?: boolean; start?: boolean } = {}) {
  const spec = await buildServerSpec(serverId);
  const { client } = await daemonForServer(serverId);
  if (opts.create) return client.createServer(spec, opts.start ?? false);
  return client.syncServer(spec);
}

/** Rebuilds the reverse-proxy vhosts for a server based on its domain bindings. */
export async function syncServerProxy(serverId: number) {
  const server = await prisma.server.findUniqueOrThrow({
    where: { id: serverId },
    include: { bindings: true, allocations: true, node: true },
  });
  const client = daemonFor(server.node);

  if (server.bindings.length === 0) {
    await client.removeProxy(server.uuid).catch(() => undefined);
    return { applied: false } as const;
  }

  const primary = server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];
  return client.syncProxy({
    serverUuid: server.uuid,
    hostnames: server.bindings.map((b) => ({
      hostname: b.hostname,
      kind: b.kind,
      httpsMode: b.httpsMode,
      forceHttps: b.forceHttps,
      targetPort: b.targetPort ?? primary?.port ?? null,
    })),
    upstream: primary ? { ip: primary.ip, port: primary.port } : null,
    web:
      server.serviceKind === "webhost"
        ? {
            runtime: server.webRuntime ?? "html",
            phpVersion: server.phpVersion,
            documentRoot: server.documentRoot,
          }
        : undefined,
  });
}

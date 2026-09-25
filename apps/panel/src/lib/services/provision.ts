import { prisma } from "../db";
import { shortUuid, uuid as newUuid } from "../crypto";
import { assertNodeHasCapacity } from "./capacity";
import { buildServerSpec } from "../daemon/spec";
import { daemonFor } from "../daemon";
import { parseJsonSafe } from "../utils";
import type { ServerCreateInput } from "../validation";
import { logActivity } from "../activity";

export class ProvisionError extends Error {}

export interface ProvisionResult {
  serverId: number;
  uuid: string;
  uuidShort: string;
  hostname: string | null;
  daemonQueued: boolean;
  daemonError?: string;
}

interface ProvisionContext extends ServerCreateInput {
  actingUserId: number;
  ownerIdResolved: number;
  ip?: string | null;
}

/**
 * Creates a server end-to-end:
 *  1. validates node capacity + allocation availability
 *  2. reserves the allocations (ports)
 *  3. materialises egg variables into server variables
 *  4. wires the hostname (subdomain or custom domain) via DomainBinding
 *  5. hands the finished spec to the node daemon
 *
 * All database work happens in one transaction; the daemon call is performed
 * after commit and its failure is reported without losing the panel record.
 */
export async function provisionServer(input: ProvisionContext): Promise<ProvisionResult> {
  const egg = await prisma.egg.findUnique({ where: { id: input.eggId }, include: { variables: true, nest: true } });
  if (!egg) throw new ProvisionError("The selected service (egg) no longer exists.");

  // Resolve optional catalogue references. A package resolves its plan when one
  // is not supplied explicitly. Invalid ids are dropped rather than fatal — the
  // submitted limits are the source of truth for the actual server build.
  let packageId: number | null = null;
  if (input.packageId) {
    const pkg = await prisma.package.findUnique({ where: { id: input.packageId }, select: { id: true, planId: true } });
    if (pkg) {
      packageId = pkg.id;
      if (!input.planId && pkg.planId) input.planId = pkg.planId;
    }
  }
  let planId: number | null = null;
  if (input.planId) {
    const plan = await prisma.plan.findUnique({ where: { id: input.planId }, select: { id: true } });
    if (plan) planId = plan.id;
  }

  const images = parseJsonSafe<Record<string, string>>(egg.dockerImages, {});
  const imageValues = Object.values(images);
  if (imageValues.length > 0 && !imageValues.includes(input.dockerImage)) {
    throw new ProvisionError("The selected docker image is not allowed for this service.");
  }

  await assertNodeHasCapacity(input.nodeId, { memory: input.memory, disk: input.disk, cpu: input.cpu });

  const allocationIds = [input.allocationId, ...input.additionalAllocationIds.filter((id) => id !== input.allocationId)];
  const allocations = await prisma.allocation.findMany({
    where: { id: { in: allocationIds }, nodeId: input.nodeId },
  });
  if (allocations.length !== allocationIds.length) {
    throw new ProvisionError("One or more selected ports do not belong to this node.");
  }
  const taken = allocations.find((a) => a.serverId !== null);
  if (taken) throw new ProvisionError(`Port ${taken.ip}:${taken.port} is already assigned to another server.`);

  const primaryAllocation = allocations.find((a) => a.id === input.allocationId)!;

  // Resolve the hostname before opening the transaction so conflicts fail early.
  let hostname: string | null = null;
  let domainId: number | null = null;
  let subdomainLabel: string | null = null;

  if (input.hostnameMode === "subdomain") {
    const domain = await prisma.domain.findUnique({ where: { id: input.domainId! } });
    if (!domain) throw new ProvisionError("The selected domain no longer exists.");
    subdomainLabel = input.subdomainLabel!;
    hostname = `${subdomainLabel}.${domain.name}`;
    domainId = domain.id;
    const clash = await prisma.subdomain.findUnique({
      where: { domainId_label: { domainId: domain.id, label: subdomainLabel } },
    });
    if (clash) throw new ProvisionError(`${hostname} is already taken.`);
  } else if (input.hostnameMode === "custom") {
    hostname = input.customHostname!;
    const clash = await prisma.domainBinding.findUnique({ where: { hostname } });
    if (clash) throw new ProvisionError(`${hostname} is already bound to another server.`);
  }

  const serverUuid = newUuid();
  const serverShort = shortUuid(serverUuid);
  const bindingKind = egg.kind === "webhost" ? "http" : egg.kind === "game" ? "minecraft" : "tcp";

  const created = await prisma.$transaction(async (tx) => {
    const server = await tx.server.create({
      data: {
        uuid: serverUuid,
        uuidShort: serverShort,
        name: input.name,
        description: input.description ?? null,
        ownerId: input.ownerIdResolved,
        nodeId: input.nodeId,
        eggId: egg.id,
        planId,
        packageId,
        memory: input.memory,
        swap: input.swap,
        disk: input.disk,
        io: input.io,
        cpu: input.cpu,
        threads: input.threads || null,
        oomKiller: input.oomKiller,
        databaseLimit: input.databaseLimit,
        allocationLimit: input.allocationLimit,
        backupLimit: input.backupLimit,
        image: input.dockerImage,
        startup: egg.startup,
        serviceKind: egg.kind,
        webRuntime: egg.kind === "webhost" ? (input.webRuntime ?? "html") : null,
        phpVersion: egg.kind === "webhost" && (input.webRuntime ?? "html") === "php" ? (input.phpVersion ?? "8.3") : null,
        documentRoot: input.documentRoot || "/",
        status: "installing",
        installStatus: "pending",
        skipScripts: input.skipScripts,
      },
    });

    // Reserve ports.
    await tx.allocation.updateMany({
      where: { id: { in: allocationIds } },
      data: { serverId: server.id, isPrimary: false },
    });
    await tx.allocation.update({ where: { id: primaryAllocation.id }, data: { isPrimary: true } });

    // Materialise environment variables.
    for (const variable of egg.variables) {
      const supplied = input.environment[variable.envVariable];
      const value =
        variable.userEditable && supplied !== undefined && supplied !== "" ? supplied : variable.defaultValue;
      await tx.serverVariable.create({
        data: { serverId: server.id, variableId: variable.id, value },
      });
    }

    // Hostname wiring.
    if (hostname && input.hostnameMode === "subdomain") {
      const sub = await tx.subdomain.create({
        data: {
          domainId: domainId!,
          label: subdomainLabel!,
          serverId: server.id,
          recordType: bindingKind === "minecraft" ? "SRV" : "A",
          target: primaryAllocation.ip,
        },
      });
      await tx.domainBinding.create({
        data: {
          serverId: server.id,
          domainId: domainId,
          subdomainId: sub.id,
          hostname,
          kind: bindingKind,
          httpsMode: bindingKind === "http" ? "auto" : "off",
          forceHttps: bindingKind === "http",
          targetPort: primaryAllocation.port,
          isPrimary: true,
          status: "pending",
        },
      });
    } else if (hostname && input.hostnameMode === "custom") {
      const rootDomain = hostname.split(".").slice(-2).join(".");
      const existingDomain = await tx.domain.findUnique({ where: { name: rootDomain } });
      await tx.domainBinding.create({
        data: {
          serverId: server.id,
          domainId: existingDomain?.id ?? null,
          hostname,
          kind: bindingKind,
          httpsMode: bindingKind === "http" ? "auto" : "off",
          forceHttps: bindingKind === "http",
          targetPort: primaryAllocation.port,
          isPrimary: true,
          status: "pending",
        },
      });
    }

    return server;
  });

  // Push to the node. A daemon outage leaves the server in `installing` so it
  // can be retried from the admin UI instead of losing the record.
  let daemonQueued = false;
  let daemonError: string | undefined;
  try {
    const spec = await buildServerSpec(created.id);
    const node = await prisma.node.findUniqueOrThrow({ where: { id: created.nodeId } });
    const client = daemonFor(node);
    await client.createServer(spec, input.startOnCompletion);
    daemonQueued = true;
    await prisma.server.update({ where: { id: created.id }, data: { installStatus: "running" } });

    if (hostname) {
      await client
        .syncProxy({
          serverUuid: created.uuid,
          hostnames: [
            {
              hostname,
              kind: bindingKind,
              httpsMode: bindingKind === "http" ? "auto" : "off",
              forceHttps: bindingKind === "http",
              targetPort: primaryAllocation.port,
            },
          ],
          upstream: { ip: primaryAllocation.ip, port: primaryAllocation.port },
          web:
            egg.kind === "webhost"
              ? {
                  runtime: input.webRuntime ?? "html",
                  phpVersion: input.phpVersion ?? null,
                  documentRoot: input.documentRoot || "/",
                }
              : undefined,
        })
        .then(() => prisma.domainBinding.updateMany({ where: { serverId: created.id }, data: { status: "active" } }))
        .catch(async (error: unknown) => {
          await prisma.domainBinding.updateMany({
            where: { serverId: created.id },
            data: { status: "error", statusNote: error instanceof Error ? error.message.slice(0, 200) : "proxy error" },
          });
        });
    }
  } catch (error) {
    daemonError = error instanceof Error ? error.message : "Unknown daemon error.";
    await prisma.server.update({
      where: { id: created.id },
      data: { installStatus: "failed", status: "install_failed" },
    });
  }

  await logActivity({
    event: "server:create",
    userId: input.actingUserId,
    serverId: created.id,
    ip: input.ip ?? null,
    properties: { name: created.name, node: input.nodeId, egg: egg.name, hostname, daemonQueued },
  });

  return { serverId: created.id, uuid: created.uuid, uuidShort: created.uuidShort, hostname, daemonQueued, daemonError };
}

/** Frees every resource tied to a server, then removes it from the node. */
export async function deleteServer(serverId: number, actingUserId: number): Promise<{ daemonError?: string }> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { node: true, databases: { include: { host: true } } },
  });
  if (!server) throw new ProvisionError("Server not found.");

  let daemonError: string | undefined;
  const client = daemonFor(server.node);
  try {
    await client.removeProxy(server.uuid);
  } catch {
    // Proxy config may not exist; ignore.
  }
  try {
    await client.deleteServer(server.uuid);
  } catch (error) {
    daemonError = error instanceof Error ? error.message : "Unknown daemon error.";
  }

  await prisma.$transaction(async (tx) => {
    await tx.allocation.updateMany({ where: { serverId }, data: { serverId: null, isPrimary: false } });
    await tx.server.delete({ where: { id: serverId } });
  });

  await logActivity({
    event: "server:delete",
    userId: actingUserId,
    properties: { name: server.name, uuid: server.uuid, daemonError: daemonError ?? null },
  });

  return { daemonError };
}

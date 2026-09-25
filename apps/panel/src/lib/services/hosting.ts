import { notFound } from "next/navigation";
import { prisma } from "../db";
import { requireUser, type AuthUser } from "../auth/session";
import { resolveServerAccess, type ServerAccess } from "../auth/rbac";
import { connectionAddress } from "./network";

/**
 * The Web Hosting section is a hosting-flavoured view over the same server
 * infrastructure used by the game panel. A "website" is simply a Server whose
 * `serviceKind` is "webhost" (see the Prisma Server model + provisionServer).
 *
 * These helpers scope every query to webhost servers so game servers never leak
 * into the hosting UI, and reuse the shared RBAC resolver for ownership checks.
 */

export interface WebsiteSummary {
  id: number;
  uuidShort: string;
  name: string;
  status: string;
  suspended: boolean;
  runtime: string; // "html" | "php"
  phpVersion: string | null;
  documentRoot: string;
  address: string;
  primaryHostname: string | null;
  httpsEnabled: boolean;
  nodeName: string;
  memory: number;
  disk: number;
  cpu: number;
  createdAt: string;
}

const WEBSITE_INCLUDE = {
  node: { select: { name: true, fqdn: true } },
  allocations: { select: { ip: true, ipAlias: true, port: true, isPrimary: true } },
  bindings: { select: { hostname: true, isPrimary: true, kind: true, httpsMode: true, forceHttps: true } },
} as const;

/** Lists every webhost server the current user owns or is a subuser of. */
export async function listWebsitesForUser(user: AuthUser): Promise<WebsiteSummary[]> {
  const servers = await prisma.server.findMany({
    where: {
      serviceKind: "webhost",
      OR: [{ ownerId: user.id }, { subusers: { some: { userId: user.id } } }],
    },
    include: WEBSITE_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return servers.map((server) => {
    const primaryAllocation = server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];
    const primaryBinding = server.bindings.find((b) => b.isPrimary) ?? server.bindings[0];
    return {
      id: server.id,
      uuidShort: server.uuidShort,
      name: server.name,
      status: server.status,
      suspended: server.suspended,
      runtime: server.webRuntime ?? "html",
      phpVersion: server.phpVersion,
      documentRoot: server.documentRoot,
      address: connectionAddress(server.bindings, primaryAllocation),
      primaryHostname: primaryBinding?.hostname ?? null,
      httpsEnabled: primaryBinding ? primaryBinding.httpsMode !== "off" : false,
      nodeName: server.node.name,
      memory: server.memory,
      disk: server.disk,
      cpu: server.cpu,
      createdAt: server.createdAt.toISOString(),
    };
  });
}

export interface WebsiteContext {
  user: AuthUser;
  access: ServerAccess;
  server: NonNullable<Awaited<ReturnType<typeof loadWebsite>>>;
}

function loadWebsite(serverId: number) {
  return prisma.server.findFirst({
    where: { id: serverId, serviceKind: "webhost" },
    include: {
      node: true,
      egg: { include: { nest: true } },
      owner: { select: { id: true, username: true, email: true } },
      allocations: { orderBy: { port: "asc" } },
      bindings: { orderBy: { createdAt: "asc" } },
      _count: { select: { databases: true, backups: true } },
    },
  });
}

/**
 * Loads a website (webhost server) the current user may access, or 404s. Reuses
 * the same ownership/subuser RBAC as the game panel; a non-webhost server (or a
 * server the user cannot reach) is treated as not found so the two experiences
 * never cross over.
 */
export async function getWebsiteContext(identifier: string): Promise<WebsiteContext> {
  const user = await requireUser();
  const access = await resolveServerAccess(user, identifier);
  if (!access) notFound();
  const server = await loadWebsite(access.serverId);
  if (!server) notFound();
  return { user, access, server };
}

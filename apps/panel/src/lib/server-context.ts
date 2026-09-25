import { notFound } from "next/navigation";
import { prisma } from "./db";
import { requireUser, type AuthUser } from "./auth/session";
import { resolveServerAccess, type ServerAccess } from "./auth/rbac";

export interface ServerContext {
  user: AuthUser;
  access: ServerAccess;
  server: NonNullable<Awaited<ReturnType<typeof loadServer>>>;
}

async function loadServer(serverId: number) {
  return prisma.server.findUnique({
    where: { id: serverId },
    include: {
      node: true,
      egg: { include: { nest: true, variables: { orderBy: { sortOrder: "asc" } } } },
      owner: { select: { id: true, username: true, email: true, firstName: true, lastName: true } },
      allocations: { orderBy: { port: "asc" } },
      bindings: { orderBy: { createdAt: "asc" } },
      variables: { include: { variable: true } },
      _count: { select: { databases: true, backups: true, subusers: true } },
    },
  });
}

/** Loads a server the current user may access, or 404s. */
export async function getServerContext(identifier: string): Promise<ServerContext> {
  const user = await requireUser();
  const access = await resolveServerAccess(user, identifier);
  if (!access) notFound();
  const server = await loadServer(access.serverId);
  if (!server) notFound();
  return { user, access, server };
}

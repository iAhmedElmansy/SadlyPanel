import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiKey, hasScope, ApiKeyError } from "@/lib/auth/api-key";
import { connectionAddress } from "@/lib/services/network";

export const dynamic = "force-dynamic";

/**
 * GET /api/client/servers
 *
 * Authenticated via API-key Bearer token. Requires the `servers:read` scope.
 * Lists servers the caller owns (admins see all), scoped to the owning user so
 * a key never exposes more than its owner can already reach in the panel.
 */
export async function GET(request: Request) {
  try {
    const ctx = await authenticateApiKey(request);
    if (!hasScope(ctx, "servers:read")) {
      return NextResponse.json({ error: "Missing required scope: servers:read." }, { status: 403 });
    }

    const { user } = ctx;
    const where = user.role === "admin" ? {} : { ownerId: user.id };
    const servers = await prisma.server.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        allocations: { where: { isPrimary: true }, take: 1 },
        bindings: { select: { hostname: true, isPrimary: true, kind: true } },
        node: { select: { name: true } },
      },
    });

    const data = servers.map((server) => {
      const primary = server.allocations[0];
      return {
        uuid: server.uuid,
        uuidShort: server.uuidShort,
        name: server.name,
        description: server.description,
        status: server.status,
        suspended: server.suspended,
        node: server.node.name,
        serviceKind: server.serviceKind,
        limits: { memory: server.memory, disk: server.disk, cpu: server.cpu },
        address: connectionAddress(
          server.bindings,
          primary ? { ip: primary.ip, ipAlias: primary.ipAlias, port: primary.port } : undefined,
        ),
      };
    });

    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiKeyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}

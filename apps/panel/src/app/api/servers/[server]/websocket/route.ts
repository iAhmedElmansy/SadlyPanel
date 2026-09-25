import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveServerAccess } from "@/lib/auth/rbac";
import { decrypt } from "@/lib/crypto";
import { signDaemonToken } from "@/lib/daemon/token";
import { DaemonClient, nodeTarget } from "@/lib/daemon/client";

export const dynamic = "force-dynamic";

/**
 * Mints a short-lived websocket ticket for the server console. The browser
 * connects directly to the node daemon with this token.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ server: string }> }) {
  const { server: identifier } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const access = await resolveServerAccess(user, identifier);
  if (!access) return NextResponse.json({ error: "Server not found." }, { status: 404 });
  if (!access.isAdmin && !access.isOwner && !access.permissions.has("control.console")) {
    return NextResponse.json({ error: "Console access denied." }, { status: 403 });
  }

  const server = await prisma.server.findUniqueOrThrow({
    where: { id: access.serverId },
    include: { node: true },
  });

  const token = await signDaemonToken(decrypt(server.node.daemonToken), {
    serverUuid: server.uuid,
    userId: user.id,
    username: user.username,
    permissions: [...access.permissions],
  });

  const client = new DaemonClient(nodeTarget(server.node));

  return NextResponse.json(
    { socket: client.websocketUrl(server.uuid), token, expiresIn: 600 },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateNodeRequest, RemoteAuthError } from "@/lib/daemon/remote-auth";
import { buildServerSpec } from "@/lib/daemon/spec";

/**
 * GET /api/remote/servers/[server]
 *
 * Lets a node pull the authoritative spec for a server it does not know about
 * (for example after the node was rebuilt from a backup). The signature is
 * computed over an empty body, exactly like the panel's own GET calls.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ server: string }> }) {
  try {
    const { node } = await authenticateNodeRequest(request);
    const { server: uuid } = await params;

    const server = await prisma.server.findUnique({ where: { uuid }, select: { id: true, nodeId: true } });
    if (!server) return NextResponse.json({ error: "Unknown server." }, { status: 404 });
    if (server.nodeId !== node.id) {
      return NextResponse.json({ error: "That server does not belong to this node." }, { status: 403 });
    }

    return NextResponse.json({ spec: await buildServerSpec(server.id) });
  } catch (error) {
    if (error instanceof RemoteAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to build the server spec." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateNodeRequest, RemoteAuthError } from "@/lib/daemon/remote-auth";
import { SERVER_STATES } from "@/lib/constants";

/**
 * POST /api/remote/servers/[server]/status
 *
 * Pushes container state transitions (starting/running/offline…) from the node
 * so panel pages can render the true state without querying every daemon.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ server: string }> }) {
  try {
    const { node, body } = await authenticateNodeRequest(request);
    const { server: uuid } = await params;

    const server = await prisma.server.findUnique({
      where: { uuid },
      select: { id: true, nodeId: true, suspended: true },
    });
    if (!server) return NextResponse.json({ error: "Unknown server." }, { status: 404 });
    if (server.nodeId !== node.id) {
      return NextResponse.json({ error: "That server does not belong to this node." }, { status: 403 });
    }

    const state = String((body as { state?: string } | undefined)?.state ?? "");
    if (!(SERVER_STATES as readonly string[]).includes(state)) {
      return NextResponse.json({ error: `Unknown state: ${state || "(empty)"}` }, { status: 422 });
    }

    // A suspended server is always reported as suspended in the panel.
    await prisma.server.update({
      where: { id: server.id },
      data: { status: server.suspended ? "suspended" : state },
    });

    return NextResponse.json({ acknowledged: true, state });
  } catch (error) {
    if (error instanceof RemoteAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to record server state." },
      { status: 500 },
    );
  }
}

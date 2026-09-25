import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateNodeRequest, RemoteAuthError } from "@/lib/daemon/remote-auth";
import { logActivity } from "@/lib/activity";

/**
 * POST /api/remote/servers/[server]/install
 *
 * The daemon reports the outcome of an install/reinstall run so the panel can
 * flip the server out of the `installing` state without polling.
 */

export const dynamic = "force-dynamic";

interface InstallPayload {
  status?: string;
  successful?: boolean;
  reinstall?: boolean;
  note?: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ server: string }> }) {
  try {
    const { node, body } = await authenticateNodeRequest(request);
    const { server: uuid } = await params;

    const server = await prisma.server.findUnique({ where: { uuid }, select: { id: true, nodeId: true, name: true } });
    if (!server) return NextResponse.json({ error: "Unknown server." }, { status: 404 });
    if (server.nodeId !== node.id) {
      return NextResponse.json({ error: "That server does not belong to this node." }, { status: 403 });
    }

    const payload = (body ?? {}) as InstallPayload;
    const successful =
      typeof payload.successful === "boolean" ? payload.successful : payload.status === "success";

    await prisma.server.update({
      where: { id: server.id },
      data: {
        installStatus: successful ? "success" : "failed",
        status: successful ? "offline" : "install_failed",
        installedAt: successful ? new Date() : null,
      },
    });

    await logActivity({
      event: successful ? "server:install.success" : "server:install.failure",
      serverId: server.id,
      properties: { node: node.name, reinstall: Boolean(payload.reinstall), note: payload.note ?? null },
    });

    return NextResponse.json({ acknowledged: true, installStatus: successful ? "success" : "failed" });
  } catch (error) {
    if (error instanceof RemoteAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to record install status." },
      { status: 500 },
    );
  }
}

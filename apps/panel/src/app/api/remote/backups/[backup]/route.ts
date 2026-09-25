import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateNodeRequest, RemoteAuthError } from "@/lib/daemon/remote-auth";
import { logActivity } from "@/lib/activity";

/**
 * POST /api/remote/backups/[backup]
 *
 * Backups run detached on the node; this is how the daemon reports the result
 * (size + checksum) so the panel can mark the backup restorable.
 */

export const dynamic = "force-dynamic";

interface BackupPayload {
  successful?: boolean;
  bytes?: number;
  checksum?: string;
  error?: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ backup: string }> }) {
  try {
    const { node, body } = await authenticateNodeRequest(request);
    const { backup: backupUuid } = await params;

    const backup = await prisma.backup.findUnique({
      where: { uuid: backupUuid },
      include: { server: { select: { id: true, nodeId: true } } },
    });
    if (!backup) return NextResponse.json({ error: "Unknown backup." }, { status: 404 });
    if (backup.server.nodeId !== node.id) {
      return NextResponse.json({ error: "That backup does not belong to this node." }, { status: 403 });
    }

    const payload = (body ?? {}) as BackupPayload;
    const successful = payload.successful !== false && !payload.error;
    const bytes = Number.isFinite(Number(payload.bytes)) ? Math.max(0, Math.round(Number(payload.bytes))) : 0;

    await prisma.backup.update({
      where: { id: backup.id },
      data: {
        isSuccessful: successful,
        bytes,
        checksum: typeof payload.checksum === "string" ? payload.checksum.slice(0, 128) : null,
        completedAt: new Date(),
      },
    });

    await logActivity({
      event: successful ? "server:backup.complete" : "server:backup.failed",
      serverId: backup.server.id,
      properties: { backup: backup.name, bytes, error: payload.error ?? null },
    });

    return NextResponse.json({ acknowledged: true, successful });
  } catch (error) {
    if (error instanceof RemoteAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to record backup result." },
      { status: 500 },
    );
  }
}

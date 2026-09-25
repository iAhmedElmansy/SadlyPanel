import { NextResponse } from "next/server";
import { authenticateNodeRequest, RemoteAuthError } from "@/lib/daemon/remote-auth";
import { recordHeartbeat, type HeartbeatPayload } from "@/lib/services/heartbeat";

/**
 * POST /api/remote/nodes/heartbeat
 *
 * Called by the daemon every 15 seconds with node-level telemetry. The response
 * tells the daemon which servers the panel expects it to host, so a node that
 * was rebuilt can detect drift.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { node, body } = await authenticateNodeRequest(request);
    const result = await recordHeartbeat(node, (body ?? {}) as HeartbeatPayload);
    return NextResponse.json({
      status: result.status,
      intervalMs: result.intervalMs,
      node: { id: node.id, name: node.name, maintenanceMode: node.maintenanceMode },
      servers: result.servers,
    });
  } catch (error) {
    if (error instanceof RemoteAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to record heartbeat." },
      { status: 500 },
    );
  }
}

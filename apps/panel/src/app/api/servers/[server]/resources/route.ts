import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveServerAccess } from "@/lib/auth/rbac";
import { daemonForServer } from "@/lib/daemon";

export const dynamic = "force-dynamic";

/** Live resource usage for a server, proxied from its node. */
export async function GET(_request: Request, { params }: { params: Promise<{ server: string }> }) {
  const { server: identifier } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const access = await resolveServerAccess(user, identifier);
  if (!access) return NextResponse.json({ error: "Server not found." }, { status: 404 });

  try {
    const { client, uuid } = await daemonForServer(access.serverId);
    const usage = await client.resources(uuid);
    return NextResponse.json(usage, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        state: "offline",
        unreachable: true,
        error: error instanceof Error ? error.message : "Node unreachable.",
        memoryBytes: 0,
        memoryLimitBytes: 0,
        cpuAbsolute: 0,
        diskBytes: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
        uptimeMs: 0,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}

import { NextResponse } from "next/server";
import { authenticateNodeRequest, RemoteAuthError } from "@/lib/daemon/remote-auth";
import { renderDaemonConfig, resolvePanelUrl } from "@/lib/services/node-config";
import { decrypt } from "@/lib/crypto";

/**
 * GET /api/remote/nodes/config
 *
 * Lets `spanel-daemon configure` pull its own config.yml using only the token
 * pair, so the file never has to be copy-pasted by hand. Authenticated exactly
 * like every other remote endpoint, and it only ever returns the calling node's
 * own configuration.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { node } = await authenticateNodeRequest(request);
    const panelUrl = await resolvePanelUrl();
    const config = renderDaemonConfig(node, { panelUrl, token: decrypt(node.daemonToken) });

    return NextResponse.json({
      node: {
        id: node.id,
        name: node.name,
        fqdn: node.fqdn,
        daemonPort: node.daemonPort,
        daemonSftpPort: node.daemonSftpPort,
        daemonBase: node.daemonBase,
        proxyEnabled: node.proxyEnabled,
        maintenanceMode: node.maintenanceMode,
      },
      config,
    });
  } catch (error) {
    if (error instanceof RemoteAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to render the node configuration." },
      { status: 500 },
    );
  }
}

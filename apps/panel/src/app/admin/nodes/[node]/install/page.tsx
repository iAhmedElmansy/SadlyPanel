import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { decrypt } from "@/lib/crypto";
import {
  renderConfigureCommand,
  renderDaemonConfig,
  renderInstallCommand,
  renderNodeInstallCommand,
  renderServiceCommands,
  resolvePanelUrl,
} from "@/lib/services/node-config";
import { NodeConfiguration } from "../node-configuration";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.nodeInstallMeta") };
}
export const dynamic = "force-dynamic";

export default async function NodeInstallPage({ params }: { params: Promise<{ node: string }> }) {
  await requireAdmin();
  const { node: nodeParam } = await params;
  const nodeId = Number(nodeParam);
  if (!Number.isInteger(nodeId)) notFound();

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) notFound();

  const token = decrypt(node.daemonToken);
  const panelUrl = await resolvePanelUrl();
  const options = { panelUrl, token };
  const config = renderDaemonConfig(node, options);
  const installCommand = renderInstallCommand(node, options);
  const nodeInstallCommand = renderNodeInstallCommand(node, options);
  const configureCommand = renderConfigureCommand(node, options);
  const serviceCommands = renderServiceCommands();

  return (
    <NodeConfiguration
      nodeId={node.id}
      config={config}
      installCommand={installCommand}
      nodeInstallCommand={nodeInstallCommand}
      configureCommand={configureCommand}
      serviceCommands={serviceCommands}
    />
  );
}

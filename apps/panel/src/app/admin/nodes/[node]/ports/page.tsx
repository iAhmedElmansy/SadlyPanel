import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { NodePortsManager } from "./node-ports-manager";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.nodePortsMeta") };
}
export const dynamic = "force-dynamic";

export default async function NodePortsPage({ params }: { params: Promise<{ node: string }> }) {
  await requireAdmin();
  const { node: nodeParam } = await params;
  const nodeId = Number(nodeParam);
  if (!Number.isInteger(nodeId)) notFound();

  const node = await prisma.node.findUnique({ where: { id: nodeId }, select: { id: true } });
  if (!node) notFound();

  const allocations = await prisma.allocation.findMany({
    where: { nodeId: node.id },
    include: { server: { select: { name: true, uuidShort: true } } },
    orderBy: [{ ip: "asc" }, { port: "asc" }],
  });

  return (
    <NodePortsManager
      nodeId={node.id}
      allocations={allocations.map((allocation) => ({
        id: allocation.id,
        ip: allocation.ip,
        ipAlias: allocation.ipAlias,
        port: allocation.port,
        notes: allocation.notes,
        isPrimary: allocation.isPrimary,
        server: allocation.server,
      }))}
    />
  );
}

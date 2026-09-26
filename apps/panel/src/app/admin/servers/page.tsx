import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { connectionAddress } from "@/lib/services/network";
import { AdminServerTable } from "./server-table";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.serversMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminServersPage() {
  await requirePermission("servers.view");
  const t = await getT();

  const [servers, users, mounts] = await Promise.all([
    prisma.server.findMany({
      include: {
        owner: { select: { id: true, username: true } },
        node: { select: { name: true } },
        egg: { select: { name: true } },
        allocations: { select: { ip: true, ipAlias: true, port: true, isPrimary: true } },
        bindings: { select: { hostname: true, isPrimary: true, kind: true } },
        mounts: { select: { mountId: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true } }),
    prisma.mount.findMany({
      include: { nodes: { select: { nodeId: true } }, eggs: { select: { eggId: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  // A mount is eligible when its node/egg restriction rows are empty (= all) or
  // include the server's node/egg. Precomputed here so the client just renders.
  const eligibleMountsFor = (nodeId: number, eggId: number) =>
    mounts
      .filter(
        (mount) =>
          (mount.nodes.length === 0 || mount.nodes.some((n) => n.nodeId === nodeId)) &&
          (mount.eggs.length === 0 || mount.eggs.some((e) => e.eggId === eggId)),
      )
      .map((mount) => ({ id: mount.id, name: mount.name, source: mount.source, target: mount.target, readOnly: mount.readOnly }));

  return (
    <>
      <PageHeader
        title={t("admin.serversTitle")}
        description={t("admin.serversDesc")}
        actions={
          <Link href="/admin/servers/new" className="btn btn-primary">
            <Plus className="size-4" />
            Create server
          </Link>
        }
      />
      <AdminServerTable
        users={users}
        servers={servers.map((server) => ({
          id: server.id,
          uuid: server.uuid,
          uuidShort: server.uuidShort,
          name: server.name,
          ownerId: server.owner.id,
          ownerName: server.owner.username,
          nodeName: server.node.name,
          eggName: server.egg.name,
          serviceKind: server.serviceKind,
          memory: server.memory,
          swap: server.swap,
          disk: server.disk,
          cpu: server.cpu,
          io: server.io,
          threads: server.threads,
          oomKiller: server.oomKiller,
          databaseLimit: server.databaseLimit,
          allocationLimit: server.allocationLimit,
          backupLimit: server.backupLimit,
          status: server.status,
          installStatus: server.installStatus,
          suspended: server.suspended,
          address: connectionAddress(
            server.bindings,
            server.allocations.find((a) => a.isPrimary) ?? server.allocations[0],
          ),
          attachedMountIds: server.mounts.map((m) => m.mountId),
          eligibleMounts: eligibleMountsFor(server.nodeId, server.eggId),
        }))}
      />
    </>
  );
}

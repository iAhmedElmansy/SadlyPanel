import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MountManager } from "./mount-manager";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.mountsMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminMountsPage() {
  await requireAdmin();
  const t = await getT();

  const [mounts, nodes, eggs] = await Promise.all([
    prisma.mount.findMany({
      include: {
        nodes: { select: { nodeId: true } },
        eggs: { select: { eggId: true } },
        _count: { select: { servers: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.node.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.egg.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title={t("admin.mountsTitle")}
        description={t("admin.mountsDesc")}
      />

      <MountManager
        nodes={nodes}
        eggs={eggs}
        mounts={mounts.map((mount) => ({
          id: mount.id,
          uuid: mount.uuid,
          name: mount.name,
          description: mount.description ?? "",
          source: mount.source,
          target: mount.target,
          readOnly: mount.readOnly,
          userMountable: mount.userMountable,
          nodeIds: mount.nodes.map((row) => row.nodeId),
          eggIds: mount.eggs.map((row) => row.eggId),
          serverCount: mount._count.servers,
        }))}
      />

      <Card className="mt-6">
        <CardHeader title={t("admin.mountsWorkingTitle")} />
        <CardBody className="space-y-2 text-xs text-ink-muted">
          <p>
            {t("admin.mountsWorkingP1a")} <span className="font-mono">{t("admin.mountsWorkingSource")}</span>{" "}
            {t("admin.mountsWorkingP1b")} <span className="font-mono">{t("admin.mountsWorkingTarget")}</span>{" "}
            {t("admin.mountsWorkingP1c")} <span className="font-mono">/home/container/shared</span>
            {t("admin.mountsWorkingP1d")}
          </p>
          <p>{t("admin.mountsWorkingP2")}</p>
        </CardBody>
      </Card>
    </>
  );
}

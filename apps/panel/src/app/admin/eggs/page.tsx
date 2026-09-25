import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EggManager } from "./egg-manager";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.eggsMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminEggsPage() {
  await requireAdmin();
  const t = await getT();

  const nests = await prisma.nest.findMany({
    include: {
      eggs: {
        include: { variables: { orderBy: { sortOrder: "asc" } }, _count: { select: { servers: true } } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
    orderBy: { id: "asc" },
  });

  return (
    <>
      <PageHeader
        title={t("admin.eggsTitle")}
        description={t("admin.eggsDesc")}
      />

      <EggManager
        nests={nests.map((nest) => ({
          id: nest.id,
          name: nest.name,
          description: nest.description,
          icon: nest.icon,
          eggs: nest.eggs.map((egg) => ({
            id: egg.id,
            uuid: egg.uuid,
            nestId: egg.nestId,
            name: egg.name,
            description: egg.description ?? "",
            kind: egg.kind,
            author: egg.author,
            dockerImages: egg.dockerImages,
            startup: egg.startup,
            configFiles: egg.configFiles,
            configStartup: egg.configStartup,
            configLogs: egg.configLogs,
            configStop: egg.configStop,
            scriptContainer: egg.scriptContainer,
            scriptEntry: egg.scriptEntry,
            scriptInstall: egg.scriptInstall,
            features: egg.features,
            fileDenylist: egg.fileDenylist,
            forceOutgoingIp: egg.forceOutgoingIp,
            sortOrder: egg.sortOrder,
            serverCount: egg._count.servers,
            variables: egg.variables.map((variable) => ({
              id: variable.id,
              name: variable.name,
              description: variable.description,
              envVariable: variable.envVariable,
              defaultValue: variable.defaultValue,
              userViewable: variable.userViewable,
              userEditable: variable.userEditable,
              rules: variable.rules,
              sortOrder: variable.sortOrder,
            })),
          })),
        }))}
      />

      <Card className="mt-6">
        <CardHeader title={t("admin.eggsWorkingTitle")} />
        <CardBody className="space-y-2 text-xs text-ink-muted">
          <p>
            {t("admin.eggsWorkingP1a")} <span className="font-mono">PTDL_v1</span> {t("admin.eggsWorkingP1b")}{" "}
            <span className="font-mono">PTDL_v2</span> {t("admin.eggsWorkingP1c")}{" "}
            <span className="font-mono">spanel</span> {t("admin.eggsWorkingP1d")}
          </p>
          <p>{t("admin.eggsWorkingP2")}</p>
          <p className="text-ink-dim">
            {t("admin.eggsWorkingP3a")} <span className="font-mono">apps/panel/prisma/seed.ts</span>, {t("admin.eggsWorkingP3b")}{" "}
            <span className="font-mono">npm run db:seed</span> {t("admin.eggsWorkingP3c")}
          </p>
        </CardBody>
      </Card>
    </>
  );
}

import { getServerContext } from "@/lib/server-context";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { parseJsonSafe } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getT } from "@/lib/i18n/server";
import { SubuserPanel } from "./subuser-panel";

export const dynamic = "force-dynamic";

export default async function ServerUsersPage({ params }: { params: Promise<{ server: string }> }) {
  const { server: identifier } = await params;
  const { server, access } = await getServerContext(identifier);
  const t = await getT();

  if (!can(access, "user.read")) {
    return (
      <Card>
        <CardHeader title={t("dashboard.serverUsersNoAccessTitle")} />
        <CardBody className="text-sm text-ink-muted">{t("dashboard.serverUsersNoAccessDesc")}</CardBody>
      </Card>
    );
  }

  const subusers = await prisma.subuser.findMany({
    where: { serverId: server.id },
    include: { user: { select: { username: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <SubuserPanel
      serverUuid={server.uuidShort}
      canCreate={can(access, "user.create")}
      canDelete={can(access, "user.delete")}
      subusers={subusers.map((subuser) => ({
        id: subuser.id,
        username: subuser.user.username,
        email: subuser.user.email,
        permissions: parseJsonSafe<string[]>(subuser.permissions, []),
      }))}
    />
  );
}

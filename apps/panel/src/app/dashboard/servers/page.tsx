import Link from "next/link";
import type { Metadata } from "next";
import { Boxes, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { connectionAddress } from "@/lib/services/network";
import { ServerCard, type ServerCardData } from "./server-card";
import { ServerScopeToggle } from "./scope-toggle";

export const metadata: Metadata = { title: "My servers" };
export const dynamic = "force-dynamic";

export default async function ServersPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const user = await requireUser();
  const t = await getT();
  const { scope } = await searchParams;

  // #8 — admins with the servers.viewOthers permission can flip the list to
  // other users' servers. Everyone else is always scoped to their own.
  const canViewOthers = roleCan(user, "servers.viewOthers");
  const showingOthers = canViewOthers && scope === "others";

  const ownership = showingOthers
    ? { ownerId: { not: user.id } }
    : { OR: [{ ownerId: user.id }, { subusers: { some: { userId: user.id } } }] };

  const servers = await prisma.server.findMany({
    where: {
      // #7 — web hosting lives under /dashboard/hosting; never mix it in here.
      serviceKind: { not: "webhost" },
      ...ownership,
    },
    include: {
      node: { select: { name: true } },
      egg: { select: { name: true } },
      allocations: { select: { ip: true, ipAlias: true, port: true, isPrimary: true } },
      bindings: { select: { hostname: true, isPrimary: true, kind: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const cards: ServerCardData[] = servers.map((server) => ({
    uuidShort: server.uuidShort,
    name: server.name,
    serviceKind: server.serviceKind,
    eggName: server.egg.name,
    nodeName: server.node.name,
    address: connectionAddress(server.bindings, server.allocations.find((a) => a.isPrimary) ?? server.allocations[0]),
    status: server.status,
    suspended: server.suspended,
    installStatus: server.installStatus,
    memory: server.memory,
    disk: server.disk,
    cpu: server.cpu,
  }));

  return (
    <>
      <PageHeader
        title={t("dashboard.serversTitle")}
        description={t("dashboard.serversHeaderDescription", { count: String(cards.length) })}
        actions={
          <div className="flex items-center gap-3">
            {canViewOthers ? <ServerScopeToggle showingOthers={showingOthers} /> : null}
            <Link href="/dashboard/servers/new" className="btn btn-primary">
              <Plus className="size-4" />
              {t("dashboard.serversCreate")}
            </Link>
          </div>
        }
      />

      {cards.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Boxes className="size-5" />}
            title={showingOthers ? t("dashboard.serversOthersEmptyTitle") : t("dashboard.serversEmptyTitle")}
            description={showingOthers ? t("dashboard.serversOthersEmptyDescription") : t("dashboard.serversEmptyDescription")}
            action={
              showingOthers ? undefined : (
                <Link href="/dashboard/servers/new" className="btn btn-primary">
                  <Plus className="size-4" />
                  {t("dashboard.serversCreate")}
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <div className="animate-in divide-y divide-line-soft">
          {cards.map((server) => (
            <ServerCard key={server.uuidShort} server={server} />
          ))}
        </div>
      )}
    </>
  );
}

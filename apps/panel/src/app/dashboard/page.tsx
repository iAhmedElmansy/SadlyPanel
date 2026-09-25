import Link from "next/link";
import { Activity, Boxes, Cpu, Globe2, HardDrive, MemoryStick, Plus, Server as ServerIcon } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/dashboard/stat-tile";
import { formatCpu, formatMib, formatPrice, relativeTime } from "@/lib/utils";
import { connectionAddress } from "@/lib/services/network";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const t = await getT();
  const user = await requireUser();

  const [account, servers, subusered, activity] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { plan: true } }),
    prisma.server.findMany({
      where: { ownerId: user.id },
      include: {
        node: { select: { name: true } },
        egg: { select: { name: true, kind: true } },
        allocations: { select: { ip: true, ipAlias: true, port: true, isPrimary: true } },
        bindings: { select: { hostname: true, isPrimary: true, kind: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.subuser.findMany({
      where: { userId: user.id },
      include: {
        server: {
          include: {
            egg: { select: { name: true } },
            allocations: { select: { ip: true, ipAlias: true, port: true, isPrimary: true } },
            bindings: { select: { hostname: true, isPrimary: true, kind: true } },
          },
        },
      },
    }),
    prisma.activityLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const totals = servers.reduce(
    (acc, server) => ({
      memory: acc.memory + server.memory,
      disk: acc.disk + server.disk,
      cpu: acc.cpu + server.cpu,
    }),
    { memory: 0, disk: 0, cpu: 0 },
  );

  return (
    <>
      <PageHeader
        title={t("dashboard.overviewWelcome", { name: user.firstName })}
        description={t("dashboard.overviewSubtitle")}
        actions={
          <Link href="/dashboard/servers/new" className="btn btn-primary">
            <Plus className="size-4" />
            {t("dashboard.overviewCreateServer")}
          </Link>
        }
      />

      <div className="grid animate-in gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("dashboard.overviewStatServers")} value={servers.length} hint={t("dashboard.overviewStatServersHint", { count: String(subusered.length) })} icon={<ServerIcon className="size-4.5" />} />
        <StatTile label={t("dashboard.overviewStatMemory")} value={formatMib(totals.memory)} icon={<MemoryStick className="size-4.5" />} tone="info" />
        <StatTile label={t("dashboard.overviewStatDisk")} value={formatMib(totals.disk)} icon={<HardDrive className="size-4.5" />} tone="warn" />
        <StatTile label={t("dashboard.overviewStatCpu")} value={formatCpu(totals.cpu)} icon={<Cpu className="size-4.5" />} tone="ok" />
      </div>

      <div className="mt-6 grid animate-in gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title={t("dashboard.overviewServersTitle")}
            description={t("dashboard.overviewServersDescription")}
            action={
              <Link href="/dashboard/servers" className="btn btn-ghost">
                {t("dashboard.overviewViewAll")}
              </Link>
            }
          />
          {servers.length === 0 ? (
            <EmptyState
              icon={<Boxes className="size-5" />}
              title={t("dashboard.overviewNoServersTitle")}
              description={t("dashboard.overviewNoServersDescription")}
              action={
                <Link href="/dashboard/servers/new" className="btn btn-primary">
                  <Plus className="size-4" />
                  {t("dashboard.overviewCreateFirstServer")}
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-line-soft">
              {servers.slice(0, 6).map((server) => (
                <li key={server.id}>
                  <Link
                    href={`/dashboard/servers/${server.uuidShort}`}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/60"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-ink-muted">
                      <ServerIcon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{server.name}</span>
                        <StatusBadge state={server.suspended ? "suspended" : server.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-dim">
                        {server.egg.name} · {server.node.name} ·{" "}
                        <span className="font-mono">
                          {connectionAddress(
                            server.bindings,
                            server.allocations.find((a) => a.isPrimary) ?? server.allocations[0],
                          )}
                        </span>
                      </p>
                    </div>
                    <dl className="flex shrink-0 gap-4 text-end text-xs text-ink-muted">
                      <div>
                        <dt className="text-ink-dim">{t("dashboard.overviewMetricRam")}</dt>
                        <dd className="font-mono">{formatMib(server.memory)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-dim">{t("dashboard.overviewMetricDisk")}</dt>
                        <dd className="font-mono">{formatMib(server.disk)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-dim">{t("dashboard.overviewMetricCpu")}</dt>
                        <dd className="font-mono">{formatCpu(server.cpu)}</dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t("dashboard.overviewPlanTitle")} description={t("dashboard.overviewPlanDescription")} />
            <CardBody>
              {account?.plan ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{account.plan.name}</p>
                    {account.plan.description ? (
                      <p className="mt-0.5 truncate text-xs text-ink-dim">{account.plan.description}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-mono text-sm text-brand-soft">
                    {formatPrice(account.plan.priceCents, account.plan.currency, account.plan.billingCycle)}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">
                  {t("dashboard.overviewNoPlan")} <span className="text-ink-dim">{t("dashboard.overviewFreePlan")}</span>
                </p>
              )}
            </CardBody>
          </Card>

          {subusered.length > 0 ? (
            <Card>
              <CardHeader title={t("dashboard.overviewSharedTitle")} description={t("dashboard.overviewSharedDescription")} />
              <ul className="divide-y divide-line-soft">
                {subusered.map(({ server }) => (
                  <li key={server.id}>
                    <Link
                      href={`/dashboard/servers/${server.uuidShort}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-surface-2/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{server.name}</span>
                        <span className="block truncate font-mono text-xs text-ink-dim">
                          {connectionAddress(server.bindings, server.allocations.find((a) => a.isPrimary) ?? server.allocations[0])}
                        </span>
                      </span>
                      <StatusBadge state={server.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t("dashboard.overviewActivityTitle")} description={t("dashboard.overviewActivityDescription")} />
            {activity.length === 0 ? (
              <CardBody className="text-xs text-ink-dim">{t("dashboard.overviewActivityEmpty")}</CardBody>
            ) : (
              <ul className="divide-y divide-line-soft">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 px-5 py-2.5 text-xs">
                    <Activity className="size-3.5 shrink-0 text-ink-dim" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono text-ink-muted">{entry.event}</span>
                    <span className="shrink-0 text-ink-dim">{relativeTime(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={t("dashboard.overviewHostnamesTitle")} description={t("dashboard.overviewHostnamesDescription")} />
            <CardBody className="space-y-2 text-xs text-ink-muted">
              <p className="flex items-start gap-2">
                <Globe2 className="mt-0.5 size-3.5 shrink-0 text-brand-soft" />
                {t("dashboard.overviewHostnamesBind")}
              </p>
              <p className="text-ink-dim">
                {t("dashboard.overviewHostnamesHttps")}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

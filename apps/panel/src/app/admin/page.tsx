import { Suspense } from "react";
import Link from "next/link";
import {
  Activity,
  Boxes,
  Database,
  Globe2,
  HardDrive,
  Server,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { canAccessAdminArea } from "@/lib/auth/rbac";
import { getNodeCapacity } from "@/lib/services/capacity";
import { healthOf, nodeHealthSummary, refreshNodeHealth } from "@/lib/services/heartbeat";
import { databaseHostStatus } from "@/lib/services/db-health";
import { PageHeader, StatCard } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { formatMib, relativeTime } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { panelVersion, checkForUpdates } from "@/lib/version";
import { PanelVersionBadge } from "./nodes/update-panel";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.overviewMeta") };
}
export const dynamic = "force-dynamic";

const SHORTCUTS = [
  { href: "/admin/settings", labelKey: "admin.scSettings", icon: Settings, hintKey: "admin.scSettingsHint" },
  { href: "/admin/users", labelKey: "admin.scUsers", icon: Users, hintKey: "admin.scUsersHint" },
  { href: "/admin/nodes", labelKey: "admin.scNodes", icon: HardDrive, hintKey: "admin.scNodesHint" },
  { href: "/admin/domains", labelKey: "admin.scDomains", icon: Globe2, hintKey: "admin.scDomainsHint" },
  { href: "/admin/databases", labelKey: "admin.scDbHosts", icon: Database, hintKey: "admin.scDbHostsHint" },
  { href: "/admin/servers", labelKey: "admin.scServers", icon: Server, hintKey: "admin.scServersHint" },
  { href: "/admin/eggs", labelKey: "admin.scServices", icon: Boxes, hintKey: "admin.scServicesHint" },
  { href: "/admin/activity", labelKey: "admin.scActivity", icon: Activity, hintKey: "admin.scActivityHint" },
];

const NODE_HEALTH_TONE = { online: "ok", degraded: "warn", offline: "bad", unknown: "neutral" } as const;
const NODE_HEALTH_KEY = {
  online: "admin.healthOnline",
  degraded: "admin.healthDegraded",
  offline: "admin.healthOffline",
  unknown: "admin.healthUnknown",
} as const;

/**
 * Streams the git-based update status into the header without blocking the
 * dashboard: `checkForUpdates()` runs a `git fetch` (up to a 10s timeout), so it
 * renders inside <Suspense> and the page paints immediately with just the
 * version chip as the fallback.
 */
async function UpdateStatusBadge() {
  const status = await checkForUpdates();
  return <PanelVersionBadge status={status} panelVersion={panelVersion()} />;
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const user = await requireUser();
  if (!canAccessAdminArea(user)) redirect("/dashboard");
  const t = await getT();
  const { welcome } = await searchParams;

  await refreshNodeHealth().catch(() => undefined);

  const [users, servers, nodeRows, domains, dbHostRows, eggs, activity, health, serverStates] = await Promise.all([
    prisma.user.count(),
    prisma.server.count(),
    prisma.node.findMany({ orderBy: { name: "asc" } }),
    prisma.domain.count(),
    prisma.databaseHost.findMany({ select: { id: true, name: true, reachable: true, lastCheckedAt: true } }),
    prisma.egg.count(),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { user: { select: { username: true } } },
    }),
    nodeHealthSummary(),
    prisma.server.groupBy({ by: ["status"], _count: { status: true } }),
  ]);

  const capacities = await Promise.all(
    nodeRows.map(async (node) => ({ node, capacity: await getNodeCapacity(node.id) })),
  );

  const totals = capacities.reduce(
    (acc, { capacity }) => ({
      memoryUsed: acc.memoryUsed + capacity.memory.used,
      memoryTotal: acc.memoryTotal + capacity.memory.overallocated,
      diskUsed: acc.diskUsed + capacity.disk.used,
      diskTotal: acc.diskTotal + capacity.disk.overallocated,
      freePorts: acc.freePorts + capacity.allocations.free,
    }),
    { memoryUsed: 0, memoryTotal: 0, diskUsed: 0, diskTotal: 0, freePorts: 0 },
  );

  const dbHosts = dbHostRows.length;
  const dbUnreachable = dbHostRows.filter((host) => databaseHostStatus(host) === "unreachable");
  const runningServers = serverStates.find((row) => row.status === "running")?._count.status ?? 0;
  const failedServers = serverStates
    .filter((row) => row.status === "install_failed" || row.status === "suspended")
    .reduce((sum, row) => sum + row._count.status, 0);

  const setupSteps = [
    { done: nodeRows.length > 0, label: t("admin.overviewStepNode"), href: "/admin/nodes" },
    { done: health.online > 0, label: t("admin.overviewStepDaemon"), href: "/admin/nodes" },
    { done: totals.freePorts > 0, label: t("admin.overviewStepPorts"), href: "/admin/nodes" },
    { done: domains > 0, label: t("admin.overviewStepDomain"), href: "/admin/domains" },
    { done: dbHosts > 0, label: t("admin.overviewStepDbHost"), href: "/admin/databases" },
    { done: eggs > 0, label: t("admin.overviewStepEggs"), href: "/admin/eggs" },
  ];
  const remaining = setupSteps.filter((step) => !step.done);

  return (
    <>
      <PageHeader
        title={t("admin.overviewTitle")}
        description={t("admin.overviewDesc")}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Suspense
              fallback={
                <span className="badge border-line bg-surface-2 font-mono text-[11px] text-ink-muted">
                  v{panelVersion()}
                </span>
              }
            >
              <UpdateStatusBadge />
            </Suspense>
            <span className="badge border-brand/40 bg-brand/12 text-brand-soft">
              <ShieldCheck className="size-3" />
              {t("admin.overviewAdministrator")}
            </span>
          </span>
        }
      />

      {welcome ? (
        <Card className="mb-6 border-brand/40">
          <CardHeader
            title={t("admin.overviewWelcomeTitle")}
            description={t("admin.overviewWelcomeDesc")}
          />
        </Card>
      ) : null}

      {remaining.length > 0 ? (
        <Card className="mb-6">
          <CardHeader title={t("admin.overviewChecklist")} description={t("admin.overviewChecklistProgress", { done: setupSteps.length - remaining.length, total: setupSteps.length })} />
          <CardBody>
            <ol className="space-y-2">
              {setupSteps.map((step) => (
                <li key={step.label} className="flex items-center gap-2.5 text-sm">
                  <span
                    className={`grid size-5 place-items-center rounded-full border text-[10px] ${
                      step.done ? "border-ok/50 bg-ok/15 text-ok" : "border-line bg-surface-2 text-ink-dim"
                    }`}
                  >
                    {step.done ? "✓" : ""}
                  </span>
                  {step.done ? (
                    <span className="text-ink-dim line-through">{step.label}</span>
                  ) : (
                    <Link href={step.href} className="text-brand-soft hover:underline">
                      {step.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid animate-in gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("admin.overviewStatUsers")} value={users} icon={<Users className="size-4" />} />
        <StatCard
          label={t("admin.overviewStatServers")}
          value={servers}
          hint={`${t("admin.overviewRunning", { count: runningServers })}${failedServers > 0 ? t("admin.overviewNeedAttention", { count: failedServers }) : ""}`}
          icon={<Server className="size-4" />}
          tone={failedServers > 0 ? "warn" : "ok"}
        />
        <StatCard
          label={t("admin.overviewStatNodes")}
          value={`${health.online}/${health.total}`}
          hint={`${t("admin.overviewFreePorts", { count: totals.freePorts })}${health.offline > 0 ? t("admin.overviewOffline", { count: health.offline }) : ""}`}
          icon={<HardDrive className="size-4" />}
          tone={health.offline > 0 ? "bad" : "info"}
        />
        <StatCard
          label={t("admin.overviewStatDomains")}
          value={domains}
          hint={`${t("admin.overviewDbHostsCount", { count: dbHosts })}${dbUnreachable.length > 0 ? t("admin.overviewUnreachableCount", { count: dbUnreachable.length }) : ""}`}
          icon={<Globe2 className="size-4" />}
          tone={dbUnreachable.length > 0 ? "bad" : "warn"}
        />
      </div>

      {health.offline > 0 || dbUnreachable.length > 0 ? (
        <Card className="mt-6 border-bad/40">
          <CardHeader title={t("admin.overviewAttention")} description={t("admin.overviewAttentionDesc")} />
          <CardBody className="space-y-2 text-xs">
            {capacities
              .filter(({ node }) => healthOf(node.lastHeartbeatAt) === "offline")
              .map(({ node }) => (
                <p key={node.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone="bad">{t("admin.overviewNodeOffline")}</Badge>
                  <Link href={`/admin/nodes/${node.id}`} className="text-ink hover:text-brand-soft">
                    {node.name}
                  </Link>
                  <span className="text-ink-dim">{t("admin.overviewLastHeartbeat", { time: relativeTime(node.lastHeartbeatAt) })}</span>
                </p>
              ))}
            {dbUnreachable.map((host) => (
              <p key={host.id} className="flex flex-wrap items-center gap-2">
                <Badge tone="bad">{t("admin.overviewDbUnreachable")}</Badge>
                <Link href="/admin/databases" className="text-ink hover:text-brand-soft">
                  {host.name}
                </Link>
                <span className="text-ink-dim">{t("admin.overviewChecked", { time: relativeTime(host.lastCheckedAt) })}</span>
              </p>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <div className="mt-6 grid animate-in gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("admin.overviewNodeCapacity")} description={t("admin.overviewNodeCapacityDesc")} />
            {capacities.length === 0 ? (
              <CardBody className="text-sm text-ink-muted">
                {t("admin.overviewNoNodes")}{" "}
                <Link href="/admin/nodes" className="text-brand-soft hover:underline">
                  {t("admin.overviewAddFirstNode")}
                </Link>
                .
              </CardBody>
            ) : (
              <ul className="divide-y divide-line-soft">
                {capacities.map(({ node, capacity }) => {
                  const nodeHealth = healthOf(node.lastHeartbeatAt);
                  return (
                    <li key={node.id} className="space-y-3 px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <Link href={`/admin/nodes/${node.id}`} className="text-sm font-medium text-ink hover:text-brand-soft">
                            {node.name}
                          </Link>
                          <Badge tone={NODE_HEALTH_TONE[nodeHealth]}>{t(NODE_HEALTH_KEY[nodeHealth])}</Badge>
                        </span>
                        <span className="flex items-center gap-2 text-xs text-ink-dim">
                          {node.maintenanceMode ? <StatusBadge state="suspended" /> : null}
                          {t("admin.overviewServersFreePorts", { servers: capacity.servers, ports: capacity.allocations.free })}
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Meter
                          label={t("admin.meterRam")}
                          used={capacity.memory.used}
                          total={capacity.memory.overallocated}
                          valueLabel={formatMib(capacity.memory.used)}
                        />
                        <Meter
                          label={t("admin.meterDisk")}
                          used={capacity.disk.used}
                          total={capacity.disk.overallocated}
                          valueLabel={formatMib(capacity.disk.used)}
                        />
                        <Meter
                          label={t("admin.meterCpu")}
                          used={capacity.cpu.used}
                          total={capacity.cpu.overallocated}
                          valueLabel={`${capacity.cpu.used}%`}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={t("admin.overviewQuickLinks")} />
            <CardBody className="grid gap-2 sm:grid-cols-2">
              {SHORTCUTS.map((shortcut) => (
                <Link
                  key={shortcut.href}
                  href={shortcut.href}
                  className="lift flex items-center gap-3 rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 hover:bg-surface-2"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-canvas text-brand-soft">
                    <shortcut.icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{t(shortcut.labelKey)}</span>
                    <span className="block truncate text-xs text-ink-dim">{t(shortcut.hintKey)}</span>
                  </span>
                </Link>
              ))}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title={t("admin.overviewAuditLog")}
            description={t("admin.overviewAuditDesc")}
            action={
              <Link href="/admin/activity" className="text-xs text-brand-soft hover:underline">
                {t("common.viewAll")}
              </Link>
            }
          />
          {activity.length === 0 ? (
            <CardBody className="text-xs text-ink-dim">{t("admin.overviewNothingRecorded")}</CardBody>
          ) : (
            <ul className="divide-y divide-line-soft">
              {activity.map((entry) => (
                <li key={entry.id} className="px-5 py-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-mono text-ink-muted">{entry.event}</span>
                    <span className="shrink-0 text-ink-dim">{relativeTime(entry.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-dim">
                    {entry.user?.username ?? t("admin.overviewSystem")}
                    {entry.ip ? ` · ${entry.ip}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

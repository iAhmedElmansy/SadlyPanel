import Link from "next/link";
import { Activity } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { PageHeader, StatCard } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, type Column } from "@/components/ui/table";
import { formatDate, parseJsonSafe, relativeTime } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

type ActivityRow = {
  id: number;
  event: string;
  actor: { id: number; username: string } | null;
  server: { uuidShort: string; name: string } | null;
  summary: string;
  ip: string | null;
  createdAt: Date;
};

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.activityMeta") };
}
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

/** Colour-codes an event by its prefix so failures stand out in the list. */
function toneFor(event: string): "ok" | "warn" | "bad" | "info" | "brand" | "neutral" {
  if (event.includes("delete") || event.includes("failure") || event.includes("failed")) return "bad";
  if (event.includes("suspend") || event.includes("rotate")) return "warn";
  if (event.startsWith("admin:")) return "brand";
  if (event.includes("create") || event.includes("success") || event.includes("complete")) return "ok";
  if (event.startsWith("auth:")) return "info";
  return "neutral";
}

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; event?: string; user?: string }>;
}) {
  await requireAdmin();
  const t = await getT();
  const { page: pageParam, event: eventFilter, user: userFilter } = await searchParams;

  const page = Math.max(1, Number(pageParam) || 1);
  const userId = Number(userFilter);

  const where = {
    ...(eventFilter ? { event: { startsWith: eventFilter } } : {}),
    ...(Number.isInteger(userId) && userId > 0 ? { userId } : {}),
  };

  const [entries, total, counts, users] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { id: true, username: true } },
        server: { select: { uuidShort: true, name: true } },
      },
    }),
    prisma.activityLog.count({ where }),
    prisma.activityLog.groupBy({ by: ["event"], _count: { event: true }, orderBy: { _count: { event: "desc" } }, take: 6 }),
    prisma.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true }, take: 200 }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const adminEvents = await prisma.activityLog.count({ where: { event: { startsWith: "admin:" } } });
  const failures = await prisma.activityLog.count({ where: { OR: [{ event: { contains: "fail" } }] } });

  const buildQuery = (overrides: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams();
    if (eventFilter) query.set("event", eventFilter);
    if (Number.isInteger(userId) && userId > 0) query.set("user", String(userId));
    query.set("page", String(page));
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined || value === "") query.delete(key);
      else query.set(key, String(value));
    }
    return `/admin/activity?${query.toString()}`;
  };

  const FILTERS = [
    { label: t("admin.activityFilterAll"), value: "" },
    { label: t("admin.activityFilterAdmin"), value: "admin:" },
    { label: t("admin.activityFilterAuth"), value: "auth:" },
    { label: t("admin.activityFilterServers"), value: "server:" },
  ];

  const rows: ActivityRow[] = entries.map((entry) => {
    const properties = parseJsonSafe<Record<string, unknown>>(entry.properties, {});
    const summary = Object.entries(properties)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
      .join(" · ");
    return {
      id: entry.id,
      event: entry.event,
      actor: entry.user,
      server: entry.server,
      summary,
      ip: entry.ip,
      createdAt: entry.createdAt,
    };
  });

  const columns: Column<ActivityRow>[] = [
    { key: "event", header: t("admin.activityColEvent"), render: (row) => <Badge tone={toneFor(row.event)}>{row.event}</Badge> },
    {
      key: "actor",
      header: t("admin.activityColActor"),
      className: "text-xs",
      render: (row) =>
        row.actor ? (
          <Link href={buildQuery({ user: row.actor.id, page: 1 })} className="text-ink-muted hover:text-brand-soft">
            {row.actor.username}
          </Link>
        ) : (
          <span className="text-ink-dim">{t("admin.activitySystem")}</span>
        ),
    },
    {
      key: "server",
      header: t("admin.activityColServer"),
      className: "text-xs",
      render: (row) =>
        row.server ? (
          <Link href={`/dashboard/servers/${row.server.uuidShort}`} className="text-ink-muted hover:text-brand-soft">
            {row.server.name}
          </Link>
        ) : (
          <span className="text-ink-dim">—</span>
        ),
    },
    {
      key: "summary",
      header: t("admin.activityColDetails"),
      className: "max-w-80 truncate font-mono text-[11px] text-ink-dim",
      render: (row) => (
        <span title={row.summary}>{row.summary || "—"}</span>
      ),
    },
    { key: "ip", header: t("admin.activityColIp"), className: "font-mono text-[11px] text-ink-dim", render: (row) => row.ip ?? "—" },
    {
      key: "createdAt",
      header: t("admin.activityColWhen"),
      className: "whitespace-nowrap text-xs text-ink-dim",
      render: (row) => <span title={formatDate(row.createdAt)}>{relativeTime(row.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader title={t("admin.activityTitle")} description={t("admin.activityDesc")} />

      <div className="mb-6 grid animate-in gap-4 sm:grid-cols-3">
        <StatCard label={t("admin.activityStatRecorded")} value={total} icon={<Activity className="size-4" />} />
        <StatCard label={t("admin.activityStatAdmin")} value={adminEvents} tone="brand" />
        <StatCard label={t("admin.activityStatFailures")} value={failures} tone={failures > 0 ? "bad" : "ok"} />
      </div>

      <Card>
        <CardHeader
          title={t("admin.activityAuditLog")}
          description={t("admin.activityPageOf", { page, pages })}
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map((filter) => (
                <Link
                  key={filter.label}
                  href={buildQuery({ event: filter.value || undefined, page: 1 })}
                  className={`badge ${
                    (eventFilter ?? "") === filter.value
                      ? "border-brand/40 bg-brand/12 text-brand-soft"
                      : "border-line bg-surface-2 text-ink-dim"
                  }`}
                >
                  {filter.label}
                </Link>
              ))}
            </div>
          }
        />

        {counts.length > 0 ? (
          <CardBody className="flex flex-wrap gap-1.5 border-b border-line-soft">
            {counts.map((row) => (
              <Link key={row.event} href={buildQuery({ event: row.event, page: 1 })} className="badge border-line bg-surface-2 text-ink-dim hover:text-ink">
                {row.event} · {row._count.event}
              </Link>
            ))}
          </CardBody>
        ) : null}

        <DataTable<ActivityRow>
          columns={columns}
          rows={rows}
          keyField="id"
          empty={
            <EmptyState
              icon={<Activity className="size-5" />}
              title={t("admin.activityNothing")}
              description={eventFilter || userFilter ? t("admin.activityNoMatch") : t("admin.activityEmptyHint")}
            />
          }
        />

        {pages > 1 ? (
          <CardBody className="flex items-center justify-between border-t border-line text-xs">
            <span className="text-ink-dim">
              {t("admin.activityRange", { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, total), total })}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={buildQuery({ page: page - 1 })} className="btn btn-ghost px-2 py-1 text-xs">
                  {t("common.previous")}
                </Link>
              ) : null}
              {page < pages ? (
                <Link href={buildQuery({ page: page + 1 })} className="btn btn-ghost px-2 py-1 text-xs">
                  {t("common.next")}
                </Link>
              ) : null}
            </div>
          </CardBody>
        ) : null}
      </Card>
    </>
  );
}

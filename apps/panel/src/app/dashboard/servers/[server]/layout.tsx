import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import { getServerContext } from "@/lib/server-context";
import { ServerSidebar } from "@/components/layout/server-sidebar";
import { StatusBadge } from "@/components/ui/badge";
import { connectionAddress } from "@/lib/services/network";
import { formatCpu, formatMib } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export default async function ServerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ server: string }>;
}) {
  const { server: identifier } = await params;
  const { server, access } = await getServerContext(identifier);
  const t = await getT();

  const base = `/dashboard/servers/${server.uuidShort}`;
  const primary = server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];
  const address = connectionAddress(server.bindings, primary);

  const sectionItems = [
    { href: base, label: t("dashboard.secConsole"), exact: true },
    { href: `${base}/files`, label: t("dashboard.secFiles") },
    { href: `${base}/databases`, label: t("dashboard.secDatabases") },
    { href: `${base}/network`, label: t("dashboard.secNetwork") },
    { href: `${base}/backups`, label: t("dashboard.secBackups") },
    { href: `${base}/schedules`, label: t("dashboard.secSchedules") },
    { href: `${base}/startup`, label: t("dashboard.secStartup") },
    { href: `${base}/users`, label: t("dashboard.secUsers") },
    { href: `${base}/settings`, label: t("dashboard.secSettings") },
  ];

  const header = (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="truncate text-lg font-semibold text-ink">{server.name}</h1>
        <StatusBadge state={server.suspended ? "suspended" : server.status} />
        {access.isAdmin && !access.isOwner ? (
          <span className="badge border-warn/40 bg-warn/12 text-warn">{t("dashboard.adminView")}</span>
        ) : null}
      </div>
      <p className="mt-1 flex flex-col gap-1 text-xs text-ink-dim">
        <span className="inline-flex items-center gap-1.5 font-mono text-ink-muted">
          <Copy className="size-3" />
          {address}
        </span>
        <span>{server.egg.nest.name} / {server.egg.name}</span>
        <span>{server.node.name}</span>
        <span className="font-mono">{server.uuidShort}</span>
      </p>
      <dl className="mt-3 flex gap-4 text-xs">
        <div>
          <dt className="text-ink-dim">{t("dashboard.memory")}</dt>
          <dd className="font-mono text-ink">{formatMib(server.memory)}</dd>
        </div>
        <div>
          <dt className="text-ink-dim">{t("dashboard.disk")}</dt>
          <dd className="font-mono text-ink">{formatMib(server.disk)}</dd>
        </div>
        <div>
          <dt className="text-ink-dim">{t("dashboard.cpu")}</dt>
          <dd className="font-mono text-ink">{formatCpu(server.cpu)}</dd>
        </div>
      </dl>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-8">
      <aside className="mb-6 lg:mb-0">
        <ServerSidebar items={sectionItems} header={header} />
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}

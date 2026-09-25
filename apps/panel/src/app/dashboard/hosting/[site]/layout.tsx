import type { ReactNode } from "react";
import { Copy, Database, FileCode2, Gauge, Globe2, HardDrive, LayoutDashboard, Lock, Settings } from "lucide-react";
import { getWebsiteContext } from "@/lib/services/hosting";
import { HostingSidebar } from "@/components/layout/hosting-sidebar";
import { StatusBadge } from "@/components/ui/badge";
import { connectionAddress } from "@/lib/services/network";
import { getT } from "@/lib/i18n/server";

export default async function WebsiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ site: string }>;
}) {
  const { site: identifier } = await params;
  const { server, access } = await getWebsiteContext(identifier);
  const t = await getT();

  const base = `/dashboard/hosting/${server.uuidShort}`;
  const primary = server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];
  const address = connectionAddress(server.bindings, primary);
  const primaryBinding = server.bindings.find((b) => b.isPrimary) ?? server.bindings[0];
  const https = primaryBinding ? primaryBinding.httpsMode !== "off" : false;

  const iconClass = "size-4";
  const items = [
    { href: base, label: t("dashboard.hostingNavOverview"), exact: true, icon: <LayoutDashboard className={iconClass} /> },
    { href: `${base}/files`, label: t("dashboard.hostingNavFiles"), icon: <FileCode2 className={iconClass} /> },
    { href: `${base}/databases`, label: t("dashboard.hostingNavDatabases"), icon: <Database className={iconClass} /> },
    { href: `${base}/domains`, label: t("dashboard.hostingNavDomains"), icon: <Globe2 className={iconClass} /> },
    { href: `${base}/backups`, label: t("dashboard.hostingNavBackups"), icon: <HardDrive className={iconClass} /> },
    { href: `${base}/logs`, label: t("dashboard.hostingNavLogs"), icon: <Gauge className={iconClass} /> },
    { href: `${base}/settings`, label: t("dashboard.hostingNavSettings"), icon: <Settings className={iconClass} /> },
  ];

  const header = (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="truncate text-lg font-semibold text-ink">{server.name}</h1>
        <StatusBadge state={server.suspended ? "suspended" : server.status} />
        {access.isAdmin && !access.isOwner ? (
          <span className="badge border-warn/40 bg-warn/12 text-warn">{t("dashboard.hostingAdminView")}</span>
        ) : null}
      </div>
      <p className="mt-1 flex flex-col gap-1 text-xs text-ink-dim">
        <span className="inline-flex items-center gap-1.5 font-mono text-ink-muted">
          {https ? <Lock className="size-3 text-ok" /> : <Copy className="size-3" />}
          {address}
        </span>
        <span>{server.webRuntime === "php" ? `PHP ${server.phpVersion ?? ""}` : t("dashboard.hostingRuntimeStatic")}</span>
        <span className="font-mono">{server.uuidShort}</span>
      </p>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-8">
      <aside className="mb-6 lg:mb-0">
        <HostingSidebar items={items} header={header} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

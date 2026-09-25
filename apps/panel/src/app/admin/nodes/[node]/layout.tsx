import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { healthOf } from "@/lib/services/heartbeat";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/layout/tabs";
import { relativeTime } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const HEALTH_TONE = { online: "ok", degraded: "warn", offline: "bad", unknown: "neutral" } as const;
const HEALTH_KEY = {
  online: "admin.healthOnline",
  degraded: "admin.healthDegraded",
  offline: "admin.healthOffline",
  unknown: "admin.healthUnknown",
} as const;

export default async function NodeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ node: string }>;
}) {
  await requirePermission("nodes.view");
  const t = await getT();
  const { node: nodeParam } = await params;
  const nodeId = Number(nodeParam);
  if (!Number.isInteger(nodeId)) notFound();

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) notFound();

  const health = healthOf(node.lastHeartbeatAt);
  const base = `/admin/nodes/${node.id}`;

  return (
    <>
      <Link href="/admin/nodes" className="mb-3 inline-flex items-center gap-1 text-xs text-ink-dim hover:text-ink">
        <ChevronLeft className="size-3.5" />
        {t("admin.nodeAllNodes")}
      </Link>

      <PageHeader
        title={node.name}
        description={`${node.scheme}://${node.fqdn}:${node.daemonPort}`}
        actions={
          <span className="flex items-center gap-2">
            <Badge tone={HEALTH_TONE[health]}>{t(HEALTH_KEY[health])}</Badge>
            <span className="text-xs text-ink-dim">{relativeTime(node.lastHeartbeatAt?.toISOString() ?? null)}</span>
          </span>
        }
      />

      <Tabs
        items={[
          { href: base, label: t("admin.nodeTabOverview") },
          { href: `${base}/ports`, label: t("admin.nodeTabPorts") },
          { href: `${base}/settings`, label: t("admin.nodeTabSettings") },
          { href: `${base}/install`, label: t("admin.nodeTabInstall") },
        ]}
      />

      {children}
    </>
  );
}

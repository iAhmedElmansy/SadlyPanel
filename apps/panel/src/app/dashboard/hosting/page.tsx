import Link from "next/link";
import type { Metadata } from "next";
import { Globe2, Lock, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listWebsitesForUser } from "@/lib/services/hosting";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCpu, formatMib } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Web hosting" };
export const dynamic = "force-dynamic";

export default async function HostingOverviewPage() {
  const t = await getT();
  const user = await requireUser();
  const websites = await listWebsitesForUser(user);
  const RUNTIME_LABEL: Record<string, string> = { html: t("dashboard.hostingRuntimeStatic"), php: "PHP" };

  return (
    <>
      <PageHeader
        title={t("dashboard.hostingTitle")}
        description={t("dashboard.hostingDescription")}
        actions={
          <Link href="/dashboard/hosting/new" className="btn btn-primary">
            <Plus className="size-4" />
            {t("dashboard.hostingCreate")}
          </Link>
        }
      />

      {websites.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Globe2 className="size-5" />}
            title={t("dashboard.hostingEmptyTitle")}
            description={t("dashboard.hostingEmptyDescription")}
            action={
              <Link href="/dashboard/hosting/new" className="btn btn-primary">
                <Plus className="size-4" />
                {t("dashboard.hostingCreate")}
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid animate-in gap-4 md:grid-cols-2 xl:grid-cols-3">
          {websites.map((site) => (
            <Link key={site.id} href={`/dashboard/hosting/${site.uuidShort}`} className="group block">
              <Card className="lift h-full">
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink group-hover:text-brand-soft">{site.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate font-mono text-xs text-ink-muted">
                        {site.httpsEnabled ? <Lock className="size-3 shrink-0 text-ok" /> : null}
                        {site.address}
                      </p>
                    </div>
                    <StatusBadge state={site.suspended ? "suspended" : site.status} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">{RUNTIME_LABEL[site.runtime] ?? site.runtime}</Badge>
                    {site.runtime === "php" && site.phpVersion ? (
                      <Badge tone="neutral">PHP {site.phpVersion}</Badge>
                    ) : null}
                    <span className="text-xs text-ink-dim">{site.nodeName}</span>
                  </div>

                  <dl className="grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs">
                    <div>
                      <dt className="text-ink-dim">{t("dashboard.hostingStatRam")}</dt>
                      <dd className="font-mono text-ink">{formatMib(site.memory)}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-dim">{t("dashboard.hostingStatDisk")}</dt>
                      <dd className="font-mono text-ink">{formatMib(site.disk)}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-dim">{t("dashboard.hostingStatCpu")}</dt>
                      <dd className="font-mono text-ink">{formatCpu(site.cpu)}</dd>
                    </div>
                  </dl>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { ExternalLink, Globe2, Lock } from "lucide-react";
import { getWebsiteContext } from "@/lib/services/hosting";
import { can } from "@/lib/auth/rbac";
import { connectionAddress } from "@/lib/services/network";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { OverviewControls } from "./overview-controls";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function WebsiteOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { site: identifier } = await params;
  const { created } = await searchParams;
  const { server, access } = await getWebsiteContext(identifier);
  const t = await getT();

  const primary = server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];
  const primaryBinding = server.bindings.find((b) => b.isPrimary) ?? server.bindings[0];
  const address = connectionAddress(server.bindings, primary);
  const https = primaryBinding ? primaryBinding.httpsMode !== "off" : false;
  const base = `/dashboard/hosting/${server.uuidShort}`;
  const publicUrl = primaryBinding?.kind === "http" ? `http${https ? "s" : ""}://${primaryBinding.hostname}` : null;

  return (
    <div className="space-y-6">
      {created ? <Alert tone="ok">{t("dashboard.provisioning")}</Alert> : null}
      {server.status === "install_failed" ? (
        <Alert tone="bad">{t("dashboard.installFailedWeb")}</Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={t("dashboard.websiteAddress")}
              action={
                publicUrl ? (
                  <a href={publicUrl} target="_blank" rel="noreferrer noopener" className="btn btn-ghost px-2 py-1 text-xs">
                    <ExternalLink className="size-3.5" />
                    {t("dashboard.visitSite")}
                  </a>
                ) : null
              }
            />
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2 font-mono text-sm text-ink">
                {https ? <Lock className="size-4 text-ok" /> : <Globe2 className="size-4 text-ink-dim" />}
                {address}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="brand">{server.webRuntime === "php" ? `PHP ${server.phpVersion ?? ""}` : t("dashboard.staticHtml")}</Badge>
                <Badge tone={https ? "brand" : "neutral"}>{https ? t("dashboard.httpsOn") : t("dashboard.httpsOff")}</Badge>
                {primaryBinding ? (
                  <Badge tone="neutral">{primaryBinding.hostname}</Badge>
                ) : (
                  <Link href={`${base}/domains`} className="text-xs text-brand-soft hover:underline">
                    {t("dashboard.attachDomain")}
                  </Link>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("dashboard.quickLinks")} />
            <CardBody className="grid gap-2 sm:grid-cols-2">
              <Link href={`${base}/files`} className="btn btn-ghost justify-start">{t("dashboard.manageFiles")}</Link>
              <Link href={`${base}/databases`} className="btn btn-ghost justify-start">{t("dashboard.databases")}</Link>
              <Link href={`${base}/domains`} className="btn btn-ghost justify-start">{t("dashboard.domainsSsl")}</Link>
              <Link href={`${base}/backups`} className="btn btn-ghost justify-start">{t("dashboard.backups")}</Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("dashboard.details")} />
            <CardBody>
              <dl className="grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-ink-dim">{t("dashboard.documentRoot")}</dt>
                  <dd className="font-mono text-ink">{server.documentRoot}</dd>
                </div>
                <div>
                  <dt className="text-ink-dim">{t("dashboard.node")}</dt>
                  <dd className="text-ink">{server.node.name}</dd>
                </div>
                <div>
                  <dt className="text-ink-dim">{t("dashboard.databases")}</dt>
                  <dd className="font-mono text-ink">{server._count.databases} / {server.databaseLimit}</dd>
                </div>
                <div>
                  <dt className="text-ink-dim">{t("dashboard.backups")}</dt>
                  <dd className="font-mono text-ink">{server._count.backups} / {server.backupLimit}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </div>

        <OverviewControls
          serverUuid={server.uuidShort}
          limits={{ memory: server.memory, disk: server.disk, cpu: server.cpu }}
          initialState={server.suspended ? "suspended" : server.status}
          canStart={can(access, "control.start")}
          canStop={can(access, "control.stop")}
          canRestart={can(access, "control.restart")}
        />
      </div>
    </div>
  );
}

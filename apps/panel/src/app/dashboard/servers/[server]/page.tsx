import "@xterm/xterm/css/xterm.css";
import { getServerContext } from "@/lib/server-context";
import { can } from "@/lib/auth/rbac";
import { ServerConsole } from "./console";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { connectionAddress } from "@/lib/services/network";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ServerConsolePage({ params }: { params: Promise<{ server: string }> }) {
  const { server: identifier } = await params;
  const { server, access } = await getServerContext(identifier);
  const t = await getT();

  const primary = server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];

  return (
    <div className="space-y-6">
      {server.status === "install_failed" ? (
        <Card className="border-bad/40">
          <CardHeader
            title={t("dashboard.installFailedTitle")}
            description={t("dashboard.installFailedDesc")}
          />
        </Card>
      ) : null}

      <ServerConsole
        serverUuid={server.uuidShort}
        initialState={server.suspended ? "suspended" : server.status}
        limits={{ memory: server.memory, disk: server.disk, cpu: server.cpu }}
        canConsole={can(access, "control.console")}
        canStart={can(access, "control.start")}
        canStop={can(access, "control.stop")}
        canRestart={can(access, "control.restart")}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("dashboard.connection")} />
          <CardBody>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-dim">{t("dashboard.address")}</dt>
                <dd className="truncate font-mono text-ink">{connectionAddress(server.bindings, primary)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-dim">{t("dashboard.primaryPort")}</dt>
                <dd className="font-mono text-ink">{primary ? `${primary.ip}:${primary.port}` : t("dashboard.unassigned")}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-dim">{t("dashboard.extraPorts")}</dt>
                <dd className="font-mono text-ink">{Math.max(0, server.allocations.length - 1)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("dashboard.service")} />
          <CardBody>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-dim">{t("dashboard.type")}</dt>
                <dd className="text-ink">{server.egg.nest.name} / {server.egg.name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-dim">{t("dashboard.image")}</dt>
                <dd className="truncate font-mono text-ink">{server.image}</dd>
              </div>
              {server.serviceKind === "webhost" ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-dim">{t("dashboard.runtime")}</dt>
                  <dd className="text-ink">
                    {server.webRuntime === "php" ? `PHP ${server.phpVersion ?? ""}` : t("dashboard.staticHtml")}
                  </dd>
                </div>
              ) : null}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("dashboard.featureLimits")} />
          <CardBody>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-ink-dim">{t("dashboard.databases")}</dt>
                <dd className="font-mono text-ink">
                  {server._count.databases} / {server.databaseLimit}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">{t("dashboard.backups")}</dt>
                <dd className="font-mono text-ink">
                  {server._count.backups} / {server.backupLimit}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">{t("dashboard.subusers")}</dt>
                <dd className="font-mono text-ink">{server._count.subusers}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

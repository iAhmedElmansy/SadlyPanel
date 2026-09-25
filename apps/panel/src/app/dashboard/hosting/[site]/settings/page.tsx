import { getWebsiteContext } from "@/lib/services/hosting";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n/server";
import { formatCpu, formatMib } from "@/lib/utils";
import { ServerSettingsPanel } from "@/app/dashboard/servers/[server]/settings/settings-panel";
import { RuntimeSettings } from "./runtime-settings";

export const dynamic = "force-dynamic";

export default async function WebsiteSettingsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: identifier } = await params;
  const { server, access } = await getWebsiteContext(identifier);
  const t = await getT();

  const primary = server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];

  return (
    <div className="space-y-6">
      <RuntimeSettings
        serverUuid={server.uuidShort}
        runtime={server.webRuntime ?? "html"}
        phpVersion={server.phpVersion}
        documentRoot={server.documentRoot}
        canEdit={can(access, "settings.rename")}
      />

      <ServerSettingsPanel
        serverUuid={server.uuidShort}
        name={server.name}
        description={server.description ?? ""}
        canRename={can(access, "settings.rename")}
        canReinstall={can(access, "settings.reinstall")}
        details={[
          { label: t("dashboard.hostingSettingsWebsiteUuid"), value: server.uuid },
          { label: t("dashboard.hostingSettingsShortId"), value: server.uuidShort },
          { label: t("dashboard.hostingSettingsNode"), value: `${server.node.name} (${server.node.fqdn})` },
          { label: t("dashboard.hostingSettingsRuntime"), value: server.webRuntime === "php" ? `PHP ${server.phpVersion ?? ""}` : t("dashboard.hostingSettingsStaticHtml") },
          { label: t("dashboard.hostingSettingsDocumentRoot"), value: server.documentRoot },
          { label: t("dashboard.hostingSettingsDockerImage"), value: server.image },
          { label: t("dashboard.hostingSettingsInternalPort"), value: primary ? `${primary.ip}:${primary.port}` : t("dashboard.hostingSettingsUnassigned") },
          { label: t("dashboard.hostingSettingsMemoryLimit"), value: formatMib(server.memory) },
          { label: t("dashboard.hostingSettingsDiskLimit"), value: formatMib(server.disk) },
          { label: t("dashboard.hostingSettingsCpuLimit"), value: formatCpu(server.cpu) },
          { label: t("dashboard.hostingSettingsInstallStatus"), value: server.installStatus },
          { label: t("dashboard.hostingSettingsOwner"), value: `${server.owner.username} <${server.owner.email}>` },
        ]}
      />
    </div>
  );
}

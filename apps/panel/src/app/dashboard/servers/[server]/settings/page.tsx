import { getServerContext } from "@/lib/server-context";
import { can } from "@/lib/auth/rbac";
import { formatCpu, formatMib } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { ServerSettingsPanel } from "./settings-panel";

export const dynamic = "force-dynamic";

export default async function ServerSettingsPage({ params }: { params: Promise<{ server: string }> }) {
  const { server: identifier } = await params;
  const { server, access } = await getServerContext(identifier);
  const t = await getT();

  const primary = server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];

  return (
    <ServerSettingsPanel
      serverUuid={server.uuidShort}
      name={server.name}
      description={server.description ?? ""}
      canRename={can(access, "settings.rename")}
      canReinstall={can(access, "settings.reinstall")}
      details={[
        { label: t("dashboard.serverSettingsDetailUuid"), value: server.uuid },
        { label: t("dashboard.serverSettingsDetailShortId"), value: server.uuidShort },
        { label: t("dashboard.serverSettingsDetailNode"), value: `${server.node.name} (${server.node.fqdn})` },
        { label: t("dashboard.serverSettingsDetailService"), value: `${server.egg.nest.name} / ${server.egg.name}` },
        { label: t("dashboard.serverSettingsDetailImage"), value: server.image },
        { label: t("dashboard.serverSettingsDetailPort"), value: primary ? `${primary.ip}:${primary.port}` : t("dashboard.serverSettingsDetailUnassigned") },
        { label: t("dashboard.serverSettingsDetailMemory"), value: formatMib(server.memory) },
        { label: t("dashboard.serverSettingsDetailDisk"), value: formatMib(server.disk) },
        { label: t("dashboard.serverSettingsDetailCpu"), value: formatCpu(server.cpu) },
        { label: t("dashboard.serverSettingsDetailSwap"), value: server.swap === -1 ? t("dashboard.serverSettingsDetailUnlimited") : formatMib(server.swap) },
        { label: t("dashboard.serverSettingsDetailIo"), value: String(server.io) },
        { label: t("dashboard.serverSettingsDetailCores"), value: server.threads || t("dashboard.serverSettingsDetailAnyCores") },
        { label: t("dashboard.serverSettingsDetailInstallStatus"), value: server.installStatus },
        { label: t("dashboard.serverSettingsDetailOwner"), value: `${server.owner.username} <${server.owner.email}>` },
      ]}
    />
  );
}

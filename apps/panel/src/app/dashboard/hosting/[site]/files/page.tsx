import { getWebsiteContext } from "@/lib/services/hosting";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FileManager } from "@/app/dashboard/servers/[server]/files/file-manager";

export const dynamic = "force-dynamic";

export default async function WebsiteFilesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: identifier } = await params;
  const { server, access } = await getWebsiteContext(identifier);
  const t = await getT();

  if (!can(access, "file.read")) {
    return (
      <Card>
        <CardHeader title={t("dashboard.hostingFilesNoAccessTitle")} />
        <CardBody className="text-sm text-ink-muted">{t("dashboard.hostingFilesNoAccessBody")}</CardBody>
      </Card>
    );
  }

  return (
    <FileManager
      serverUuid={server.uuidShort}
      canWrite={can(access, "file.write")}
      canDelete={can(access, "file.delete")}
      canArchive={can(access, "file.archive")}
    />
  );
}

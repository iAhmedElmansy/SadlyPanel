import { getServerContext } from "@/lib/server-context";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FileManager } from "./file-manager";

export const dynamic = "force-dynamic";

export default async function ServerFilesPage({ params }: { params: Promise<{ server: string }> }) {
  const { server: identifier } = await params;
  const { server, access } = await getServerContext(identifier);
  const t = await getT();

  if (!can(access, "file.read")) {
    return (
      <Card>
        <CardHeader title={t("dashboard.serverFilesNoAccessTitle")} />
        <CardBody className="text-sm text-ink-muted">{t("dashboard.serverFilesNoAccessBody")}</CardBody>
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

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { RoleManager } from "./role-manager";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.rolesMeta") };
}
export const dynamic = "force-dynamic";

/** Parses a role's permissions JSON into a string array, tolerating bad data. */
function parsePermissions(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((p): p is string => typeof p === "string");
  } catch {
    /* ignore */
  }
  return [];
}

export default async function AdminRolesPage() {
  await requirePermission("roles.manage");
  const t = await getT();

  const roles = await prisma.role.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader title={t("admin.rolesTitle")} description={t("admin.rolesDesc")} />

      <RoleManager
        roles={roles.map((role) => ({
          id: role.id,
          key: role.key,
          name: role.name,
          description: role.description,
          permissions: parsePermissions(role.permissions),
          isSystem: role.isSystem,
          isDefault: role.isDefault,
          sortOrder: role.sortOrder,
          userCount: role._count.users,
        }))}
      />

      <Card className="mt-6">
        <CardHeader title={t("admin.rolesHowTitle")} />
        <CardBody className="space-y-2 text-xs text-ink-muted">
          <p>{t("admin.rolesHowP1")}</p>
          <p className="text-ink-dim">{t("admin.rolesHowP2")}</p>
        </CardBody>
      </Card>
    </>
  );
}

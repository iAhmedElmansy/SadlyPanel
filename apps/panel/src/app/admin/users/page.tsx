import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { UserTable } from "./user-table";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.usersMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = await requirePermission("users.view");
  const t = await getT();

  const [users, plans] = await Promise.all([
    prisma.user.findMany({
      include: { _count: { select: { servers: true } }, plan: { select: { name: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader title={t("admin.usersTitle")} description={t("admin.usersDesc")} />
      <UserTable
        currentUserId={admin.id}
        plans={plans}
        users={users.map((user) => ({
          id: user.id,
          uuid: user.uuid,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          planId: user.planId,
          planName: user.plan?.name ?? null,
          serverCount: user._count.servers,
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          createdAt: user.createdAt.toISOString(),
        }))}
      />
    </>
  );
}

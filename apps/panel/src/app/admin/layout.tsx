import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { canAccessAdminArea, roleCan } from "@/lib/auth/rbac";
import { getBranding } from "@/lib/settings";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ADMIN_NAV } from "@/components/layout/nav-items";
import { getT } from "@/lib/i18n/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Admin-area gate: admins/rootAdmin (full access), the legacy support role, or
  // any custom role holding at least one global-area permission. Individual admin
  // pages still call requirePermission() for their own key, and server actions
  // enforce their permission — this layout only opens the shell and renders nav.
  const user = await requireUser();
  if (!canAccessAdminArea(user)) redirect("/dashboard");
  const branding = await getBranding();
  const t = await getT();

  // Admins see every section/item; everyone else only sees items whose `staff`
  // permission they hold (resolved through their role). Items without a `staff`
  // key are admin-only, and any section left with no visible items is dropped.
  const isFullAdmin = user.role === "admin" || user.rootAdmin;
  const nav = isFullAdmin
    ? ADMIN_NAV
    : ADMIN_NAV.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.staff && roleCan(user, item.staff)),
      })).filter((section) => section.items.length > 0);

  return (
    <DashboardShell
      user={{
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
      }}
      branding={{ siteName: branding.siteName, siteLogo: branding.siteLogo, siteAccent: branding.siteAccent }}
      nav={nav}
      footerLink={{ href: "/dashboard", label: t("admin.backToDashboard"), icon: "LayoutDashboard" }}
    >
      {children}
    </DashboardShell>
  );
}

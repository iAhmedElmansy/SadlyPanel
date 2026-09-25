import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/session";
import { getBranding } from "@/lib/settings";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { CLIENT_NAV } from "@/components/layout/nav-items";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const branding = await getBranding();
  const isAdmin = user.role === "admin";

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
      nav={CLIENT_NAV}
      footerLink={isAdmin ? { href: "/admin", label: "Admin area", icon: "ShieldCheck" } : undefined}
    >
      {children}
    </DashboardShell>
  );
}

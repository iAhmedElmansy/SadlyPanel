"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Boxes,
  ChevronDown,
  Cog,
  CreditCard,
  Database,
  FolderSymlink,
  Globe2,
  HardDrive,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  type LucideIcon,
  LogOut,
  MapPin,
  Menu,
  Network,
  Package,
  Server,
  ShieldCheck,
  Siren,
  Users,
  X,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { logoutAction } from "@/app/auth/actions";
import { ToastProvider } from "@/components/ui/toast";
import { NotificationBell } from "@/components/layout/notification-bell";
import { PreferencesMenu } from "@/components/layout/preferences-menu";
import { useT } from "@/lib/i18n/preferences";
import type { Translator } from "@/lib/i18n/translate";
import type { NavFooterLink, NavIcon, NavItem, NavSection } from "@/components/layout/nav-items";

export type { NavFooterLink, NavItem, NavSection } from "@/components/layout/nav-items";

/**
 * Resolves a serializable icon key (passed from server layouts, see nav-items.ts)
 * to a real lucide component on the client. Keep in sync with the NavIcon union.
 */
const ICONS: Record<NavIcon, LucideIcon> = {
  Activity,
  Boxes,
  Cog,
  CreditCard,
  Database,
  FolderSymlink,
  Globe2,
  HardDrive,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  Network,
  Package,
  Server,
  ShieldCheck,
  Siren,
  Users,
};

export interface NavUser {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  avatarUrl: string | null;
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavList({
  items,
  pathname,
  t,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  t: Translator;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item);
        const Icon = ICONS[item.icon];
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active ? "bg-brand/15 font-medium text-brand-soft" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.labelKey ? t(item.labelKey) : item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardShell({
  user,
  branding,
  nav,
  footerLink,
  children,
}: {
  user: NavUser;
  branding: { siteName: string; siteLogo: string; siteAccent: string };
  nav: NavSection[];
  footerLink?: NavFooterLink;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = user.role === "admin";

  // Clickable brand: from the admin area it returns to the dashboard; from the
  // dashboard it returns to the public landing page.
  const brandHref = pathname.startsWith("/admin") ? "/dashboard" : "/";

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link
        href={brandHref}
        onClick={() => setMobileOpen(false)}
        className="flex h-14 items-center gap-2.5 border-b border-line px-4 transition-colors hover:bg-surface-2"
      >
        {branding.siteLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.siteLogo} alt="" className="size-8 rounded-md object-cover" />
        ) : (
          <div
            className="grid size-8 place-items-center rounded-md text-xs font-bold text-white"
            style={{ background: branding.siteAccent }}
          >
            {branding.siteName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <span className="truncate text-sm font-semibold">{branding.siteName}</span>
      </Link>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {nav.map((section) => (
          <div key={section.title}>
            <p className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
              {section.titleKey ? t(section.titleKey) : section.title}
            </p>
            <NavList items={section.items} pathname={pathname} t={t} onNavigate={() => setMobileOpen(false)} />
          </div>
        ))}
      </nav>

      {footerLink ? (
        <div className="border-t border-line p-3">
          <Link
            href={footerLink.href}
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {(() => {
              const FooterIcon = ICONS[footerLink.icon];
              return <FooterIcon className="size-4 shrink-0" />;
            })()}
            <span className="truncate">{footerLink.labelKey ? t(footerLink.labelKey) : footerLink.label}</span>
          </Link>
        </div>
      ) : null}

      <form action={logoutAction} className="border-t border-line p-3">
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-bad"
        >
          <LogOut className="size-4" />
          {t("common.signOut")}
        </button>
      </form>
    </div>
  );

  return (
    <div className="app-shell min-h-screen">
      <aside className="rtl-sidebar fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-surface/80 backdrop-blur lg:block">
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <aside className="rtl-drawer absolute inset-y-0 left-0 w-64 border-r border-line bg-surface">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label={t("nav.closeNav")}
              className="absolute end-3 top-3.5 rounded p-1 text-ink-dim hover:text-ink"
            >
              <X className="size-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="rtl-content lg:pl-60">
        <header className="glass sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label={t("nav.openNav")}
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <div className="ms-auto flex items-center gap-3">
            {isAdmin ? (
              <span className="badge hidden border-brand/40 bg-brand/12 text-brand-soft sm:inline-flex">
                <ShieldCheck className="size-3" />
                {t("nav.admin")}
              </span>
            ) : null}

            <PreferencesMenu />

            <NotificationBell />

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 text-sm transition hover:bg-surface-2"
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="size-7 rounded-full object-cover" />
                ) : (
                  <span className="grid size-7 place-items-center rounded-full bg-brand/20 text-[11px] font-semibold text-brand-soft">
                    {initials(user.firstName, user.lastName)}
                  </span>
                )}
                <span className="hidden max-w-32 truncate sm:inline">{user.username}</span>
                <ChevronDown className="size-3.5 text-ink-dim" />
              </button>

              {menuOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div
                    role="menu"
                    className="panel-card absolute end-0 z-20 mt-2 w-56 overflow-hidden p-1 shadow-2xl"
                  >
                    <div className="border-b border-line px-3 py-2.5">
                      <p className="truncate text-sm font-medium">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="truncate text-xs text-ink-dim">{user.email}</p>
                    </div>
                    <Link
                      href="/dashboard/account"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded px-3 py-2 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink"
                    >
                      <Cog className="size-4" />
                      {t("nav.accountSettings")}
                    </Link>
                    {isAdmin ? (
                      <Link
                        href="/admin"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 rounded px-3 py-2 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink"
                      >
                        <ShieldCheck className="size-4" />
                        {t("nav.adminArea")}
                      </Link>
                    ) : null}
                    <form action={logoutAction}>
                      <button
                        type="submit"
                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-ink-muted hover:bg-surface-2 hover:text-bad"
                      >
                        <LogOut className="size-4" />
                        {t("common.signOut")}
                      </button>
                    </form>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>
    </div>
  );
}

/**
 * Navigation data. This module is imported by SERVER layouts and passed as props
 * into the CLIENT `DashboardShell`. React Server Components cannot serialize
 * functions (and lucide icons are component functions) across that boundary, so
 * `icon` here is a STRING KEY. The client shell resolves it to a real component
 * via its local ICONS map (see dashboard-shell.tsx). Keep the two in sync.
 *
 * Both navs are grouped into labelled sections (categories). The shell renders
 * one titled group per section. The admin layout filters items by staff
 * permission and drops any section left empty.
 */

export type NavIcon =
  | "Activity"
  | "Boxes"
  | "Cog"
  | "Database"
  | "FolderSymlink"
  | "Globe2"
  | "HardDrive"
  | "Layers"
  | "LayoutDashboard"
  | "LifeBuoy"
  | "MapPin"
  | "Network"
  | "Package"
  | "Server"
  | "ShieldCheck"
  | "Siren"
  | "Users";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  exact?: boolean;
  /** Staff permission that lets a non-admin "support" user see this admin item. Omitted = admin-only. */
  staff?: string;
  /** i18n key (e.g. "nav.myServers"); the shell translates it, falling back to `label`. */
  labelKey?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
  /** i18n key for the section title; the shell translates it, falling back to `title`. */
  titleKey?: string;
}

export interface NavFooterLink {
  href: string;
  label: string;
  icon: NavIcon;
  /** i18n key; the shell translates it, falling back to `label`. */
  labelKey?: string;
}

export const CLIENT_NAV: NavSection[] = [
  {
    title: "Home",
    titleKey: "nav.home",
    items: [{ href: "/dashboard", label: "Overview", labelKey: "nav.overviewItem", icon: "LayoutDashboard", exact: true }],
  },
  {
    title: "Servers",
    titleKey: "nav.servers",
    items: [
      { href: "/dashboard/servers", label: "My servers", labelKey: "nav.myServers", icon: "Server" },
      { href: "/dashboard/servers/new", label: "Create server", labelKey: "nav.createServer", icon: "Boxes" },
    ],
  },
  {
    title: "Web hosting",
    titleKey: "nav.webHosting",
    items: [{ href: "/dashboard/hosting", label: "Web Hosting", labelKey: "nav.webHostingItem", icon: "Globe2" }],
  },
  {
    title: "Catalog",
    titleKey: "nav.catalog",
    items: [
      { href: "/dashboard/plans", label: "Plans", labelKey: "nav.plans", icon: "Layers" },
      { href: "/dashboard/packages", label: "Packages", labelKey: "nav.packages", icon: "Package" },
    ],
  },
  {
    title: "Support",
    titleKey: "nav.support",
    items: [
      { href: "/dashboard/tickets", label: "Tickets", labelKey: "nav.tickets", icon: "LifeBuoy" },
      { href: "/status", label: "Service status", labelKey: "nav.serviceStatus", icon: "Siren" },
    ],
  },
  {
    title: "Account",
    titleKey: "nav.account",
    items: [{ href: "/dashboard/account", label: "Account", labelKey: "nav.accountItem", icon: "Cog" }],
  },
];

export const ADMIN_NAV: NavSection[] = [
  {
    title: "Overview",
    titleKey: "nav.overview",
    items: [
      { href: "/admin", label: "Admin overview", labelKey: "nav.adminOverview", icon: "ShieldCheck", exact: true },
      { href: "/admin/activity", label: "Activity", labelKey: "nav.activity", icon: "Activity" },
    ],
  },
  {
    title: "Infrastructure",
    titleKey: "nav.infrastructure",
    items: [
      { href: "/admin/nodes", label: "Nodes", labelKey: "nav.nodes", icon: "HardDrive", staff: "nodes.view" },
      { href: "/admin/locations", label: "Locations", labelKey: "nav.locations", icon: "MapPin", staff: "nodes.view" },
      { href: "/admin/allocations", label: "Ports", labelKey: "nav.ports", icon: "Network" },
      { href: "/admin/databases", label: "Database hosts", labelKey: "nav.databaseHosts", icon: "Database" },
    ],
  },
  {
    title: "Servers & services",
    titleKey: "nav.serversServices",
    items: [
      { href: "/admin/servers", label: "All servers", labelKey: "nav.allServers", icon: "Server", staff: "servers.view" },
      { href: "/admin/eggs", label: "Services", labelKey: "nav.services", icon: "Boxes" },
      { href: "/admin/mounts", label: "Mounts", labelKey: "nav.mounts", icon: "FolderSymlink" },
    ],
  },
  {
    title: "Billing",
    titleKey: "nav.billing",
    items: [
      { href: "/admin/plans", label: "Plans", labelKey: "nav.plans", icon: "Layers", staff: "plans.manage" },
      { href: "/admin/packages", label: "Packages", labelKey: "nav.packages", icon: "Package", staff: "plans.manage" },
    ],
  },
  {
    title: "Support",
    titleKey: "nav.support",
    items: [
      { href: "/admin/tickets", label: "Tickets", labelKey: "nav.tickets", icon: "LifeBuoy", staff: "tickets.view" },
      { href: "/admin/status", label: "Status & incidents", labelKey: "nav.status", icon: "Siren" },
    ],
  },
  {
    title: "System",
    titleKey: "nav.system",
    items: [
      { href: "/admin/users", label: "Users", labelKey: "nav.users", icon: "Users", staff: "users.view" },
      { href: "/admin/roles", label: "Roles", labelKey: "nav.roles", icon: "ShieldCheck", staff: "roles.manage" },
      { href: "/admin/domains", label: "Domains", labelKey: "nav.domains", icon: "Globe2" },
      { href: "/admin/settings", label: "Site settings", labelKey: "nav.siteSettings", icon: "Cog" },
    ],
  },
];

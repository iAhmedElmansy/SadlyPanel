"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

export interface HostingNavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  exact?: boolean;
}

function isActive(pathname: string, item: HostingNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Dedicated sub-sidebar for a single website. Mirrors ServerSidebar but is
 * hosting-flavoured: it links back to the website list and leads each section
 * with an icon so the experience reads distinctly from the game panel tabs.
 */
export function HostingSidebar({
  items,
  header,
  backHref = "/dashboard/hosting",
  backLabel,
}: {
  items: HostingNavItem[];
  header: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  const pathname = usePathname();
  const t = useT();

  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-20">
      <Link href={backHref} className="inline-flex items-center gap-1 text-xs text-ink-dim hover:text-ink">
        <ChevronLeft className="size-3.5" />
        {backLabel ?? t("common.allWebsites")}
      </Link>

      {header}

      <nav className="panel-card p-2">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-brand/15 font-medium text-brand-soft"
                      : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {item.icon ? <span className="shrink-0 text-ink-dim">{item.icon}</span> : null}
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

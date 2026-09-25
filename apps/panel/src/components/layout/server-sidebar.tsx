"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

export interface ServerNavItem {
  href: string;
  label: string;
  exact?: boolean;
}

function isActive(pathname: string, item: ServerNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function ServerSidebar({ items, header }: { items: ServerNavItem[]; header: ReactNode }) {
  const pathname = usePathname();
  const t = useT();

  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-20">
      <Link
        href="/dashboard/servers"
        className="inline-flex items-center gap-1 text-xs text-ink-dim hover:text-ink"
      >
        <ChevronLeft className="size-3.5" />
        {t("common.backToServers")}
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

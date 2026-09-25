"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface TabItem {
  href: string;
  label: string;
  hidden?: boolean;
}

export function Tabs({ items }: { items: TabItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="no-scrollbar -mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1">
      {items
        .filter((item) => !item.hidden)
        .map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors",
                active
                  ? "border-brand font-medium text-brand-soft"
                  : "border-transparent text-ink-muted hover:border-line hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          );
        })}
    </nav>
  );
}

export interface SegmentItem {
  key: string;
  label: string;
  hidden?: boolean;
}

/** Stateful, non-navigating tabs for switching panes inside a card. */
export function SegmentedTabs({
  items,
  active,
  onChange,
  className,
}: {
  items: SegmentItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("no-scrollbar flex gap-1 overflow-x-auto rounded-lg border border-line bg-canvas p-1", className)}>
      {items
        .filter((item) => !item.hidden)
        .map((item) => {
          const selected = item.key === active;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(item.key)}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                selected ? "bg-brand/18 text-brand-soft" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {item.label}
            </button>
          );
        })}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";
import {
  getNotificationSummaryAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  type NotificationItem,
} from "@/app/dashboard/notifications/actions";

/**
 * Topbar notifications bell. Client component: it hydrates from the props the
 * server passes (`initialItems` / `initialUnread`) and refreshes itself from
 * `getNotificationSummaryAction` when the panel is opened, so the count stays
 * current without a full page reload. Renders a self-contained popover mirroring
 * the account menu pattern in the dashboard shell.
 */
export function NotificationBell({
  initialItems = [],
  initialUnread = 0,
}: {
  initialItems?: NotificationItem[];
  initialUnread?: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = () => {
    startTransition(async () => {
      const summary = await getNotificationSummaryAction();
      setItems(summary.items);
      setUnread(summary.unread);
    });
  };

  // Refresh whenever the popover is opened.
  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markOne = (id: number) => {
    setItems((current) => current.map((row) => (row.id === id ? { ...row, readAt: new Date().toISOString() } : row)));
    setUnread((count) => Math.max(0, count - 1));
    startTransition(async () => {
      await markNotificationReadAction(id);
    });
  };

  const markAll = () => {
    setItems((current) => current.map((row) => (row.readAt ? row : { ...row, readAt: new Date().toISOString() })));
    setUnread(0);
    startTransition(async () => {
      await markAllNotificationsReadAction();
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={unread > 0 ? t("common.notificationsUnread", { count: unread }) : t("common.notifications")}
        className="relative rounded-md p-1.5 text-ink-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <Bell className="size-5" />
        {unread > 0 ? (
          <span className="absolute -end-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="panel-card absolute end-0 z-20 mt-2 w-80 overflow-hidden p-0 shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <p className="text-sm font-semibold text-ink">{t("common.notifications")}</p>
              <button
                type="button"
                onClick={markAll}
                disabled={pending || unread === 0}
                className="inline-flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
              >
                <CheckCheck className="size-3.5" />
                {t("common.markAllRead")}
              </button>
            </div>

            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-ink-muted">
                {pending ? t("common.loading") : t("common.noNotifications")}
              </div>
            ) : (
              <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                {items.map((item) => {
                  const isUnread = item.readAt === null;
                  const inner = (
                    <div className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className={cn("mt-1 size-2 shrink-0 rounded-full", isUnread ? "bg-brand" : "bg-transparent")}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm", isUnread ? "font-medium text-ink" : "text-ink-muted")}>
                          {item.title}
                        </p>
                        {item.body ? <p className="truncate text-xs text-ink-dim">{item.body}</p> : null}
                        <p className="mt-0.5 text-[11px] text-ink-dim">{relativeTime(item.createdAt)}</p>
                      </div>
                    </div>
                  );
                  return (
                    <li key={item.id}>
                      {item.url ? (
                        <Link
                          href={item.url}
                          onClick={() => {
                            if (isUnread) markOne(item.id);
                            setOpen(false);
                          }}
                          className="block px-4 py-3 transition-colors hover:bg-surface-2"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => isUnread && markOne(item.id)}
                          className="block w-full px-4 py-3 text-start transition-colors hover:bg-surface-2"
                        >
                          {inner}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-t border-line px-4 py-2.5">
              <Link
                href="/dashboard/notifications"
                onClick={() => setOpen(false)}
                className="block text-center text-xs font-medium text-brand-soft hover:underline"
              >
                {t("common.viewAll")}
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

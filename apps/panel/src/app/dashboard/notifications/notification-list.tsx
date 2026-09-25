"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck, ExternalLink } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/preferences";
import { cn, relativeTime } from "@/lib/utils";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  type NotificationItem,
} from "./actions";

const PAGE_SIZE = 12;

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const t = useT();
  const { report } = useToast();
  const [rows, setRows] = useState(items);
  const [pending, startTransition] = useTransition();
  const { page, setPage, pageCount, pageItems } = usePagination(rows, PAGE_SIZE);

  const unread = rows.filter((row) => row.readAt === null).length;

  const markOne = (id: number) => {
    setRows((current) =>
      current.map((row) => (row.id === id && row.readAt === null ? { ...row, readAt: new Date().toISOString() } : row)),
    );
    startTransition(async () => {
      await markNotificationReadAction(id);
    });
  };

  const markAll = () => {
    startTransition(async () => {
      const result = await markAllNotificationsReadAction();
      report(result);
      setRows((current) => current.map((row) => (row.readAt ? row : { ...row, readAt: new Date().toISOString() })));
    });
  };

  return (
    <Card>
      <CardHeader
        title={t("dashboard.notifTitle")}
        description={unread > 0 ? t("dashboard.notifUnreadCount", { count: String(unread) }) : t("dashboard.notifAllCaughtUp")}
        action={
          <Button variant="ghost" onClick={markAll} disabled={pending || unread === 0}>
            <CheckCheck className="size-3.5" />
            {t("dashboard.notifMarkAllRead")}
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-5" />}
          title={t("dashboard.notifEmptyTitle")}
          description={t("dashboard.notifEmptyDescription")}
        />
      ) : (
        <ul className="divide-y divide-line">
          {pageItems.map((item) => {
            const isUnread = item.readAt === null;
            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-start gap-3 px-5 py-4 transition-colors",
                  isUnread ? "bg-brand/8" : "bg-transparent",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    isUnread ? "bg-brand" : "bg-transparent",
                  )}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn("truncate text-sm", isUnread ? "font-semibold text-ink" : "text-ink-muted")}>
                      {item.title}
                    </p>
                    <Badge tone="neutral">{item.type}</Badge>
                  </div>
                  {item.body ? <p className="text-xs text-ink-muted">{item.body}</p> : null}
                  <div className="flex flex-wrap items-center gap-3 pt-0.5">
                    <span className="text-xs text-ink-dim">{relativeTime(item.createdAt)}</span>
                    {item.url ? (
                      <Link
                        href={item.url}
                        onClick={() => isUnread && markOne(item.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-soft hover:underline"
                      >
                        <ExternalLink className="size-3" />
                        {t("common.view")}
                      </Link>
                    ) : null}
                  </div>
                </div>
                {isUnread ? (
                  <button
                    type="button"
                    onClick={() => markOne(item.id)}
                    disabled={pending}
                    title={t("dashboard.notifMarkRead")}
                    aria-label={t("dashboard.notifMarkRead")}
                    className="shrink-0 rounded p-1 text-ink-dim transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-40"
                  >
                    <Check className="size-3.5" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {pageCount > 1 ? (
        <CardBody className="flex justify-end border-t border-line">
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </CardBody>
      ) : null}
    </Card>
  );
}

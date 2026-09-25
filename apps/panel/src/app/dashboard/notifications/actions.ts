"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  countUnread,
  listNotifications,
  markAllRead,
  markRead,
} from "@/lib/services/notifications";

/** Shape understood by the toast `report()` helper. */
export interface NotificationActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

/** A notification serialised for the client (Date -> ISO string). */
export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationSummary {
  unread: number;
  items: NotificationItem[];
}

function serialise(notification: {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationItem {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    url: notification.url,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString(),
  };
}

/** Marks a single notification read for the current user. */
export async function markNotificationReadAction(id: number): Promise<NotificationActionState> {
  const user = await requireUser();
  if (!Number.isInteger(id)) return { error: "Invalid notification." };

  await markRead(user.id, id);
  revalidatePath("/dashboard/notifications");
  return { ok: true };
}

/** Marks all of the current user's notifications read. */
export async function markAllNotificationsReadAction(): Promise<NotificationActionState> {
  const user = await requireUser();
  const count = await markAllRead(user.id);
  revalidatePath("/dashboard/notifications");
  return count > 0 ? { message: `Marked ${count} notification(s) as read.` } : { ok: true };
}

/**
 * Loads a fresh summary (unread count + most recent items) for the topbar bell.
 * Scoped to the current user; safe to call from a client component on mount.
 */
export async function getNotificationSummaryAction(limit = 8): Promise<NotificationSummary> {
  const user = await requireUser();
  const [unread, items] = await Promise.all([
    countUnread(user.id),
    listNotifications(user.id, { limit }),
  ]);
  return { unread, items: items.map(serialise) };
}

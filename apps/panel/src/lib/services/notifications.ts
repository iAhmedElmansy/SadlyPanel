import type { Notification } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * In-app notifications service.
 *
 * Thin, reusable helpers over the `Notification` model so other features can
 * emit notifications (`createNotification`) and the notifications centre can
 * read/mark them. Every read/write helper that touches a specific user's
 * notifications is scoped by `userId` so a user can never see or mutate
 * another user's notifications.
 */

export interface CreateNotificationInput {
  userId: number;
  /** Free-form category, e.g. "server", "billing", "security". */
  type: string;
  title: string;
  /** Optional longer body. Defaults to "" to match the schema default. */
  body?: string;
  /** Optional in-app link the notification points at. */
  url?: string | null;
}

/** Inserts a notification. Reusable by any feature that needs to notify a user. */
export function createNotification(input: CreateNotificationInput): Promise<Notification> {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      url: input.url ?? null,
    },
  });
}

export interface ListNotificationsOptions {
  /** Max rows to return (default 50). */
  limit?: number;
  /** When true, only unread notifications are returned. */
  unreadOnly?: boolean;
}

/** Lists a user's notifications, newest first. */
export function listNotifications(
  userId: number,
  { limit = 50, unreadOnly = false }: ListNotificationsOptions = {},
): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Counts a user's unread notifications. */
export function countUnread(userId: number): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/**
 * Marks a single notification read, scoped to its owner. Returns true when a
 * row was updated (owned + previously unread), false otherwise. Never touches
 * notifications belonging to another user.
 */
export async function markRead(userId: number, id: number): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count > 0;
}

/** Marks all of a user's unread notifications read. Returns the number updated. */
export async function markAllRead(userId: number): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

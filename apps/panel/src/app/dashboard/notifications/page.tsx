import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { listNotifications } from "@/lib/services/notifications";
import { getT } from "@/lib/i18n/server";
import { NotificationList } from "./notification-list";
import type { NotificationItem } from "./actions";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const t = await getT();
  const user = await requireUser();
  const notifications = await listNotifications(user.id, { limit: 200 });

  const items: NotificationItem[] = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    url: n.url,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader title={t("dashboard.notifTitle")} description={t("dashboard.notifPageDescription")} />
      <NotificationList items={items} />
    </>
  );
}

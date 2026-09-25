import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { TicketQueue } from "./ticket-queue";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.ticketsMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  await requireStaff("tickets.view");
  const t = await getT();

  const [tickets, staff] = await Promise.all([
    prisma.ticket.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { username: true } },
        assignedTo: { select: { id: true, username: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ["admin", "support"] }, isActive: true },
      select: { id: true, username: true },
      orderBy: { username: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader title={t("admin.ticketsTitle")} description={t("admin.ticketsDesc")} />
      <TicketQueue
        staff={staff}
        tickets={tickets.map((ticket) => ({
          uuid: ticket.uuid,
          subject: ticket.subject,
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status,
          requester: ticket.user.username,
          assigneeId: ticket.assignedTo?.id ?? null,
          assignee: ticket.assignedTo?.username ?? null,
          messageCount: ticket._count.messages,
          updatedAt: ticket.updatedAt.toISOString(),
        }))}
      />
    </>
  );
}

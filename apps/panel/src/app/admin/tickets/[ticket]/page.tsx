import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { staffCan } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { StaffTicketDetail } from "./staff-ticket-detail";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.ticketDetailMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminTicketDetailPage({ params }: { params: Promise<{ ticket: string }> }) {
  const staff = await requireStaff("tickets.view");
  const t = await getT();
  const { ticket: ticketUuid } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { uuid: ticketUuid },
    include: {
      user: { select: { username: true, email: true } },
      assignedTo: { select: { id: true, username: true } },
      // Staff see every message, including internal notes.
      messages: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { firstName: true, lastName: true, username: true, role: true } } },
      },
    },
  });
  if (!ticket) notFound();

  const staffUsers = await prisma.user.findMany({
    where: { role: { in: ["admin", "support"] }, isActive: true },
    select: { id: true, username: true },
    orderBy: { username: "asc" },
  });

  return (
    <StaffTicketDetail
      canReply={staffCan(staff, "tickets.reply")}
      canManage={staffCan(staff, "tickets.manage")}
      staff={staffUsers}
      ticket={{
        uuid: ticket.uuid,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        requester: ticket.user.username,
        requesterEmail: ticket.user.email,
        assigneeId: ticket.assignedTo?.id ?? null,
        createdAt: ticket.createdAt.toISOString(),
        messages: ticket.messages.map((message) => ({
          id: message.id,
          body: message.body,
          isInternal: message.isInternal,
          createdAt: message.createdAt.toISOString(),
          authorName: message.user
            ? `${message.user.firstName} ${message.user.lastName}`.trim() || message.user.username
            : t("admin.ticketUnknownAuthor"),
          isStaff: message.user ? message.user.role === "admin" || message.user.role === "support" : false,
        })),
      }}
    />
  );
}

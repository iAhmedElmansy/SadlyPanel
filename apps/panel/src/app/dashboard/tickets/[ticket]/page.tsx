import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { TicketDetail } from "./ticket-detail";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dashboard.ticketDetailMetaTitle") };
}
export const dynamic = "force-dynamic";

export default async function TicketDetailPage({ params }: { params: Promise<{ ticket: string }> }) {
  const user = await requireUser();
  const { ticket: ticketUuid } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { uuid: ticketUuid },
    include: {
      // Owners never see internal notes.
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { firstName: true, lastName: true, role: true } } },
      },
    },
  });

  if (!ticket || ticket.userId !== user.id) notFound();

  return (
    <TicketDetail
      currentUserId={user.id}
      ticket={{
        uuid: ticket.uuid,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt.toISOString(),
        messages: ticket.messages.map((message) => ({
          id: message.id,
          body: message.body,
          createdAt: message.createdAt.toISOString(),
          authorId: message.userId,
          authorName: message.user ? `${message.user.firstName} ${message.user.lastName}` : "SPanel",
          isStaff: message.user ? message.user.role === "admin" || message.user.role === "support" : true,
        })),
      }}
    />
  );
}

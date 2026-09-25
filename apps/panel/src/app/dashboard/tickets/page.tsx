import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { TicketsList } from "./tickets-list";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dashboard.ticketsMetaTitle") };
}
export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const user = await requireUser();
  const t = await getT();

  const tickets = await prisma.ticket.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      uuid: true,
      subject: true,
      category: true,
      priority: true,
      status: true,
      updatedAt: true,
    },
  });

  return (
    <>
      <PageHeader title={t("dashboard.ticketsPageTitle")} description={t("dashboard.ticketsPageDescription")} />
      <TicketsList
        tickets={tickets.map((ticket) => ({
          uuid: ticket.uuid,
          subject: ticket.subject,
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status,
          updatedAt: ticket.updatedAt.toISOString(),
        }))}
      />
    </>
  );
}

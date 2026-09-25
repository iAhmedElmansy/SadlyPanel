"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity";
import { uuid as newUuid } from "@/lib/crypto";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, type TicketStatus } from "@/lib/constants";

export interface TicketActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  /** Set on successful creation so the client can redirect to the new ticket. */
  createdUuid?: string;
}

function fieldErrors(issues: { path: (string | number)[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

const SUBJECT_MAX = 150;
const BODY_MAX = 5000;

const createSchema = z.object({
  subject: z.string().trim().min(3, "Subject must be at least 3 characters.").max(SUBJECT_MAX, "Subject is too long."),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  body: z.string().trim().min(1, "Message body is required.").max(BODY_MAX, "Message is too long."),
});

const replySchema = z.object({
  body: z.string().trim().min(1, "Message body is required.").max(BODY_MAX, "Message is too long."),
});

/** Best-effort notification insert; never blocks the action that triggered it. */
async function notify(userId: number, type: string, title: string, body: string, url: string): Promise<void> {
  try {
    await prisma.notification.create({ data: { userId, type, title, body, url } });
  } catch {
    // Notification failures must not break ticket handling.
  }
}

/**
 * Creates a ticket owned by the current user, plus its first message. The
 * ticket opens in "open" status. Notifies assigned staff on the ticket queue
 * is not applicable at creation (no assignee yet).
 */
export async function createTicketAction(_prev: TicketActionState, formData: FormData): Promise<TicketActionState> {
  const user = await requireUser();

  const parsed = createSchema.safeParse({
    subject: formData.get("subject"),
    category: formData.get("category"),
    priority: formData.get("priority"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error.issues), error: "Please fix the highlighted fields." };
  }

  const ticket = await prisma.ticket.create({
    data: {
      uuid: newUuid(),
      userId: user.id,
      subject: parsed.data.subject,
      category: parsed.data.category,
      priority: parsed.data.priority,
      status: "open",
      messages: {
        create: { userId: user.id, body: parsed.data.body, isInternal: false },
      },
    },
  });

  await logActivity({
    event: "ticket:create",
    userId: user.id,
    properties: { ticket: ticket.uuid, category: parsed.data.category, priority: parsed.data.priority },
  });

  revalidatePath("/dashboard/tickets");
  return { success: "Ticket created.", createdUuid: ticket.uuid };
}

/**
 * Adds a reply from the ticket owner. Reopens resolved tickets to "pending";
 * a reply on a closed ticket is refused. Never creates internal notes.
 */
export async function replyTicketAction(_prev: TicketActionState, formData: FormData): Promise<TicketActionState> {
  const user = await requireUser();
  const ticketUuid = String(formData.get("ticket") ?? "");

  const ticket = await prisma.ticket.findUnique({
    where: { uuid: ticketUuid },
    select: { id: true, userId: true, status: true, assignedToId: true, subject: true },
  });
  if (!ticket || ticket.userId !== user.id) return { error: "Ticket not found." };
  if (ticket.status === "closed") return { error: "This ticket is closed. Open a new ticket instead." };

  const parsed = replySchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error.issues), error: "Please fix the highlighted fields." };
  }

  // A user reply reopens a resolved ticket to "pending"; otherwise "open".
  const nextStatus: TicketStatus = ticket.status === "resolved" ? "pending" : "open";

  await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId: ticket.id, userId: user.id, body: parsed.data.body, isInternal: false },
    }),
    prisma.ticket.update({ where: { id: ticket.id }, data: { status: nextStatus } }),
  ]);

  await logActivity({ event: "ticket:reply", userId: user.id, properties: { ticket: ticketUuid } });

  // Notify the assigned staff member, if any, that the user responded.
  if (ticket.assignedToId) {
    await notify(
      ticket.assignedToId,
      "ticket.reply",
      "New ticket reply",
      `${user.username} replied to "${ticket.subject}".`,
      `/admin/tickets/${ticketUuid}`,
    );
  }

  revalidatePath(`/dashboard/tickets/${ticketUuid}`);
  revalidatePath("/dashboard/tickets");
  return { success: "Reply sent." };
}

/** Lets the owner close their own ticket. */
export async function closeTicketAction(ticketUuid: string): Promise<TicketActionState> {
  const user = await requireUser();

  const ticket = await prisma.ticket.findUnique({
    where: { uuid: ticketUuid },
    select: { id: true, userId: true, status: true },
  });
  if (!ticket || ticket.userId !== user.id) return { error: "Ticket not found." };
  if (ticket.status === "closed") return { error: "Ticket is already closed." };

  await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "closed" } });
  await logActivity({ event: "ticket:close", userId: user.id, properties: { ticket: ticketUuid } });

  revalidatePath(`/dashboard/tickets/${ticketUuid}`);
  revalidatePath("/dashboard/tickets");
  return { success: "Ticket closed." };
}

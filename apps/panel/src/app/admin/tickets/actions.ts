"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth/session";
import { staffCan } from "@/lib/auth/rbac";
import { logActivity } from "@/lib/activity";
import { TICKET_PRIORITIES, TICKET_STATUSES, type TicketStatus } from "@/lib/constants";

export interface StaffTicketState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

function fieldErrors(issues: { path: (string | number)[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

const BODY_MAX = 5000;

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

async function loadTicket(ticketUuid: string) {
  return prisma.ticket.findUnique({
    where: { uuid: ticketUuid },
    select: { id: true, userId: true, status: true, subject: true },
  });
}

/**
 * Staff reply visible to the owner. Requires "tickets.reply". Moves the ticket
 * to "waiting_user" (unless closed, which is refused). Notifies the owner.
 */
export async function staffReplyAction(_prev: StaffTicketState, formData: FormData): Promise<StaffTicketState> {
  const staff = await requireStaff("tickets.reply");
  const ticketUuid = String(formData.get("ticket") ?? "");

  const ticket = await loadTicket(ticketUuid);
  if (!ticket) return { error: "Ticket not found." };
  if (ticket.status === "closed") return { error: "Reopen the ticket before replying." };

  const parsed = replySchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error.issues), error: "Please fix the highlighted fields." };
  }

  await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId: ticket.id, userId: staff.id, body: parsed.data.body, isInternal: false },
    }),
    prisma.ticket.update({ where: { id: ticket.id }, data: { status: "waiting_user" } }),
  ]);

  await logActivity({ event: "admin:ticket.reply", userId: staff.id, properties: { ticket: ticketUuid } });
  await notify(
    ticket.userId,
    "ticket.reply",
    "Support replied to your ticket",
    `We replied to "${ticket.subject}".`,
    `/dashboard/tickets/${ticketUuid}`,
  );

  revalidatePath(`/admin/tickets/${ticketUuid}`);
  revalidatePath("/admin/tickets");
  return { success: "Reply sent." };
}

/**
 * Adds an internal note (never shown to the owner). Requires "tickets.reply".
 * Does not change the ticket status.
 */
export async function addInternalNoteAction(_prev: StaffTicketState, formData: FormData): Promise<StaffTicketState> {
  const staff = await requireStaff("tickets.reply");
  const ticketUuid = String(formData.get("ticket") ?? "");

  const ticket = await loadTicket(ticketUuid);
  if (!ticket) return { error: "Ticket not found." };

  const parsed = replySchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error.issues), error: "Please fix the highlighted fields." };
  }

  await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, userId: staff.id, body: parsed.data.body, isInternal: true },
  });

  await logActivity({ event: "admin:ticket.note", userId: staff.id, properties: { ticket: ticketUuid } });

  revalidatePath(`/admin/tickets/${ticketUuid}`);
  return { success: "Internal note added." };
}

const manageSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  // "" clears the assignee; otherwise a numeric user id string.
  assignedTo: z.string().optional(),
});

/**
 * Changes status/priority and/or assignment. Requires "tickets.manage".
 * The assignee must be an admin or support user.
 */
export async function manageTicketAction(_prev: StaffTicketState, formData: FormData): Promise<StaffTicketState> {
  const staff = await requireStaff("tickets.manage");
  const ticketUuid = String(formData.get("ticket") ?? "");

  const ticket = await prisma.ticket.findUnique({ where: { uuid: ticketUuid }, select: { id: true } });
  if (!ticket) return { error: "Ticket not found." };

  const parsed = manageSchema.safeParse({
    status: formData.get("status") ?? undefined,
    priority: formData.get("priority") ?? undefined,
    assignedTo: formData.get("assignedTo") ?? undefined,
  });
  if (!parsed.success) return { error: "Invalid values." };

  const data: { status?: TicketStatus; priority?: string; assignedToId?: number | null } = {};
  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.priority) data.priority = parsed.data.priority;

  if (parsed.data.assignedTo !== undefined) {
    const raw = parsed.data.assignedTo.trim();
    if (raw === "") {
      data.assignedToId = null;
    } else {
      const assigneeId = Number(raw);
      if (!Number.isInteger(assigneeId)) return { error: "Invalid assignee." };
      const assignee = await prisma.user.findFirst({
        where: { id: assigneeId, role: { in: ["admin", "support"] } },
        select: { id: true },
      });
      if (!assignee) return { error: "Assignee must be an admin or support user." };
      data.assignedToId = assignee.id;
    }
  }

  if (Object.keys(data).length === 0) return { error: "Nothing to update." };

  await prisma.ticket.update({ where: { id: ticket.id }, data });
  await logActivity({ event: "admin:ticket.manage", userId: staff.id, properties: { ticket: ticketUuid, ...data } });

  revalidatePath(`/admin/tickets/${ticketUuid}`);
  revalidatePath("/admin/tickets");
  return { success: "Ticket updated." };
}

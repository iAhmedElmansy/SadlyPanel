"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Lock, Save, Send, StickyNote } from "lucide-react";
import {
  addInternalNoteAction,
  manageTicketAction,
  staffReplyAction,
  type StaffTicketState,
} from "../actions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FormError, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/constants";

type Message = {
  id: number;
  body: string;
  isInternal: boolean;
  createdAt: string;
  authorName: string;
  isStaff: boolean;
};

export type StaffTicketDetailData = {
  uuid: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  requester: string;
  requesterEmail: string;
  assigneeId: number | null;
  createdAt: string;
  messages: Message[];
};

const STATUS_TONE: Record<TicketStatus, "ok" | "warn" | "info" | "neutral" | "brand"> = {
  open: "info",
  pending: "warn",
  waiting_user: "brand",
  resolved: "ok",
  closed: "neutral",
};

export function StaffTicketDetail({
  ticket,
  staff,
  canReply,
  canManage,
}: {
  ticket: StaffTicketDetailData;
  staff: { id: number; username: string }[];
  canReply: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const { report } = useToast();
  const replyRef = useRef<HTMLFormElement>(null);
  const noteRef = useRef<HTMLFormElement>(null);

  const [replyState, replyAction] = useActionState<StaffTicketState, FormData>(staffReplyAction, {});
  const [noteState, noteAction] = useActionState<StaffTicketState, FormData>(addInternalNoteAction, {});
  const [manageState, manageAction] = useActionState<StaffTicketState, FormData>(manageTicketAction, {});

  useEffect(() => {
    if (replyState.success) {
      replyRef.current?.reset();
      report(replyState);
      router.refresh();
    } else if (replyState.error && !replyState.fieldErrors) {
      report(replyState);
    }
  }, [replyState, report, router]);

  useEffect(() => {
    if (noteState.success) {
      noteRef.current?.reset();
      report(noteState);
      router.refresh();
    } else if (noteState.error && !noteState.fieldErrors) {
      report(noteState);
    }
  }, [noteState, report, router]);

  useEffect(() => {
    if (manageState.success) {
      report(manageState);
      router.refresh();
    } else if (manageState.error) {
      report(manageState);
    }
  }, [manageState, report, router]);

  const status = ticket.status as TicketStatus;

  return (
    <>
      <PageHeader
        title={ticket.subject}
        breadcrumb={
          <Link href="/admin/tickets" className="inline-flex items-center gap-1 hover:text-ink">
            <ChevronLeft className="size-3.5" />
            Back to queue
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[status] ?? "neutral"}>{TICKET_STATUS_LABELS[status] ?? ticket.status}</Badge>
            <Badge tone="neutral">{TICKET_CATEGORY_LABELS[ticket.category as TicketCategory] ?? ticket.category}</Badge>
            <Badge tone="neutral">
              {TICKET_PRIORITY_LABELS[ticket.priority as TicketPriority] ?? ticket.priority} priority
            </Badge>
            <span className="text-xs text-ink-dim">
              {ticket.requester} · Opened {formatDate(ticket.createdAt)}
            </span>
          </div>

          {ticket.messages.map((message) => (
            <Card
              key={message.id}
              className={cn(message.isInternal ? "border-warn/40 bg-warn/5" : message.isStaff && "border-brand/30")}
            >
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {message.authorName}
                    {message.isStaff ? <Badge tone="brand">Staff</Badge> : null}
                    {message.isInternal ? (
                      <Badge tone="warn">
                        <Lock className="size-3" />
                        Internal
                      </Badge>
                    ) : null}
                  </span>
                }
                description={formatDate(message.createdAt)}
              />
              <CardBody className="whitespace-pre-wrap break-words text-sm text-ink-muted">{message.body}</CardBody>
            </Card>
          ))}

          {canReply ? (
            <Card>
              <CardHeader title="Reply to user" />
              <form ref={replyRef} action={replyAction}>
                <input type="hidden" name="ticket" value={ticket.uuid} />
                <CardBody className="space-y-3">
                  <FormError message={replyState.fieldErrors ? replyState.error : undefined} />
                  <Field label="Message" required error={replyState.fieldErrors?.body}>
                    <Textarea name="body" required maxLength={5000} rows={5} placeholder="Reply visible to the user…" />
                  </Field>
                </CardBody>
                <CardFooter>
                  <SubmitButton pendingLabel="Sending…">
                    <Send className="size-3.5" />
                    Send reply
                  </SubmitButton>
                </CardFooter>
              </form>
            </Card>
          ) : null}

          {canReply ? (
            <Card>
              <CardHeader title="Internal note" description="Only staff can see this." />
              <form ref={noteRef} action={noteAction}>
                <input type="hidden" name="ticket" value={ticket.uuid} />
                <CardBody className="space-y-3">
                  <FormError message={noteState.fieldErrors ? noteState.error : undefined} />
                  <Field label="Note" required error={noteState.fieldErrors?.body}>
                    <Textarea name="body" required maxLength={5000} rows={3} placeholder="Add a private note for the team…" />
                  </Field>
                </CardBody>
                <CardFooter>
                  <SubmitButton variant="ghost" pendingLabel="Saving…">
                    <StickyNote className="size-3.5" />
                    Add note
                  </SubmitButton>
                </CardFooter>
              </form>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-1 text-xs text-ink-muted">
              <p>
                <span className="text-ink-dim">Requester:</span> {ticket.requester}
              </p>
              <p className="break-all">
                <span className="text-ink-dim">Email:</span> {ticket.requesterEmail}
              </p>
            </CardBody>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader title="Manage" description="Update status, priority and assignment." />
              <form action={manageAction}>
                <input type="hidden" name="ticket" value={ticket.uuid} />
                <CardBody className="space-y-3">
                  <Field label="Status">
                    <Select name="status" defaultValue={ticket.status}>
                      {TICKET_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {TICKET_STATUS_LABELS[value]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Priority">
                    <Select name="priority" defaultValue={ticket.priority}>
                      {TICKET_PRIORITIES.map((value) => (
                        <option key={value} value={value}>
                          {TICKET_PRIORITY_LABELS[value]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Assignee">
                    <Select name="assignedTo" defaultValue={ticket.assigneeId === null ? "" : String(ticket.assigneeId)}>
                      <option value="">Unassigned</option>
                      {staff.map((member) => (
                        <option key={member.id} value={String(member.id)}>
                          {member.username}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </CardBody>
                <CardFooter>
                  <SubmitButton pendingLabel="Saving…">
                    <Save className="size-3.5" />
                    Save
                  </SubmitButton>
                </CardFooter>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

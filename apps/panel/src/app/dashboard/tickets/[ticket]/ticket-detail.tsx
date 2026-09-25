"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Send, XCircle } from "lucide-react";
import { closeTicketAction, replyTicketAction, type TicketActionState } from "../actions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FormError, Textarea } from "@/components/ui/form";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/preferences";
import { cn, formatDate } from "@/lib/utils";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/constants";

type Message = {
  id: number;
  body: string;
  createdAt: string;
  authorId: number | null;
  authorName: string;
  isStaff: boolean;
};

export type UserTicketDetail = {
  uuid: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
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

export function TicketDetail({ ticket, currentUserId }: { ticket: UserTicketDetail; currentUserId: number }) {
  const t = useT();
  const router = useRouter();
  const { report } = useToast();
  const { confirm, dialog } = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<TicketActionState, FormData>(replyTicketAction, {});

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      report(state);
      router.refresh();
    } else if (state.error && !state.fieldErrors) {
      report(state);
    }
  }, [state, report, router]);

  const closed = ticket.status === "closed";
  const status = ticket.status as TicketStatus;

  return (
    <>
      <PageHeader
        title={ticket.subject}
        breadcrumb={
          <Link href="/dashboard/tickets" className="inline-flex items-center gap-1 hover:text-ink">
            <ChevronLeft className="size-3.5" />
            {t("dashboard.ticketBackToTickets")}
          </Link>
        }
        actions={
          !closed ? (
            <Button
              variant="ghost"
              onClick={async () => {
                if (
                  !(await confirm({
                    title: t("dashboard.ticketCloseConfirmTitle"),
                    description: t("dashboard.ticketCloseConfirmDescription"),
                    confirmLabel: t("dashboard.ticketCloseButton"),
                    tone: "danger",
                  }))
                )
                  return;
                report(await closeTicketAction(ticket.uuid));
                router.refresh();
              }}
            >
              <XCircle className="size-3.5" />
              {t("dashboard.ticketCloseButton")}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[status] ?? "neutral"}>{TICKET_STATUS_LABELS[status] ?? ticket.status}</Badge>
        <Badge tone="neutral">{TICKET_CATEGORY_LABELS[ticket.category as TicketCategory] ?? ticket.category}</Badge>
        <Badge tone="neutral">
          {t("dashboard.ticketPriorityBadge", {
            priority: TICKET_PRIORITY_LABELS[ticket.priority as TicketPriority] ?? ticket.priority,
          })}
        </Badge>
        <span className="text-xs text-ink-dim">{t("dashboard.ticketOpened", { date: formatDate(ticket.createdAt) })}</span>
      </div>

      <div className="mt-4 animate-in space-y-3">
        {ticket.messages.map((message) => {
          const mine = message.authorId === currentUserId;
          return (
            <Card
              key={message.id}
              className={cn(message.isStaff && "border-brand/30", mine && "bg-surface-2/40")}
            >
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {message.authorName}
                    {message.isStaff ? <Badge tone="brand">{t("dashboard.ticketStaffBadge")}</Badge> : null}
                    {mine ? <Badge tone="neutral">{t("dashboard.ticketYouBadge")}</Badge> : null}
                  </span>
                }
                description={formatDate(message.createdAt)}
              />
              <CardBody className="whitespace-pre-wrap break-words text-sm text-ink-muted">{message.body}</CardBody>
            </Card>
          );
        })}
      </div>

      {closed ? (
        <Card className="mt-4">
          <CardBody className="text-sm text-ink-dim">{t("dashboard.ticketClosedNotice")}</CardBody>
        </Card>
      ) : (
        <Card className="mt-4">
          <CardHeader title={t("dashboard.ticketReplyTitle")} />
          <form ref={formRef} action={action}>
            <input type="hidden" name="ticket" value={ticket.uuid} />
            <CardBody className="space-y-3">
              <FormError message={state.fieldErrors ? state.error : undefined} />
              <Field label={t("dashboard.ticketReplyField")} required error={state.fieldErrors?.body}>
                <Textarea name="body" required maxLength={5000} rows={5} placeholder={t("dashboard.ticketReplyPlaceholder")} />
              </Field>
            </CardBody>
            <CardFooter>
              <SubmitButton pendingLabel={t("dashboard.ticketReplySending")}>
                <Send className="size-3.5" />
                {t("dashboard.ticketReplySend")}
              </SubmitButton>
            </CardFooter>
          </form>
        </Card>
      )}

      {dialog}
    </>
  );
}

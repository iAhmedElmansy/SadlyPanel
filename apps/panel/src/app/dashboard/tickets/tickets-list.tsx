"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LifeBuoy, Plus, Send } from "lucide-react";
import { createTicketAction, type TicketActionState } from "./actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/preferences";
import { relativeTime } from "@/lib/utils";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/constants";

export type UserTicketRow = {
  uuid: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  updatedAt: string;
};

const STATUS_TONE: Record<TicketStatus, "ok" | "warn" | "info" | "neutral" | "brand"> = {
  open: "info",
  pending: "warn",
  waiting_user: "brand",
  resolved: "ok",
  closed: "neutral",
};

const PRIORITY_TONE: Record<TicketPriority, "neutral" | "warn" | "bad"> = {
  low: "neutral",
  normal: "neutral",
  high: "warn",
  urgent: "bad",
};

function statusLabel(status: string): string {
  return TICKET_STATUS_LABELS[status as TicketStatus] ?? status;
}

export function TicketsList({ tickets }: { tickets: UserTicketRow[] }) {
  const t = useT();
  const router = useRouter();
  const { report } = useToast();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<TicketActionState, FormData>(createTicketAction, {});

  useEffect(() => {
    if (state.createdUuid) {
      setOpen(false);
      router.push(`/dashboard/tickets/${state.createdUuid}`);
    } else if (state.error && !state.fieldErrors) {
      report(state);
    }
  }, [state, report, router]);

  const columns: Column<UserTicketRow>[] = useMemo(
    () => [
      {
        key: "subject",
        header: t("dashboard.ticketsColSubject"),
        render: (row) => (
          <Link href={`/dashboard/tickets/${row.uuid}`} className="font-medium text-ink hover:text-brand-soft">
            {row.subject}
          </Link>
        ),
      },
      {
        key: "category",
        header: t("dashboard.ticketsColCategory"),
        className: "text-xs text-ink-muted",
        render: (row) => TICKET_CATEGORY_LABELS[row.category as TicketCategory] ?? row.category,
      },
      {
        key: "priority",
        header: t("dashboard.ticketsColPriority"),
        render: (row) => (
          <Badge tone={PRIORITY_TONE[row.priority as TicketPriority] ?? "neutral"}>
            {TICKET_PRIORITY_LABELS[row.priority as TicketPriority] ?? row.priority}
          </Badge>
        ),
      },
      {
        key: "status",
        header: t("dashboard.ticketsColStatus"),
        render: (row) => (
          <Badge tone={STATUS_TONE[row.status as TicketStatus] ?? "neutral"}>{statusLabel(row.status)}</Badge>
        ),
      },
      {
        key: "updatedAt",
        header: t("dashboard.ticketsColUpdated"),
        className: "text-xs text-ink-dim",
        render: (row) => relativeTime(row.updatedAt),
      },
    ],
    [t],
  );

  return (
    <>
      <Card>
        <CardHeader
          title={t("dashboard.ticketsListTitle")}
          description={t("dashboard.ticketsCount", { count: tickets.length })}
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-3.5" />
              {t("dashboard.ticketsNew")}
            </Button>
          }
        />
        <DataTable
          columns={columns}
          rows={tickets}
          keyField="uuid"
          empty={
            <EmptyState
              icon={<LifeBuoy className="size-5" />}
              title={t("dashboard.ticketsEmptyTitle")}
              description={t("dashboard.ticketsEmptyDescription")}
              action={
                <Button onClick={() => setOpen(true)}>
                  <Plus className="size-3.5" />
                  {t("dashboard.ticketsNew")}
                </Button>
              }
            />
          }
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t("dashboard.ticketsNew")} description={t("dashboard.ticketsModalDescription")}>
        <form action={action} className="space-y-4">
          <FormError message={state.fieldErrors ? state.error : undefined} />
          <Field label={t("dashboard.ticketsFieldSubject")} required error={state.fieldErrors?.subject}>
            <Input name="subject" required maxLength={150} placeholder={t("dashboard.ticketsSubjectPlaceholder")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("dashboard.ticketsFieldCategory")} required error={state.fieldErrors?.category}>
              <Select name="category" defaultValue="general">
                {TICKET_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {TICKET_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("dashboard.ticketsFieldPriority")} required error={state.fieldErrors?.priority}>
              <Select name="priority" defaultValue="normal">
                {TICKET_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {TICKET_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t("dashboard.ticketsFieldMessage")} required error={state.fieldErrors?.body}>
            <Textarea name="body" required maxLength={5000} rows={6} placeholder={t("dashboard.ticketsMessagePlaceholder")} />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <SubmitButton pendingLabel={t("common.creating")}>
              <Send className="size-3.5" />
              {t("dashboard.ticketsCreate")}
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/table";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/form";
import { relativeTime } from "@/lib/utils";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/constants";
import { useT } from "@/lib/i18n/preferences";

export type StaffTicketRow = {
  uuid: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  requester: string;
  assigneeId: number | null;
  assignee: string | null;
  messageCount: number;
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

const PAGE_SIZE = 20;

export function TicketQueue({
  tickets,
  staff,
}: {
  tickets: StaffTicketRow[];
  staff: { id: number; username: string }[];
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [assignee, setAssignee] = useState("");

  const filtered = useMemo(
    () =>
      tickets.filter((ticket) => {
        if (status && ticket.status !== status) return false;
        if (priority && ticket.priority !== priority) return false;
        if (category && ticket.category !== category) return false;
        if (assignee === "unassigned" && ticket.assigneeId !== null) return false;
        if (assignee && assignee !== "unassigned" && String(ticket.assigneeId) !== assignee) return false;
        if (query.trim()) {
          const needle = query.toLowerCase();
          if (!ticket.subject.toLowerCase().includes(needle) && !ticket.requester.toLowerCase().includes(needle)) {
            return false;
          }
        }
        return true;
      }),
    [tickets, query, status, priority, category, assignee],
  );

  const { page, setPage, pageCount, pageItems } = usePagination(filtered, PAGE_SIZE);

  const columns: Column<StaffTicketRow>[] = [
    {
      key: "subject",
      header: t("admin.tqSubject"),
      render: (row) => (
        <Link href={`/admin/tickets/${row.uuid}`} className="font-medium text-ink hover:text-brand-soft">
          {row.subject}
        </Link>
      ),
    },
    { key: "requester", header: t("admin.tqRequester"), className: "text-xs text-ink-muted" },
    {
      key: "category",
      header: t("admin.tqCategory"),
      className: "text-xs text-ink-muted",
      render: (row) => TICKET_CATEGORY_LABELS[row.category as TicketCategory] ?? row.category,
    },
    {
      key: "priority",
      header: t("admin.tqPriority"),
      render: (row) => (
        <Badge tone={PRIORITY_TONE[row.priority as TicketPriority] ?? "neutral"}>
          {TICKET_PRIORITY_LABELS[row.priority as TicketPriority] ?? row.priority}
        </Badge>
      ),
    },
    {
      key: "status",
      header: t("admin.tqStatus"),
      render: (row) => (
        <Badge tone={STATUS_TONE[row.status as TicketStatus] ?? "neutral"}>
          {TICKET_STATUS_LABELS[row.status as TicketStatus] ?? row.status}
        </Badge>
      ),
    },
    {
      key: "assignee",
      header: t("admin.tqAssignee"),
      className: "text-xs text-ink-muted",
      render: (row) => row.assignee ?? <span className="text-ink-dim">{t("admin.tqUnassigned")}</span>,
    },
    {
      key: "updatedAt",
      header: t("admin.tqUpdated"),
      className: "text-xs text-ink-dim",
      render: (row) => relativeTime(row.updatedAt),
    },
  ];

  return (
    <Card>
      <CardHeader
        title={t("admin.tqQueue")}
        description={t("admin.tqCount", { filtered: filtered.length, total: tickets.length })}
        action={
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("admin.tqSearchPlaceholder")}
            className="w-48"
            aria-label={t("admin.tqSearchLabel")}
          />
        }
      />

      <CardBody className="grid gap-2 border-b border-line-soft sm:grid-cols-2 lg:grid-cols-4">
        <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t("admin.tqFilterStatus")}>
          <option value="">{t("admin.tqAllStatuses")}</option>
          {TICKET_STATUSES.map((value) => (
            <option key={value} value={value}>
              {TICKET_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
        <Select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label={t("admin.tqFilterPriority")}>
          <option value="">{t("admin.tqAllPriorities")}</option>
          {TICKET_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {TICKET_PRIORITY_LABELS[value]}
            </option>
          ))}
        </Select>
        <Select value={category} onChange={(event) => setCategory(event.target.value)} aria-label={t("admin.tqFilterCategory")}>
          <option value="">{t("admin.tqAllCategories")}</option>
          {TICKET_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {TICKET_CATEGORY_LABELS[value]}
            </option>
          ))}
        </Select>
        <Select value={assignee} onChange={(event) => setAssignee(event.target.value)} aria-label={t("admin.tqFilterAssignee")}>
          <option value="">{t("admin.tqAllAssignees")}</option>
          <option value="unassigned">{t("admin.tqUnassigned")}</option>
          {staff.map((member) => (
            <option key={member.id} value={String(member.id)}>
              {member.username}
            </option>
          ))}
        </Select>
      </CardBody>

      <DataTable
        columns={columns}
        rows={pageItems}
        keyField="uuid"
        empty={<EmptyState icon={<Inbox className="size-5" />} title={t("admin.tqEmptyTitle")} description={t("admin.tqEmptyDesc")} />}
      />

      {pageCount > 1 ? (
        <CardBody className="flex justify-end border-t border-line">
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </CardBody>
      ) : null}
    </Card>
  );
}

"use client";

import { useActionState, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { createUserAction, deleteUserAction, updateUserAction, type UserState } from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { DataTable, TableActions, type Column } from "@/components/ui/table";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Checkbox, Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, initials, relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

export type AdminUserRow = {
  id: number;
  uuid: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  planId: number | null;
  planName: string | null;
  serverCount: number;
  lastLoginAt: string | null;
  createdAt: string;
};

export interface PlanOption {
  id: number;
  name: string;
}

const PAGE_SIZE = 15;

export function UserTable({
  users,
  currentUserId,
  plans,
}: {
  users: AdminUserRow[];
  currentUserId: number;
  plans: PlanOption[];
}) {
  const t = useT();
  const [createState, createAction] = useActionState<UserState, FormData>(createUserAction, {});
  const [editState, editAction] = useActionState<UserState, FormData>(updateUserAction, {});
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [notice, setNotice] = useState<UserState>({});
  const [query, setQuery] = useState("");
  const { confirm, dialog } = useConfirm();

  const filtered = useMemo(
    () =>
      users.filter((user) => {
        if (!query.trim()) return true;
        const needle = query.toLowerCase();
        return (
          user.username.toLowerCase().includes(needle) ||
          user.email.toLowerCase().includes(needle) ||
          `${user.firstName} ${user.lastName}`.toLowerCase().includes(needle)
        );
      }),
    [users, query],
  );

  const { page, setPage, pageCount, pageItems } = usePagination(filtered, PAGE_SIZE);

  const columns: Column<AdminUserRow>[] = [
    {
      key: "user",
      header: t("admin.utColUser"),
      render: (user) => (
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/20 text-[11px] font-semibold text-brand-soft">
            {initials(user.firstName, user.lastName)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-ink">
              {user.firstName} {user.lastName}
            </span>
            <span className="block truncate font-mono text-xs text-ink-dim">{user.username}</span>
          </span>
        </div>
      ),
    },
    { key: "email", header: t("admin.utColEmail"), className: "text-xs text-ink-muted", render: (user) => user.email },
    {
      key: "role",
      header: t("admin.utColRole"),
      render: (user) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={user.role === "admin" ? "brand" : "neutral"}>{user.role}</Badge>
          {!user.isActive ? <Badge tone="bad">{t("admin.utDisabled")}</Badge> : null}
        </div>
      ),
    },
    {
      key: "plan",
      header: t("admin.utColPlan"),
      render: (user) =>
        user.planName ? <Badge tone="brand">{user.planName}</Badge> : <span className="text-xs text-ink-dim">{t("admin.utNoPlan")}</span>,
    },
    { key: "serverCount", header: t("admin.utColServers"), className: "font-mono text-xs" },
    { key: "lastLogin", header: t("admin.utColLastLogin"), className: "text-xs text-ink-dim", render: (user) => relativeTime(user.lastLoginAt) },
    { key: "createdAt", header: t("admin.utColCreated"), className: "text-xs text-ink-dim", render: (user) => formatDate(user.createdAt) },
    {
      key: "actions",
      header: "",
      className: "w-20",
      render: (user) => (
        <TableActions>
          <button
            type="button"
            title={t("admin.utEditUser")}
            onClick={() => setEditing(user)}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title={t("admin.utDeleteUser")}
            disabled={user.id === currentUserId}
            onClick={async () => {
              if (
                !(await confirm({
                  title: t("admin.utDeleteConfirmTitle", { name: user.username }),
                  description: t("admin.utDeleteConfirmDesc"),
                  tone: "danger",
                  confirmLabel: t("admin.utDeleteUser"),
                }))
              )
                return;
              setNotice(await deleteUserAction(user.id));
            }}
            className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad disabled:opacity-30"
          >
            <Trash2 className="size-3.5" />
          </button>
        </TableActions>
      ),
    },
  ];

  return (
    <>
      <Card>
        <CardHeader
          title={t("admin.utUsers")}
          description={t("admin.utAccountCount", { count: users.length })}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("admin.utSearchPlaceholder")}
                className="w-44"
                aria-label={t("admin.utSearchLabel")}
              />
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-3.5" />
                {t("admin.utAddUser")}
              </Button>
            </div>
          }
        />

        {(createState.success || editState.success || notice.success) && (
          <div className="border-b border-ok/30 bg-ok/10 px-5 py-2 text-xs text-ok">
            {createState.success ?? editState.success ?? notice.success}
          </div>
        )}
        {(notice.error || editState.error) && (
          <CardBody className="border-b border-line-soft">
            <Alert tone="bad">{notice.error ?? editState.error}</Alert>
          </CardBody>
        )}

        <DataTable
          columns={columns}
          rows={pageItems}
          keyField="id"
          empty={<EmptyState icon={<Users className="size-5" />} title={t("admin.utNoMatch")} description={t("admin.utNoMatchDesc")} />}
        />

        {pageCount > 1 ? (
          <CardBody className="flex justify-end border-t border-line">
            <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
          </CardBody>
        ) : null}
      </Card>

      {dialog}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t("admin.utAddUser")} description={t("admin.utAddUserDesc")}>
        <form action={createAction} className="space-y-4">
          <FormError message={createState.error} />
          <FormSuccess message={createState.success} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("admin.utFirstName")} required error={createState.fieldErrors?.firstName}>
              <Input name="firstName" required />
            </Field>
            <Field label={t("admin.utLastName")} required error={createState.fieldErrors?.lastName}>
              <Input name="lastName" required />
            </Field>
          </div>
          <Field label={t("admin.utUsername")} required error={createState.fieldErrors?.username}>
            <Input name="username" required />
          </Field>
          <Field label={t("admin.utEmail")} required error={createState.fieldErrors?.email}>
            <Input name="email" type="email" required />
          </Field>
          <Field label={t("admin.utPassword")} required error={createState.fieldErrors?.password} hint={t("admin.utPasswordHint")}>
            <Input name="password" type="text" required minLength={8} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("admin.utRole")} required>
              <Select name="role" defaultValue="user">
                <option value="user">{t("admin.utRoleUser")}</option>
                <option value="admin">{t("admin.utRoleAdmin")}</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Checkbox name="isActive" defaultChecked label={t("admin.utAccountEnabled")} />
            </div>
          </div>
          <Field label={t("admin.utPlan")} hint={t("admin.utPlanHint")}>
            <Select name="planId" defaultValue="">
              <option value="">{t("admin.utNoPlan")}</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <SubmitButton pendingLabel={t("common.creating")}>
              <UserPlus className="size-3.5" />
              {t("admin.utCreateUser")}
            </SubmitButton>
          </div>
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={t("admin.utEditTitle", { name: editing?.username ?? "" })}
        description={t("admin.utEditDesc")}
      >
        {editing ? (
          <form action={editAction} className="space-y-4">
            <input type="hidden" name="userId" value={editing.id} />
            <FormError message={editState.error} />
            <FormSuccess message={editState.success} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("admin.utFirstName")} required error={editState.fieldErrors?.firstName}>
                <Input name="firstName" defaultValue={editing.firstName} required />
              </Field>
              <Field label={t("admin.utLastName")} required error={editState.fieldErrors?.lastName}>
                <Input name="lastName" defaultValue={editing.lastName} required />
              </Field>
            </div>
            <Field label={t("admin.utUsername")} required error={editState.fieldErrors?.username}>
              <Input name="username" defaultValue={editing.username} required />
            </Field>
            <Field label={t("admin.utEmail")} required error={editState.fieldErrors?.email}>
              <Input name="email" type="email" defaultValue={editing.email} required />
            </Field>
            <Field label={t("admin.utNewPassword")} error={editState.fieldErrors?.password} hint={t("admin.utNewPasswordHint")}>
              <Input name="password" type="text" minLength={8} placeholder={t("admin.utPasswordBlank")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("admin.utRole")} required>
                <Select name="role" defaultValue={editing.role}>
                  <option value="user">{t("admin.utRoleUser")}</option>
                  <option value="admin">{t("admin.utRoleAdmin")}</option>
                </Select>
              </Field>
              <div className="flex items-end">
                <Checkbox name="isActive" defaultChecked={editing.isActive} label={t("admin.utAccountEnabled")} />
              </div>
            </div>
            <Field label={t("admin.utPlan")} hint={t("admin.utPlanHint")}>
              <Select name="planId" defaultValue={editing.planId ? String(editing.planId) : ""}>
                <option value="">{t("admin.utNoPlan")}</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                {t("common.close")}
              </Button>
              <SubmitButton pendingLabel={t("common.saving")}>{t("admin.utSaveChanges")}</SubmitButton>
            </div>
          </form>
        ) : null}
      </Modal>
    </>
  );
}

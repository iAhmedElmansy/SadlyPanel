"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import {
  createRoleAction,
  deleteRoleAction,
  setRolePermissionsAction,
  updateRoleAction,
  type RoleState,
} from "./actions";
import { Card } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, TableActions, type Column } from "@/components/ui/table";
import { Checkbox, Field, FormError, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { permissionsByArea, PERMISSIONS } from "@/lib/constants";
import { useT } from "@/lib/i18n/preferences";

export type RoleRow = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  isDefault: boolean;
  sortOrder: number;
  userCount: number;
};

const AREA_GROUPS = permissionsByArea();
const TOTAL_PERMISSIONS = PERMISSIONS.length;

export function RoleManager({ roles }: { roles: RoleRow[] }) {
  const t = useT();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; role?: RoleRow } | null>(null);
  const { confirm, dialog } = useConfirm();
  const toast = useToast();
  const router = useRouter();

  const report = (result: RoleState) => {
    if (result.error) toast.push(result.error, "bad");
    else if (result.success) toast.push(result.success, "ok");
    result.warnings?.forEach((warning) => toast.push(warning, "warn"));
    router.refresh();
  };

  const columns: Column<RoleRow>[] = [
    {
      key: "name",
      header: t("admin.rolesColRole"),
      render: (role) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{role.name}</span>
            {role.isSystem ? <Badge tone="brand">{t("admin.rolesSystem")}</Badge> : null}
            {role.isDefault ? <Badge tone="ok">{t("admin.rolesDefault")}</Badge> : null}
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-ink-dim">{role.key}</p>
          {role.description ? <p className="mt-0.5 truncate text-xs text-ink-muted">{role.description}</p> : null}
        </div>
      ),
    },
    {
      key: "permissions",
      header: t("admin.rolesColPermissions"),
      render: (role) =>
        role.key === "admin" && role.isSystem ? (
          <span className="text-xs text-ink-dim">{t("admin.rolesAllPermissions")}</span>
        ) : (
          <span className="text-xs text-ink-dim">
            {t("admin.rolesPermCount", { count: role.permissions.length, total: TOTAL_PERMISSIONS })}
          </span>
        ),
    },
    {
      key: "users",
      header: t("admin.rolesColUsers"),
      align: "right",
      render: (role) => <span className="font-mono text-xs text-ink-dim">{role.userCount}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (role) => (
        <TableActions>
          <button
            type="button"
            title={t("admin.rolesEdit")}
            onClick={() => setModal({ mode: "edit", role })}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title={t("admin.rolesDelete")}
            disabled={role.isSystem}
            onClick={async () => {
              if (
                !(await confirm({
                  title: t("admin.rolesDeleteConfirmTitle", { name: role.name }),
                  description: t("admin.rolesDeleteConfirmDesc"),
                  tone: "danger",
                  confirmLabel: t("admin.rolesDelete"),
                }))
              )
                return;
              report(await deleteRoleAction(role.id));
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-dim">{t("admin.rolesCount", { count: roles.length })}</p>
        <Button onClick={() => setModal({ mode: "create" })}>
          <Plus className="size-3.5" />
          {t("admin.rolesNew")}
        </Button>
      </div>

      {roles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck className="size-5" />}
            title={t("admin.rolesEmptyTitle")}
            description={t("admin.rolesEmptyDesc")}
            action={
              <Button onClick={() => setModal({ mode: "create" })}>
                <Plus className="size-3.5" />
                {t("admin.rolesNew")}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="p-2">
          <DataTable columns={columns} rows={roles} keyField="id" />
        </Card>
      )}

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.mode === "edit" ? t("admin.rolesEditTitle", { name: modal.role?.name ?? "" }) : t("admin.rolesNew")}
        description={t("admin.rolesModalDesc")}
        width="lg"
      >
        {modal ? <RoleForm mode={modal.mode} role={modal.role} onDone={() => setModal(null)} /> : null}
      </Modal>
      {dialog}
    </>
  );
}

function RoleForm({ mode, role, onDone }: { mode: "create" | "edit"; role?: RoleRow; onDone: () => void }) {
  const t = useT();
  const action = mode === "create" ? createRoleAction : updateRoleAction;
  const [state, formAction] = useActionState<RoleState, FormData>(action, {});
  const toast = useToast();
  const router = useRouter();

  const isAdminSystem = role?.isSystem && role.key === "admin";
  const initial = useMemo(() => new Set(isAdminSystem ? PERMISSIONS.map((p) => p.key) : role?.permissions ?? []), [role, isAdminSystem]);
  const [selected, setSelected] = useState<Set<string>>(initial);

  useEffect(() => {
    if (state.success) {
      toast.push(state.success, "ok");
      state.warnings?.forEach((warning) => toast.push(warning, "warn"));
      router.refresh();
      onDone();
    } else if (state.error) {
      toast.push(state.error, "bad");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleArea = (keys: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const selectAll = (on: boolean) => setSelected(on ? new Set(PERMISSIONS.map((p) => p.key)) : new Set());

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" && role ? <input type="hidden" name="roleId" value={role.id} /> : null}
      {/* Hidden inputs carry the current selection so the server action receives it. */}
      {[...selected].map((key) => (
        <input key={key} type="hidden" name="permissions" value={key} />
      ))}
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("admin.rolesFieldName")} required error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={role?.name ?? ""} required placeholder={t("admin.rolesNamePlaceholder")} />
        </Field>
        <Field
          label={t("admin.rolesFieldKey")}
          hint={role?.isSystem ? t("admin.rolesKeyLocked") : t("admin.rolesKeyHint")}
          error={state.fieldErrors?.key}
        >
          <Input
            name="key"
            defaultValue={role?.key ?? ""}
            required
            readOnly={role?.isSystem ?? false}
            placeholder="support-lead"
          />
        </Field>
      </div>

      <Field label={t("admin.rolesFieldDescription")} error={state.fieldErrors?.description}>
        <Textarea name="description" defaultValue={role?.description ?? ""} rows={2} placeholder={t("admin.rolesDescPlaceholder")} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("admin.rolesFieldSort")} hint={t("admin.rolesSortHint")} error={state.fieldErrors?.sortOrder}>
          <Input name="sortOrder" type="number" min={0} max={9999} defaultValue={role?.sortOrder ?? 0} />
        </Field>
        <div className="flex items-end">
          <Checkbox
            name="isDefault"
            defaultChecked={role?.isDefault ?? false}
            label={t("admin.rolesDefaultLabel")}
            description={t("admin.rolesDefaultDesc")}
          />
        </div>
      </div>

      {/* Permission matrix, grouped by area */}
      <div className="rounded-lg border border-line">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-xs font-medium text-ink">{t("admin.rolesPermissions")}</span>
          {isAdminSystem ? (
            <span className="text-xs text-ink-dim">{t("admin.rolesAdminLocked")}</span>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => selectAll(true)} className="text-xs text-brand-soft hover:underline">
                {t("admin.rolesSelectAll")}
              </button>
              <button type="button" onClick={() => selectAll(false)} className="text-xs text-ink-dim hover:underline">
                {t("admin.rolesClearAll")}
              </button>
            </div>
          )}
        </div>

        {isAdminSystem ? (
          <div className="p-3">
            <Alert tone="info">{t("admin.rolesAdminNote")}</Alert>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {AREA_GROUPS.map((group) => {
              const groupKeys = group.permissions.map((p) => p.key);
              const allOn = groupKeys.every((key) => selected.has(key));
              return (
                <div key={group.area} className="p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {t(`admin.permArea_${group.area}`)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleArea(groupKeys, !allOn)}
                      className="text-xs text-brand-soft hover:underline"
                    >
                      {allOn ? t("admin.rolesClearAll") : t("admin.rolesSelectAll")}
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.permissions.map((perm) => (
                      <label
                        key={perm.key}
                        className="flex cursor-pointer items-start gap-2 rounded-md border border-line-soft px-2.5 py-2 hover:bg-surface-3"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(perm.key)}
                          onChange={() => toggle(perm.key)}
                          className="mt-0.5 size-4 shrink-0 accent-brand"
                        />
                        <span className="min-w-0">
                          <span className="block text-xs text-ink">
                            {t(`admin.permLabel_${perm.key.replace(/\./g, "_")}`)}
                          </span>
                          <span className="block truncate font-mono text-[10px] text-ink-dim">{perm.key}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <SubmitButton pendingLabel={t("common.saving")}>
          {mode === "create" ? t("admin.rolesCreate") : t("admin.rolesSave")}
        </SubmitButton>
      </div>
    </form>
  );
}

// Re-exported so a future quick-toggle UI can call the permissions-only action.
export { setRolePermissionsAction };

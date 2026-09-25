"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderSymlink, Pencil, Plus, Trash2 } from "lucide-react";
import { createMountAction, deleteMountAction, updateMountAction, type MountState } from "./actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, TableActions, type Column } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Checkbox, Field, FormError, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/preferences";

export type MountRow = {
  id: number;
  uuid: string;
  name: string;
  description: string;
  source: string;
  target: string;
  readOnly: boolean;
  userMountable: boolean;
  nodeIds: number[];
  eggIds: number[];
  serverCount: number;
};

interface Option {
  id: number;
  name: string;
}

export function MountManager({
  mounts,
  nodes,
  eggs,
}: {
  mounts: MountRow[];
  nodes: Option[];
  eggs: Option[];
}) {
  const [modal, setModal] = useState<{ mode: "create" | "edit"; mount?: MountRow } | null>(null);
  const { confirm, dialog } = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const t = useT();

  const report = (result: MountState) => {
    if (result.error) toast.push(result.error, "bad");
    else if (result.success) toast.push(result.success, "ok");
    router.refresh();
  };

  const columns: Column<MountRow>[] = [
    {
      key: "name",
      header: t("admin.mmColMount"),
      render: (mount) => (
        <>
          <span className="text-ink">{mount.name}</span>
          {mount.description ? <span className="block text-xs text-ink-dim">{mount.description}</span> : null}
        </>
      ),
    },
    {
      key: "path",
      header: t("admin.mmColPath"),
      className: "font-mono text-xs text-ink-muted",
      render: (mount) => (
        <>
          <span className="block truncate" title={mount.source}>
            {mount.source}
          </span>
          <span className="block truncate text-ink-dim" title={mount.target}>
            → {mount.target}
          </span>
        </>
      ),
    },
    {
      key: "mode",
      header: t("admin.mmColMode"),
      render: (mount) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={mount.readOnly ? "neutral" : "warn"}>{mount.readOnly ? t("admin.mmReadOnly") : t("admin.mmReadWrite")}</Badge>
          {mount.userMountable ? <Badge tone="info">{t("admin.mmUser")}</Badge> : null}
        </div>
      ),
    },
    {
      key: "scope",
      header: t("admin.mmColScope"),
      className: "text-xs text-ink-muted",
      render: (mount) => {
        const nodeLabel = mount.nodeIds.length === 0 ? t("admin.mmAllNodes") : t("admin.mmNodeCount", { count: mount.nodeIds.length });
        const eggLabel = mount.eggIds.length === 0 ? t("admin.mmAllServices") : t("admin.mmServiceCount", { count: mount.eggIds.length });
        return `${nodeLabel} · ${eggLabel}`;
      },
    },
    { key: "serverCount", header: t("admin.mmColServers"), align: "center", className: "text-xs text-ink-muted" },
    {
      key: "actions",
      header: "",
      className: "w-20",
      render: (mount) => (
        <TableActions>
          <button
            type="button"
            title={t("admin.mmEditMount")}
            onClick={() => setModal({ mode: "edit", mount })}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title={t("admin.mmDeleteMount")}
            onClick={async () => {
              if (
                !(await confirm({
                  title: t("admin.mmDeleteTitle", { name: mount.name }),
                  description:
                    mount.serverCount > 0
                      ? t("admin.mmDeleteDescAttached", { count: mount.serverCount })
                      : t("admin.mmDeleteDesc"),
                  tone: "danger",
                  confirmLabel: t("admin.mmDeleteMount"),
                }))
              )
                return;
              report(await deleteMountAction(mount.id));
            }}
            className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
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
          title={t("admin.mmHeaderTitle")}
          description={t("admin.mmCount", { count: mounts.length })}
          action={
            <Button onClick={() => setModal({ mode: "create" })}>
              <Plus className="size-3.5" />
              {t("admin.mmNewMount")}
            </Button>
          }
        />
        <DataTable
          columns={columns}
          rows={mounts}
          keyField="id"
          empty={
            <EmptyState
              icon={<FolderSymlink className="size-5" />}
              title={t("admin.mmEmptyTitle")}
              description={t("admin.mmEmptyDesc")}
              action={
                <Button onClick={() => setModal({ mode: "create" })}>
                  <Plus className="size-3.5" />
                  {t("admin.mmNewMount")}
                </Button>
              }
            />
          }
        />
      </Card>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.mode === "edit" ? t("admin.mmEditTitle", { name: modal.mount?.name ?? "" }) : t("admin.mmNewMount")}
        description={t("admin.mmModalDesc")}
        width="lg"
      >
        {modal ? (
          <MountForm
            mode={modal.mode}
            mount={modal.mount}
            nodes={nodes}
            eggs={eggs}
            onDone={() => setModal(null)}
          />
        ) : null}
      </Modal>
      {dialog}
    </>
  );
}

function MountForm({
  mode,
  mount,
  nodes,
  eggs,
  onDone,
}: {
  mode: "create" | "edit";
  mount?: MountRow;
  nodes: Option[];
  eggs: Option[];
  onDone: () => void;
}) {
  const action = mode === "create" ? createMountAction : updateMountAction;
  const [state, formAction] = useActionState<MountState, FormData>(action, {});
  const toast = useToast();
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    if (state.success) {
      toast.push(state.success, "ok");
      router.refresh();
      onDone();
    } else if (state.error) {
      toast.push(state.error, "bad");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" && mount ? <input type="hidden" name="mountId" value={mount.id} /> : null}
      <FormError message={state.error} />

      <Field label={t("admin.mmName")} required error={state.fieldErrors?.name}>
        <Input name="name" defaultValue={mount?.name ?? ""} required placeholder={t("admin.mmNamePlaceholder")} />
      </Field>

      <Field label={t("admin.mmDescription")} error={state.fieldErrors?.description}>
        <Textarea name="description" defaultValue={mount?.description ?? ""} rows={2} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("admin.mmSource")} required hint={t("admin.mmSourceHint")} error={state.fieldErrors?.source}>
          <Input name="source" defaultValue={mount?.source ?? ""} required placeholder="/srv/shared" className="font-mono" />
        </Field>
        <Field label={t("admin.mmTarget")} required hint={t("admin.mmTargetHint")} error={state.fieldErrors?.target}>
          <Input
            name="target"
            defaultValue={mount?.target ?? ""}
            required
            placeholder="/home/container/shared"
            className="font-mono"
          />
        </Field>
      </div>

      <div className="space-y-2.5">
        <Checkbox
          name="readOnly"
          defaultChecked={mount?.readOnly ?? true}
          label={t("admin.mmReadOnlyLabel")}
          description={t("admin.mmReadOnlyDesc")}
        />
        <Checkbox
          name="userMountable"
          defaultChecked={mount?.userMountable ?? false}
          label={t("admin.mmUserMountable")}
          description={t("admin.mmUserMountableDesc")}
        />
      </div>

      <OptionPicker
        legend={t("admin.mmAllowedNodes")}
        hint={t("admin.mmAllowedNodesHint")}
        name="nodeIds"
        options={nodes}
        selected={mount?.nodeIds ?? []}
        noneLabel={t("admin.mmNoneAvailable")}
      />

      <OptionPicker
        legend={t("admin.mmAllowedServices")}
        hint={t("admin.mmAllowedServicesHint")}
        name="eggIds"
        options={eggs}
        selected={mount?.eggIds ?? []}
        noneLabel={t("admin.mmNoneAvailable")}
      />

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <SubmitButton pendingLabel={t("common.saving")}>{mode === "create" ? t("admin.mmCreateMount") : t("admin.mmSaveMount")}</SubmitButton>
      </div>
    </form>
  );
}

function OptionPicker({
  legend,
  hint,
  name,
  options,
  selected,
  noneLabel,
}: {
  legend: string;
  hint: string;
  name: string;
  options: Option[];
  selected: number[];
  noneLabel: string;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-ink-muted">{legend}</legend>
      <p className="text-xs text-ink-dim">{hint}</p>
      {options.length === 0 ? (
        <p className="text-xs text-ink-dim">{noneLabel}</p>
      ) : (
        <div className="grid max-h-40 gap-1.5 overflow-y-auto rounded-md border border-line-soft p-2.5 sm:grid-cols-2">
          {options.map((option) => (
            <Checkbox
              key={option.id}
              name={name}
              value={option.id}
              defaultChecked={selected.includes(option.id)}
              label={option.name}
            />
          ))}
        </div>
      )}
    </fieldset>
  );
}

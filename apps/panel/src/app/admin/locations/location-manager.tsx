"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPinned, Pencil, Plus, Trash2 } from "lucide-react";
import { createLocationAction, deleteLocationAction, updateLocationAction, type LocationState } from "./actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, TableActions, type Column } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, FormError, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

// Declared as a `type` alias (not `interface`) to satisfy DataTable's
// `Record<string, unknown>` row constraint.
export type LocationRow = {
  id: number;
  shortCode: string;
  name: string;
  nodeCount: number;
  createdAt: string;
};

export function LocationManager({ locations }: { locations: LocationRow[] }) {
  const [modal, setModal] = useState<{ mode: "create" | "edit"; location?: LocationRow } | null>(null);
  const { confirm, dialog } = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const t = useT();

  const report = (result: LocationState) => {
    if (result.error) toast.push(result.error, "bad");
    else if (result.success) toast.push(result.success, "ok");
    router.refresh();
  };

  const columns: Column<LocationRow>[] = [
    {
      key: "shortCode",
      header: t("admin.lmColShortCode"),
      className: "font-mono text-xs text-ink-muted",
      render: (location) => <span className="text-ink">{location.shortCode}</span>,
    },
    { key: "name", header: t("admin.lmColName") },
    {
      key: "nodeCount",
      header: t("admin.lmColNodes"),
      align: "center",
      render: (location) =>
        location.nodeCount > 0 ? (
          <Badge tone="info">{location.nodeCount}</Badge>
        ) : (
          <span className="text-xs text-ink-dim">0</span>
        ),
    },
    {
      key: "createdAt",
      header: t("admin.lmColCreated"),
      className: "text-xs text-ink-muted",
      render: (location) => formatDate(location.createdAt),
    },
    {
      key: "actions",
      header: "",
      className: "w-20",
      render: (location) => (
        <TableActions>
          <button
            type="button"
            title={t("admin.lmEditLocation")}
            onClick={() => setModal({ mode: "edit", location })}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title={t("admin.lmDeleteLocation")}
            onClick={async () => {
              if (
                !(await confirm({
                  title: t("admin.lmDeleteTitle", { code: location.shortCode }),
                  description:
                    location.nodeCount > 0
                      ? t("admin.lmDeleteDescAttached", { count: location.nodeCount })
                      : t("admin.lmDeleteDesc"),
                  tone: "danger",
                  confirmLabel: t("admin.lmDeleteLocation"),
                }))
              )
                return;
              report(await deleteLocationAction(location.id));
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
          title={t("admin.lmHeaderTitle")}
          description={t("admin.lmCount", { count: locations.length })}
          action={
            <Button onClick={() => setModal({ mode: "create" })}>
              <Plus className="size-3.5" />
              {t("admin.lmNewLocation")}
            </Button>
          }
        />
        <DataTable
          columns={columns}
          rows={locations}
          keyField="id"
          empty={
            <EmptyState
              icon={<MapPinned className="size-5" />}
              title={t("admin.lmEmptyTitle")}
              description={t("admin.lmEmptyDesc")}
              action={
                <Button onClick={() => setModal({ mode: "create" })}>
                  <Plus className="size-3.5" />
                  {t("admin.lmNewLocation")}
                </Button>
              }
            />
          }
        />
      </Card>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.mode === "edit" ? t("admin.lmEditTitle", { code: modal.location?.shortCode ?? "" }) : t("admin.lmNewLocation")}
        description={t("admin.lmModalDesc")}
      >
        {modal ? <LocationForm mode={modal.mode} location={modal.location} onDone={() => setModal(null)} /> : null}
      </Modal>
      {dialog}
    </>
  );
}

function LocationForm({
  mode,
  location,
  onDone,
}: {
  mode: "create" | "edit";
  location?: LocationRow;
  onDone: () => void;
}) {
  const action = mode === "create" ? createLocationAction : updateLocationAction;
  const [state, formAction] = useActionState<LocationState, FormData>(action, {});
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
      {mode === "edit" && location ? <input type="hidden" name="locationId" value={location.id} /> : null}
      <FormError message={state.error} />

      <Field label={t("admin.lmColShortCode")} required hint={t("admin.lmShortCodeHint")} error={state.fieldErrors?.shortCode}>
        <Input name="shortCode" defaultValue={location?.shortCode ?? ""} required placeholder="eu-west" />
      </Field>

      <Field label={t("admin.lmColName")} required error={state.fieldErrors?.name}>
        <Input name="name" defaultValue={location?.name ?? ""} required placeholder="Europe West" />
      </Field>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <SubmitButton pendingLabel={t("common.saving")}>{mode === "create" ? t("admin.lmCreateLocation") : t("admin.lmSaveLocation")}</SubmitButton>
      </div>
    </form>
  );
}

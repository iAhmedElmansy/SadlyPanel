"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Package as PackageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createPackageAction,
  deletePackageAction,
  updatePackageAction,
  type PackageState,
} from "./actions";
import { Card } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, TableActions, type Column } from "@/components/ui/table";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/preferences";

export interface PackagePlanOption {
  id: number;
  name: string;
  isActive: boolean;
}

export interface PackageEggOption {
  id: number;
  name: string;
  nestId: number;
  nestName: string;
}

export interface PackageNestOption {
  id: number;
  name: string;
}

export type PackageRow = {
  id: number;
  name: string;
  description: string | null;
  isPublic: boolean;
  sortOrder: number;
  planId: number | null;
  requiredPlanId: number | null;
  eggId: number | null;
  nestId: number | null;
  planName: string | null;
  requiredPlanName: string | null;
  availablePlanIds: number[];
  eggName: string | null;
  serverCount: number;
};

export function PackageManager({
  packages,
  plans,
  eggs,
  nests,
}: {
  packages: PackageRow[];
  plans: PackagePlanOption[];
  eggs: PackageEggOption[];
  nests: PackageNestOption[];
}) {
  const [modal, setModal] = useState<{ mode: "create" | "edit"; pkg?: PackageRow } | null>(null);
  const { confirm, dialog } = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const t = useT();

  const report = (result: PackageState) => {
    if (result.error) toast.push(result.error, "bad");
    else if (result.success) toast.push(result.success, "ok");
    result.warnings?.forEach((warning) => toast.push(warning, "warn"));
    router.refresh();
  };

  const canCreate = plans.length > 0 && eggs.length > 0;

  const columns: Column<PackageRow>[] = [
    {
      key: "name",
      header: t("admin.pkgColPackage"),
      render: (pkg) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{pkg.name}</span>
            {pkg.isPublic ? <Badge tone="ok">{t("admin.pkgPublic")}</Badge> : <Badge tone="neutral">{t("admin.pkgPrivate")}</Badge>}
          </div>
          {pkg.description ? <p className="mt-0.5 truncate text-xs text-ink-dim">{pkg.description}</p> : null}
        </div>
      ),
    },
    { key: "planName", header: t("admin.pkgColPlan"), render: (pkg) => pkg.planName ?? <span className="text-ink-dim">—</span> },
    { key: "eggName", header: t("admin.pkgColDefaultService"), render: (pkg) => pkg.eggName ?? <span className="text-ink-dim">—</span> },
    {
      key: "availability",
      header: t("admin.pkgColAvailableTo"),
      render: (pkg) => {
        if (pkg.requiredPlanName) return <Badge tone="warn">{t("admin.pkgMin", { plan: pkg.requiredPlanName })}</Badge>;
        if (pkg.availablePlanIds.length > 0)
          return <span className="text-xs text-ink-dim">{t("admin.pkgPlanCount", { count: pkg.availablePlanIds.length })}</span>;
        return <Badge tone="ok">{t("admin.pkgEveryPlan")}</Badge>;
      },
    },
    {
      key: "serverCount",
      header: t("admin.pkgColServers"),
      align: "right",
      render: (pkg) => <span className="text-xs text-ink-dim">{pkg.serverCount}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (pkg) => (
        <TableActions>
          <button
            type="button"
            title={t("admin.pkgEditPackage")}
            onClick={() => setModal({ mode: "edit", pkg })}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title={t("admin.pkgDeletePackage")}
            onClick={async () => {
              if (
                !(await confirm({
                  title: t("admin.pkgDeleteTitle", { name: pkg.name }),
                  description: t("admin.pkgDeleteDesc"),
                  tone: "danger",
                  confirmLabel: t("admin.pkgDeletePackage"),
                }))
              )
                return;
              report(await deletePackageAction(pkg.id));
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-dim">{t("admin.pkgCount", { count: packages.length })}</p>
        <Button
          onClick={() =>
            canCreate ? setModal({ mode: "create" }) : toast.push(t("admin.pkgNeedPlanFirst"), "warn")
          }
        >
          <Plus className="size-3.5" />
          {t("admin.pkgNewPackage")}
        </Button>
      </div>

      {packages.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PackageIcon className="size-5" />}
            title={t("admin.pkgEmptyTitle")}
            description={t("admin.pkgEmptyDesc")}
            action={
              <Button
                onClick={() =>
                  canCreate ? setModal({ mode: "create" }) : toast.push(t("admin.pkgNeedPlanFirst"), "warn")
                }
              >
                <Plus className="size-3.5" />
                {t("admin.pkgCreatePackage")}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="animate-in p-2">
          <DataTable columns={columns} rows={packages} keyField="id" />
        </Card>
      )}

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.mode === "edit" ? t("admin.pkgEditTitle", { name: modal.pkg?.name ?? "" }) : t("admin.pkgNewPackage")}
        description={t("admin.pkgModalDesc")}
        width="lg"
      >
        {modal ? (
          <PackageForm mode={modal.mode} pkg={modal.pkg} plans={plans} eggs={eggs} nests={nests} onDone={() => setModal(null)} />
        ) : null}
      </Modal>
      {dialog}
    </>
  );
}

function PackageForm({
  mode,
  pkg,
  plans,
  eggs,
  nests,
  onDone,
}: {
  mode: "create" | "edit";
  pkg?: PackageRow;
  plans: PackagePlanOption[];
  eggs: PackageEggOption[];
  nests: PackageNestOption[];
  onDone: () => void;
}) {
  const action = mode === "create" ? createPackageAction : updatePackageAction;
  const [state, formAction] = useActionState<PackageState, FormData>(action, {});
  const [nestId, setNestId] = useState<string>(pkg?.nestId ? String(pkg.nestId) : "");
  const toast = useToast();
  const router = useRouter();
  const t = useT();

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

  // When a nest is chosen, only its eggs are selectable as the default service.
  const eggOptions = useMemo(
    () => (nestId ? eggs.filter((egg) => egg.nestId === Number(nestId)) : eggs),
    [eggs, nestId],
  );

  // Group eggs by nest for a readable dropdown when no nest filter is applied.
  const grouped = useMemo(() => {
    const map = new Map<string, PackageEggOption[]>();
    for (const egg of eggOptions) {
      const list = map.get(egg.nestName) ?? [];
      list.push(egg);
      map.set(egg.nestName, list);
    }
    return [...map.entries()];
  }, [eggOptions]);

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" && pkg ? <input type="hidden" name="packageId" value={pkg.id} /> : null}
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("admin.pkgName")} required error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={pkg?.name ?? ""} required placeholder={t("admin.pkgNamePlaceholder")} />
        </Field>
        <Field label={t("admin.pkgSortOrder")} hint={t("admin.pkgSortHint")} error={state.fieldErrors?.sortOrder}>
          <Input name="sortOrder" type="number" min={0} max={9999} defaultValue={pkg?.sortOrder ?? 0} />
        </Field>
      </div>

      <Field label={t("admin.pkgDescription")} error={state.fieldErrors?.description}>
        <Textarea name="description" defaultValue={pkg?.description ?? ""} rows={2} placeholder={t("admin.pkgDescPlaceholder")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("admin.pkgPlan")} required hint={t("admin.pkgPlanHint")} error={state.fieldErrors?.planId}>
          <Select name="planId" defaultValue={pkg?.planId ? String(pkg.planId) : ""} required>
            <option value="" disabled>
              {t("admin.pkgSelectPlan")}
            </option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} {plan.isActive ? "" : t("admin.pkgHidden")}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t("admin.pkgAllowedNest")} hint={t("admin.pkgAllowedNestHint")} error={state.fieldErrors?.nestId}>
          <Select name="nestId" value={nestId} onChange={(event) => setNestId(event.target.value)}>
            <option value="">{t("admin.pkgAnyNest")}</option>
            {nests.map((nest) => (
              <option key={nest.id} value={nest.id}>
                {nest.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t("admin.pkgDefaultService")} required hint={t("admin.pkgDefaultServiceHint")} error={state.fieldErrors?.eggId}>
        <Select name="eggId" defaultValue={pkg?.eggId ? String(pkg.eggId) : ""} required>
          <option value="" disabled>
            {t("admin.pkgSelectService")}
          </option>
          {grouped.map(([nestName, items]) => (
            <optgroup key={nestName} label={nestName}>
              {items.map((egg) => (
                <option key={egg.id} value={egg.id}>
                  {egg.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>

      <Field
        label={t("admin.pkgMinPlan")}
        hint={t("admin.pkgMinPlanHint")}
        error={state.fieldErrors?.requiredPlanId}
      >
        <Select name="requiredPlanId" defaultValue={pkg?.requiredPlanId ? String(pkg.requiredPlanId) : ""}>
          <option value="">{t("admin.pkgNoMinimum")}</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} {plan.isActive ? "" : t("admin.pkgHidden")}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-ink-muted">{t("admin.pkgAvailableOnPlans")}</legend>
        <p className="text-xs text-ink-dim">{t("admin.pkgAvailableOnPlansHint")}</p>
        {plans.length === 0 ? (
          <p className="text-xs text-ink-dim">{t("admin.pkgNoPlansAvailable")}</p>
        ) : (
          <div className="grid max-h-40 gap-1.5 overflow-y-auto rounded-md border border-line-soft p-2.5 sm:grid-cols-2">
            {plans.map((plan) => (
              <Checkbox
                key={plan.id}
                name="availablePlanIds"
                value={plan.id}
                defaultChecked={(pkg?.availablePlanIds ?? []).includes(plan.id)}
                label={plan.name}
              />
            ))}
          </div>
        )}
      </fieldset>

      <Checkbox name="isPublic" defaultChecked={pkg?.isPublic ?? true} label={t("admin.pkgPublicLabel")} description={t("admin.pkgPublicDesc")} />

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <SubmitButton pendingLabel={t("common.saving")}>{mode === "create" ? t("admin.pkgCreatePackageBtn") : t("admin.pkgSavePackage")}</SubmitButton>
      </div>
    </form>
  );
}

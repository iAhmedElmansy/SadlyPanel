"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createPlanAction,
  deletePlanAction,
  updatePlanAction,
  type PlanState,
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
import { RESOURCE_LIMIT_FIELDS, BILLING_CYCLES, PLAN_CURRENCIES } from "@/lib/constants";
import { formatMib, formatPrice } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

export type PlanRow = {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  isPublic: boolean;
  priceCents: number;
  currency: string;
  billingCycle: string;
  sortOrder: number;
  memory: number;
  swap: number;
  disk: number;
  io: number;
  cpu: number;
  threads: string | null;
  oomKiller: boolean;
  databaseLimit: number;
  allocationLimit: number;
  backupLimit: number;
  packageCount: number;
  serverCount: number;
};

export function PlanManager({ plans }: { plans: PlanRow[] }) {
  const [modal, setModal] = useState<{ mode: "create" | "edit"; plan?: PlanRow } | null>(null);
  const { confirm, dialog } = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const t = useT();

  const report = (result: PlanState) => {
    if (result.error) toast.push(result.error, "bad");
    else if (result.success) toast.push(result.success, "ok");
    result.warnings?.forEach((warning) => toast.push(warning, "warn"));
    router.refresh();
  };

  const columns: Column<PlanRow>[] = [
    {
      key: "name",
      header: t("admin.pmColPlan"),
      render: (plan) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{plan.name}</span>
            {plan.isActive ? <Badge tone="ok">{t("admin.pmActive")}</Badge> : <Badge tone="neutral">{t("admin.pmHidden")}</Badge>}
            {plan.isPublic ? <Badge tone="brand">{t("admin.pmPublic")}</Badge> : <Badge tone="neutral">{t("admin.pmPrivate")}</Badge>}
          </div>
          {plan.description ? <p className="mt-0.5 truncate text-xs text-ink-dim">{plan.description}</p> : null}
        </div>
      ),
    },
    { key: "memory", header: t("admin.pmColMemory"), render: (plan) => formatMib(plan.memory) },
    { key: "disk", header: t("admin.pmColDisk"), render: (plan) => formatMib(plan.disk) },
    { key: "cpu", header: t("admin.pmColCpu"), align: "right", render: (plan) => `${plan.cpu}%` },
    {
      key: "price",
      header: t("admin.pmColPrice"),
      align: "right",
      render: (plan) => (
        <span className="font-mono text-xs text-ink">{formatPrice(plan.priceCents, plan.currency, plan.billingCycle)}</span>
      ),
    },
    {
      key: "usage",
      header: t("admin.pmColInUse"),
      align: "right",
      render: (plan) => (
        <span className="text-xs text-ink-dim">
          {t("admin.pmInUseValue", { packages: plan.packageCount, servers: plan.serverCount })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (plan) => (
        <TableActions>
          <button
            type="button"
            title={t("admin.pmEditPlan")}
            onClick={() => setModal({ mode: "edit", plan })}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title={t("admin.pmDeletePlan")}
            onClick={async () => {
              if (
                !(await confirm({
                  title: t("admin.pmDeleteTitle", { name: plan.name }),
                  description: t("admin.pmDeleteDesc"),
                  tone: "danger",
                  confirmLabel: t("admin.pmDeletePlan"),
                }))
              )
                return;
              report(await deletePlanAction(plan.id));
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
        <p className="text-xs text-ink-dim">{t("admin.pmCount", { count: plans.length })}</p>
        <Button onClick={() => setModal({ mode: "create" })}>
          <Plus className="size-3.5" />
          {t("admin.pmNewPlan")}
        </Button>
      </div>

      {plans.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers className="size-5" />}
            title={t("admin.pmEmptyTitle")}
            description={t("admin.pmEmptyDesc")}
            action={
              <Button onClick={() => setModal({ mode: "create" })}>
                <Plus className="size-3.5" />
                {t("admin.pmCreatePlan")}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="animate-in p-2">
          <DataTable columns={columns} rows={plans} keyField="id" />
        </Card>
      )}

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.mode === "edit" ? t("admin.pmEditTitle", { name: modal.plan?.name ?? "" }) : t("admin.pmNewPlan")}
        description={t("admin.pmModalDesc")}
        width="lg"
      >
        {modal ? <PlanForm mode={modal.mode} plan={modal.plan} onDone={() => setModal(null)} /> : null}
      </Modal>
      {dialog}
    </>
  );
}

function PlanForm({ mode, plan, onDone }: { mode: "create" | "edit"; plan?: PlanRow; onDone: () => void }) {
  const action = mode === "create" ? createPlanAction : updatePlanAction;
  const [state, formAction] = useActionState<PlanState, FormData>(action, {});
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

  const value = (key: keyof PlanRow): number => {
    if (plan) return plan[key] as number;
    return RESOURCE_LIMIT_FIELDS.find((field) => field.key === key)?.default ?? 0;
  };

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" && plan ? <input type="hidden" name="planId" value={plan.id} /> : null}
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("admin.pmName")} required error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={plan?.name ?? ""} required placeholder={t("admin.pmNamePlaceholder")} />
        </Field>
        <Field label={t("admin.pmSortOrder")} hint={t("admin.pmSortHint")} error={state.fieldErrors?.sortOrder}>
          <Input name="sortOrder" type="number" min={0} max={9999} defaultValue={plan?.sortOrder ?? 0} />
        </Field>
      </div>

      <Field label={t("admin.pmDescription")} error={state.fieldErrors?.description}>
        <Textarea name="description" defaultValue={plan?.description ?? ""} rows={2} placeholder={t("admin.pmDescPlaceholder")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("admin.pmPrice")} hint={t("admin.pmPriceHint")} error={state.fieldErrors?.priceCents}>
          <Input
            name="price"
            type="number"
            min={0}
            step="0.01"
            defaultValue={plan ? (plan.priceCents / 100).toFixed(2) : "0.00"}
          />
        </Field>
        <Field label={t("admin.pmCurrency")} error={state.fieldErrors?.currency}>
          <Select name="currency" defaultValue={plan?.currency ?? "USD"}>
            {PLAN_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("admin.pmBillingCycle")} error={state.fieldErrors?.billingCycle}>
          <Select name="billingCycle" defaultValue={plan?.billingCycle ?? "monthly"}>
            {BILLING_CYCLES.map((cycle) => (
              <option key={cycle} value={cycle}>
                {cycle}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {RESOURCE_LIMIT_FIELDS.map((field) => (
          <Field key={field.key} label={field.label} hint={field.hint} error={state.fieldErrors?.[field.key]}>
            <Input
              name={field.key}
              type="number"
              min={field.min}
              max={field.max}
              step={field.step}
              defaultValue={value(field.key as keyof PlanRow)}
            />
          </Field>
        ))}
        <Field label={t("admin.pmPinnedCores")} hint={t("admin.pmPinnedHint")} error={state.fieldErrors?.threads}>
          <Input name="threads" defaultValue={plan?.threads ?? ""} placeholder={t("admin.pmPinnedPlaceholder")} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Checkbox name="oomKiller" defaultChecked={plan?.oomKiller ?? false} label={t("admin.pmOomKiller")} description={t("admin.pmOomKillerDesc")} />
        <Checkbox name="isActive" defaultChecked={plan?.isActive ?? true} label={t("admin.pmActiveLabel")} description={t("admin.pmActiveDesc")} />
        <Checkbox name="isPublic" defaultChecked={plan?.isPublic ?? true} label={t("admin.pmPublicLabel")} description={t("admin.pmPublicDesc")} />
      </div>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <SubmitButton pendingLabel={t("common.saving")}>{mode === "create" ? t("admin.pmCreatePlan") : t("admin.pmSavePlan")}</SubmitButton>
      </div>
    </form>
  );
}

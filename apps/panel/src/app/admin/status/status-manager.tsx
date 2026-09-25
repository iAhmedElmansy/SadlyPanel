"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  LayoutGrid,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Tags,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  checkNowAction,
  createCategoryAction,
  createComponentAction,
  createIncidentAction,
  deleteCategoryAction,
  deleteComponentAction,
  deleteIncidentAction,
  postUpdateAction,
  reorderComponentAction,
  toggleMonitorAction,
  toggleVisibleAction,
  updateCategoryAction,
  updateComponentAction,
  type StatusState,
} from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, TableActions, type Column } from "@/components/ui/table";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import {
  INCIDENT_IMPACTS,
  INCIDENT_IMPACT_LABELS,
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABELS,
  MONITOR_INTERVALS,
  MONITOR_TYPE_LABELS,
  MONITOR_TYPES,
  STATUS_COMPONENT_KINDS,
  STATUS_COMPONENT_KIND_LABELS,
  type IncidentImpact,
  type IncidentStatus,
} from "@/lib/constants";

export type CategoryRow = { id: number; name: string; sortOrder: number };
export type ComponentRow = {
  id: number;
  name: string;
  kind: string;
  categoryId: number | null;
  sortOrder: number;
  monitorEnabled: boolean;
  monitorType: string;
  monitorTarget: string;
  intervalSeconds: number;
  visible: boolean;
  lastStatus: string | null;
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
};
export type IncidentUpdateRow = { id: number; body: string; status: string; createdAt: string };
export type IncidentRow = {
  id: number;
  title: string;
  impact: string;
  status: string;
  startedAt: string;
  resolvedAt: string | null;
  updates: IncidentUpdateRow[];
};

const IMPACT_TONE: Record<string, "warn" | "bad"> = { minor: "warn", major: "warn", critical: "bad" };

function statusTone(status: string): "ok" | "warn" | "info" | "bad" {
  if (status === "resolved") return "ok";
  if (status === "monitoring") return "info";
  if (status === "identified") return "warn";
  return "bad";
}

const MONITOR_STATE_TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = {
  up: "ok",
  degraded: "warn",
  down: "bad",
};

export function StatusManager({
  categories,
  components,
  incidents,
}: {
  categories: CategoryRow[];
  components: ComponentRow[];
  incidents: IncidentRow[];
}) {
  const { confirm, dialog } = useConfirm();
  const toast = useToast();
  const router = useRouter();

  const [componentModal, setComponentModal] = useState<{ mode: "create" | "edit"; component?: ComponentRow } | null>(null);
  const [categoryModal, setCategoryModal] = useState<{ mode: "create" | "edit"; category?: CategoryRow } | null>(null);
  const [incidentModal, setIncidentModal] = useState(false);
  const [updateModal, setUpdateModal] = useState<IncidentRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const report = (result: StatusState) => {
    if (result.error) toast.push(result.error, "bad");
    else if (result.success) toast.push(result.success, "ok");
    router.refresh();
  };

  const act = async (id: number, fn: () => Promise<StatusState>) => {
    setBusyId(id);
    report(await fn());
    setBusyId(null);
  };

  const categoryName = (id: number | null): string | null => categories.find((cat) => cat.id === id)?.name ?? null;

  const componentColumns: Column<ComponentRow>[] = [
    {
      key: "name",
      header: "Component",
      render: (c) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{c.name}</span>
            <Badge tone="neutral">{STATUS_COMPONENT_KIND_LABELS[c.kind as keyof typeof STATUS_COMPONENT_KIND_LABELS] ?? c.kind}</Badge>
            {categoryName(c.categoryId) ? <Badge tone="info">{categoryName(c.categoryId)}</Badge> : null}
            {!c.visible ? <Badge tone="neutral">Hidden</Badge> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-dim">
            {c.monitorEnabled
              ? `${MONITOR_TYPE_LABELS[c.monitorType as keyof typeof MONITOR_TYPE_LABELS] ?? c.monitorType} · ${c.monitorTarget || "—"} · every ${c.intervalSeconds}s`
              : "Monitoring off"}
          </p>
        </div>
      ),
    },
    {
      key: "state",
      header: "State",
      render: (c) =>
        c.monitorEnabled && c.lastStatus ? (
          <div className="flex flex-col gap-0.5">
            <Badge tone={MONITOR_STATE_TONE[c.lastStatus] ?? "neutral"}>
              <span className="size-1.5 rounded-full bg-current" aria-hidden />
              {c.lastStatus}
            </Badge>
            <span className="text-[10px] text-ink-dim">
              {c.lastCheckedAt ? formatDate(c.lastCheckedAt) : "—"}
              {c.lastLatencyMs !== null ? ` · ${c.lastLatencyMs}ms` : ""}
            </span>
          </div>
        ) : (
          <span className="text-xs text-ink-dim">—</span>
        ),
    },
    { key: "sortOrder", header: "Order", align: "right", render: (c) => <span className="text-xs text-ink-dim">{c.sortOrder}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <TableActions>
          {c.monitorEnabled ? (
            <button
              type="button"
              title="Check now"
              disabled={busyId === c.id}
              onClick={() => void act(c.id, () => checkNowAction(c.id))}
              className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink disabled:opacity-50"
            >
              <RefreshCw className="size-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            title={c.monitorEnabled ? "Pause monitoring" : "Enable monitoring"}
            disabled={busyId === c.id}
            onClick={() => void act(c.id, () => toggleMonitorAction(c.id))}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink disabled:opacity-50"
          >
            {c.monitorEnabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>
          <button
            type="button"
            title={c.visible ? "Hide from public page" : "Show on public page"}
            disabled={busyId === c.id}
            onClick={() => void act(c.id, () => toggleVisibleAction(c.id))}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink disabled:opacity-50"
          >
            {c.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </button>
          <button
            type="button"
            title="Move up"
            onClick={async () => report(await reorderComponentAction(c.id, "up"))}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            type="button"
            title="Move down"
            onClick={async () => report(await reorderComponentAction(c.id, "down"))}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <ArrowDown className="size-3.5" />
          </button>
          <button
            type="button"
            title="Edit component"
            onClick={() => setComponentModal({ mode: "edit", component: c })}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title="Delete component"
            onClick={async () => {
              if (
                !(await confirm({
                  title: `Delete ${c.name}?`,
                  description: "It will no longer appear on the public status page.",
                  tone: "danger",
                  confirmLabel: "Delete",
                }))
              )
                return;
              report(await deleteComponentAction(c.id));
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
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Categories"
          description="Optional groups for the public status page. Components without a category appear under “Other”."
          action={
            <Button onClick={() => setCategoryModal({ mode: "create" })}>
              <Plus className="size-3.5" />
              New category
            </Button>
          }
        />
        <CardBody className="p-2">
          {categories.length === 0 ? (
            <EmptyState
              icon={<Tags className="size-5" />}
              title="No categories"
              description="Categories are optional — add them to group components like “Core services” and “Game nodes”."
            />
          ) : (
            <ul className="divide-y divide-line-soft">
              {categories.map((cat) => (
                <li key={cat.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{cat.name}</span>
                    <span className="text-xs text-ink-dim">#{cat.sortOrder}</span>
                  </div>
                  <TableActions>
                    <button
                      type="button"
                      title="Edit category"
                      onClick={() => setCategoryModal({ mode: "edit", category: cat })}
                      className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete category"
                      onClick={async () => {
                        if (
                          !(await confirm({
                            title: `Delete ${cat.name}?`,
                            description: "Components in this category are kept but become uncategorised.",
                            tone: "danger",
                            confirmLabel: "Delete",
                          }))
                        )
                          return;
                        report(await deleteCategoryAction(cat.id));
                      }}
                      className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </TableActions>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Status components"
          description="Services shown on the public status page, with real ping/HTTP/TCP monitoring and 90-day uptime history."
          action={
            <Button onClick={() => setComponentModal({ mode: "create" })}>
              <Plus className="size-3.5" />
              New component
            </Button>
          }
        />
        <CardBody className="p-2">
          {components.length === 0 ? (
            <EmptyState
              icon={<LayoutGrid className="size-5" />}
              title="No components yet"
              description="Add the services you want to report on, like Panel, API, or a game node."
            />
          ) : (
            <DataTable columns={componentColumns} rows={components} keyField="id" />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Incidents"
          description="Publish incidents and post rolling updates. Resolving an incident stamps its resolve time."
          action={
            <Button onClick={() => setIncidentModal(true)}>
              <Megaphone className="size-3.5" />
              New incident
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {incidents.length === 0 ? (
            <EmptyState
              icon={<Activity className="size-5" />}
              title="No incidents"
              description="When something goes wrong, open an incident here to keep users informed."
            />
          ) : (
            incidents.map((incident) => (
              <div key={incident.id} className="rounded-md border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{incident.title}</span>
                      <Badge tone={IMPACT_TONE[incident.impact] ?? "warn"}>
                        {INCIDENT_IMPACT_LABELS[incident.impact as IncidentImpact] ?? incident.impact}
                      </Badge>
                      <Badge tone={statusTone(incident.status)}>
                        {INCIDENT_STATUS_LABELS[incident.status as IncidentStatus] ?? incident.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-dim">
                      Started {formatDate(incident.startedAt)}
                      {incident.resolvedAt ? ` · Resolved ${formatDate(incident.resolvedAt)}` : ""}
                    </p>
                  </div>
                  <TableActions>
                    {incident.status !== "resolved" ? (
                      <Button variant="ghost" onClick={() => setUpdateModal(incident)}>
                        <Plus className="size-3.5" />
                        Post update
                      </Button>
                    ) : null}
                    <button
                      type="button"
                      title="Delete incident"
                      onClick={async () => {
                        if (
                          !(await confirm({
                            title: `Delete "${incident.title}"?`,
                            description: "This removes the incident and all of its updates permanently.",
                            tone: "danger",
                            confirmLabel: "Delete incident",
                          }))
                        )
                          return;
                        report(await deleteIncidentAction(incident.id));
                      }}
                      className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </TableActions>
                </div>

                {incident.updates.length > 0 ? (
                  <ul className="mt-3 space-y-2 border-t border-line-soft pt-3">
                    {incident.updates.map((u) => (
                      <li key={u.id} className="flex gap-3 text-xs">
                        <span className="shrink-0 pt-0.5">
                          <Badge tone={statusTone(u.status)}>
                            {INCIDENT_STATUS_LABELS[u.status as IncidentStatus] ?? u.status}
                          </Badge>
                        </span>
                        <div className="min-w-0">
                          <p className="whitespace-pre-wrap text-ink-muted">{u.body}</p>
                          <p className="mt-0.5 text-ink-dim">{formatDate(u.createdAt)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Modal
        open={componentModal !== null}
        onClose={() => setComponentModal(null)}
        title={componentModal?.mode === "edit" ? `Edit ${componentModal.component?.name}` : "New component"}
        description="A service line shown on the public status page."
      >
        {componentModal ? (
          <ComponentForm
            mode={componentModal.mode}
            component={componentModal.component}
            categories={categories}
            onDone={() => setComponentModal(null)}
          />
        ) : null}
      </Modal>

      <Modal
        open={categoryModal !== null}
        onClose={() => setCategoryModal(null)}
        title={categoryModal?.mode === "edit" ? `Edit ${categoryModal.category?.name}` : "New category"}
        description="Groups components on the public status page."
      >
        {categoryModal ? (
          <CategoryForm mode={categoryModal.mode} category={categoryModal.category} onDone={() => setCategoryModal(null)} />
        ) : null}
      </Modal>

      <Modal open={incidentModal} onClose={() => setIncidentModal(false)} title="New incident" description="Open an incident with its first update." width="lg">
        {incidentModal ? <IncidentForm onDone={() => setIncidentModal(false)} /> : null}
      </Modal>

      <Modal
        open={updateModal !== null}
        onClose={() => setUpdateModal(null)}
        title={updateModal ? `Update: ${updateModal.title}` : "Post update"}
        description="Post an update and set the current incident status."
        width="lg"
      >
        {updateModal ? <UpdateForm incident={updateModal} onDone={() => setUpdateModal(null)} /> : null}
      </Modal>

      {dialog}
    </div>
  );
}

function useReportedForm(action: (prev: StatusState, fd: FormData) => Promise<StatusState>, onDone: () => void) {
  const [state, formAction] = useActionState<StatusState, FormData>(action, {});
  const toast = useToast();
  const router = useRouter();
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
  return { state, formAction };
}

function ComponentForm({
  mode,
  component,
  categories,
  onDone,
}: {
  mode: "create" | "edit";
  component?: ComponentRow;
  categories: CategoryRow[];
  onDone: () => void;
}) {
  const action = mode === "create" ? createComponentAction : updateComponentAction;
  const { state, formAction } = useReportedForm(action, onDone);
  const [monitorEnabled, setMonitorEnabled] = useState(component?.monitorEnabled ?? false);

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" && component ? <input type="hidden" name="componentId" value={component.id} /> : null}
      <FormError message={state.error} />

      <Field label="Name" required error={state.fieldErrors?.name}>
        <Input name="name" defaultValue={component?.name ?? ""} required placeholder="Panel" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind" error={state.fieldErrors?.kind}>
          <Select name="kind" defaultValue={component?.kind ?? "panel"}>
            {STATUS_COMPONENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {STATUS_COMPONENT_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" hint="Optional group on the public page." error={state.fieldErrors?.categoryId}>
          <Select name="categoryId" defaultValue={component?.categoryId != null ? String(component.categoryId) : ""}>
            <option value="">Uncategorised</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sort order" hint="Lower numbers sort first." error={state.fieldErrors?.sortOrder}>
          <Input name="sortOrder" type="number" min={0} max={9999} defaultValue={component?.sortOrder ?? 0} />
        </Field>
        <Field label="Visibility">
          <Checkbox name="visible" defaultChecked={component?.visible ?? true} label="Show on the public status page" />
        </Field>
      </div>

      <div className="space-y-4 rounded-md border border-line bg-surface-2 p-4">
        <Checkbox
          name="monitorEnabled"
          checked={monitorEnabled}
          onChange={(e) => setMonitorEnabled(e.currentTarget.checked)}
          label="Enable automatic monitoring"
        />

        {monitorEnabled ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Check type" error={state.fieldErrors?.monitorType}>
                <Select name="monitorType" defaultValue={component?.monitorType ?? "http"}>
                  {MONITOR_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {MONITOR_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Interval" hint="How often to probe." error={state.fieldErrors?.intervalSeconds}>
                <Select name="intervalSeconds" defaultValue={String(component?.intervalSeconds ?? 60)}>
                  {MONITOR_INTERVALS.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              label="Target"
              required
              hint="A URL for HTTP checks, or host:port for TCP/ping."
              error={state.fieldErrors?.monitorTarget}
            >
              <Input name="monitorTarget" defaultValue={component?.monitorTarget ?? ""} placeholder="https://panel.example.com" />
            </Field>
          </>
        ) : (
          <p className="text-xs text-ink-dim">
            When off, this component shows no live state or uptime history — set it manually via incidents.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Saving…">{mode === "create" ? "Create component" : "Save component"}</SubmitButton>
      </div>
    </form>
  );
}

function CategoryForm({ mode, category, onDone }: { mode: "create" | "edit"; category?: CategoryRow; onDone: () => void }) {
  const action = mode === "create" ? createCategoryAction : updateCategoryAction;
  const { state, formAction } = useReportedForm(action, onDone);

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" && category ? <input type="hidden" name="categoryId" value={category.id} /> : null}
      <FormError message={state.error} />

      <Field label="Name" required error={state.fieldErrors?.name}>
        <Input name="name" defaultValue={category?.name ?? ""} required placeholder="Core services" />
      </Field>

      <Field label="Sort order" hint="Lower numbers sort first." error={state.fieldErrors?.sortOrder}>
        <Input name="sortOrder" type="number" min={0} max={9999} defaultValue={category?.sortOrder ?? 0} />
      </Field>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Saving…">{mode === "create" ? "Create category" : "Save category"}</SubmitButton>
      </div>
    </form>
  );
}

function IncidentForm({ onDone }: { onDone: () => void }) {
  const { state, formAction } = useReportedForm(createIncidentAction, onDone);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <Field label="Title" required error={state.fieldErrors?.title}>
        <Input name="title" required placeholder="Elevated API latency" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Impact" error={state.fieldErrors?.impact}>
          <Select name="impact" defaultValue="minor">
            {INCIDENT_IMPACTS.map((impact) => (
              <option key={impact} value={impact}>
                {INCIDENT_IMPACT_LABELS[impact]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" error={state.fieldErrors?.status}>
          <Select name="status" defaultValue="investigating">
            {INCIDENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {INCIDENT_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Opening update" required hint="What is happening and what you are doing about it." error={state.fieldErrors?.body}>
        <Textarea name="body" required rows={3} placeholder="We are investigating reports of slow response times on the API." />
      </Field>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Publishing…">Open incident</SubmitButton>
      </div>
    </form>
  );
}

function UpdateForm({ incident, onDone }: { incident: IncidentRow; onDone: () => void }) {
  const { state, formAction } = useReportedForm(postUpdateAction, onDone);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="incidentId" value={incident.id} />
      <FormError message={state.error} />

      <Field label="Status" hint="Choosing Resolved closes the incident." error={state.fieldErrors?.status}>
        <Select name="status" defaultValue={incident.status}>
          {INCIDENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {INCIDENT_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Update" required error={state.fieldErrors?.body}>
        <Textarea name="body" required rows={3} placeholder="We have identified the cause and are rolling out a fix." />
      </Field>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Posting…">Post update</SubmitButton>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  createNestAction,
  deleteEggAction,
  deleteNestAction,
  duplicateEggAction,
  exportEggAction,
  exportNestAction,
  importEggAction,
  renameEggAction,
  updateNestAction,
  type EggState,
} from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { EggForm, EMPTY_EGG, type EggFormValues } from "./egg-form";
import { EggVariables, type VariableRow } from "./egg-variables";
import { useT } from "@/lib/i18n/preferences";

export interface EggRow extends EggFormValues {
  id: number;
  uuid: string;
  serverCount: number;
  variables: VariableRow[];
}

export interface NestRow {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  eggs: EggRow[];
}

const KIND_TONE = { game: "brand", application: "info", webhost: "ok" } as const;

/** Triggers a client-side download of a generated JSON document. */
function downloadJson(fileName: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function EggManager({ nests }: { nests: NestRow[] }) {
  const [expanded, setExpanded] = useState<number[]>(() => nests.slice(0, 1).map((nest) => nest.id));
  const [nestModal, setNestModal] = useState<{ mode: "create" | "edit"; nest?: NestRow } | null>(null);
  const [eggModal, setEggModal] = useState<{ mode: "create" | "edit"; nestId: number; egg?: EggRow } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const { confirm, dialog } = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const t = useT();

  const nestOptions = nests.map((nest) => ({ id: nest.id, name: nest.name }));
  const totalEggs = nests.reduce((sum, nest) => sum + nest.eggs.length, 0);

  const report = (result: EggState) => {
    if (result.error) toast.push(result.error, "bad");
    else if (result.success) toast.push(result.success, "ok");
    result.warnings?.forEach((warning) => toast.push(warning, "warn"));
    router.refresh();
  };

  const exportOne = async (egg: EggRow) => {
    const result = await exportEggAction(egg.id);
    if (!result.ok || !result.json || !result.fileName) {
      toast.push(result.error ?? t("admin.emExportFailed"), "bad");
      return;
    }
    downloadJson(result.fileName, result.json);
    toast.push(t("admin.emDownloaded", { fileName: result.fileName }), "ok");
  };

  const exportWholeNest = async (nest: NestRow) => {
    const result = await exportNestAction(nest.id);
    if (!result.ok || !result.json || !result.fileName) {
      toast.push(result.error ?? t("admin.emExportFailed"), "bad");
      return;
    }
    downloadJson(result.fileName, result.json);
    toast.push(t("admin.emDownloaded", { fileName: result.fileName }), "ok");
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-dim">
          {t("admin.emCount", { nests: nests.length, eggs: totalEggs })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setImportOpen(true)}>
            <Upload className="size-3.5" />
            {t("admin.emImportEgg")}
          </Button>
          <Button variant="ghost" onClick={() => setNestModal({ mode: "create" })}>
            <FolderPlus className="size-3.5" />
            {t("admin.emNewNest")}
          </Button>
          <Button
            onClick={() =>
              nests.length === 0
                ? toast.push(t("admin.emCreateNestFirst"), "warn")
                : setEggModal({ mode: "create", nestId: nests[0]!.id })
            }
          >
            <Plus className="size-3.5" />
            {t("admin.emNewService")}
          </Button>
        </div>
      </div>

      {nests.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Boxes className="size-5" />}
            title={t("admin.emEmptyTitle")}
            description={t("admin.emEmptyDesc")}
            action={
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setImportOpen(true)}>
                  <Upload className="size-3.5" />
                  {t("admin.emImportEgg")}
                </Button>
                <Button onClick={() => setNestModal({ mode: "create" })}>
                  <FolderPlus className="size-3.5" />
                  {t("admin.emCreateNest")}
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {nests.map((nest) => {
            const open = expanded.includes(nest.id);
            return (
              <Card key={nest.id}>
                <CardHeader
                  title={
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((current) =>
                          current.includes(nest.id) ? current.filter((id) => id !== nest.id) : [...current, nest.id],
                        )
                      }
                      className="flex items-center gap-1.5 text-left hover:text-brand-soft"
                    >
                      {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      {nest.name}
                    </button>
                  }
                  description={nest.description ?? undefined}
                  action={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="neutral">{t("admin.emEggCount", { count: nest.eggs.length })}</Badge>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        onClick={() => setEggModal({ mode: "create", nestId: nest.id })}
                      >
                        <Plus className="size-3" />
                        {t("admin.emService")}
                      </Button>
                      <button
                        type="button"
                        title={t("admin.emExportNest")}
                        onClick={() => void exportWholeNest(nest)}
                        className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
                      >
                        <Download className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title={t("admin.emEditNest")}
                        onClick={() => setNestModal({ mode: "edit", nest })}
                        className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title={t("admin.emDeleteNest")}
                        onClick={async () => {
                          if (
                            !(await confirm({
                              title: t("admin.emDeleteNestTitle", { name: nest.name }),
                              description: t("admin.emDeleteNestDesc"),
                              tone: "danger",
                              confirmLabel: t("admin.emDeleteNest"),
                            }))
                          )
                            return;
                          report(await deleteNestAction(nest.id));
                        }}
                        className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  }
                />

                {!open ? null : nest.eggs.length === 0 ? (
                  <CardBody className="text-xs text-ink-dim">
                    {t("admin.emNoServicesInNest")}{" "}
                    <button
                      type="button"
                      onClick={() => setEggModal({ mode: "create", nestId: nest.id })}
                      className="text-brand-soft hover:underline"
                    >
                      {t("admin.emAddOne")}
                    </button>
                    .
                  </CardBody>
                ) : (
                  <div className="divide-y divide-line-soft">
                    {nest.eggs.map((egg) => (
                      <EggPanel
                        key={egg.id}
                        egg={egg}
                        onEdit={() => setEggModal({ mode: "edit", nestId: nest.id, egg })}
                        onExport={() => void exportOne(egg)}
                        onDuplicate={async () => report(await duplicateEggAction(egg.id))}
                        onDelete={async () => {
                          if (
                            !(await confirm({
                              title: `Delete service ${egg.name}?`,
                              tone: "danger",
                              confirmLabel: "Delete service",
                            }))
                          )
                            return;
                          report(await deleteEggAction(egg.id));
                        }}
                        onRename={async (name) => report(await renameEggAction(egg.id, name))}
                      />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={nestModal !== null}
        onClose={() => setNestModal(null)}
        title={nestModal?.mode === "edit" ? `Edit ${nestModal.nest?.name}` : "New nest"}
        description="Nests group related services together."
      >
        {nestModal ? <NestForm mode={nestModal.mode} nest={nestModal.nest} onDone={() => setNestModal(null)} /> : null}
      </Modal>

      <Modal
        open={eggModal !== null}
        onClose={() => setEggModal(null)}
        title={eggModal?.mode === "edit" ? `Edit ${eggModal.egg?.name}` : "New service"}
        description="A service defines the docker image, startup command, parsers and install script."
        width="lg"
      >
        {eggModal ? (
          <EggForm
            mode={eggModal.mode}
            nests={nestOptions}
            values={
              eggModal.egg
                ? eggModal.egg
                : { ...EMPTY_EGG, nestId: eggModal.nestId }
            }
            onDone={() => setEggModal(null)}
          />
        ) : null}
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import egg"
        description="Accepts Pterodactyl PTDL_v1/v2 eggs and SPanel exports."
        width="lg"
      >
        <ImportForm nests={nestOptions} onDone={() => setImportOpen(false)} />
      </Modal>
      {dialog}
    </>
  );
}

function EggPanel({
  egg,
  onEdit,
  onExport,
  onDuplicate,
  onDelete,
  onRename,
}: {
  egg: EggRow;
  onEdit: () => void;
  onExport: () => void;
  onDuplicate: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onRename: (name: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(egg.name);

  let images: Record<string, string> = {};
  try {
    images = JSON.parse(egg.dockerImages || "{}") as Record<string, string>;
  } catch {
    images = {};
  }
  let features: string[] = [];
  try {
    const parsed = JSON.parse(egg.features || "[]");
    features = Array.isArray(parsed) ? parsed.filter((f): f is string => typeof f === "string") : [];
  } catch {
    features = [];
  }

  return (
    <div className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {renaming ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                await onRename(draftName);
                setRenaming(false);
              }}
              className="flex items-center gap-1.5"
            >
              <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} autoFocus className="h-7 py-1" />
              <SubmitButton className="px-2 py-1 text-xs">Save</SubmitButton>
              <Button
                type="button"
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() => {
                  setDraftName(egg.name);
                  setRenaming(false);
                }}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <button type="button" onClick={() => setOpen((value) => !value)} className="text-sm font-medium text-ink hover:text-brand-soft">
              {egg.name}
            </button>
          )}
          <Badge tone={KIND_TONE[egg.kind as keyof typeof KIND_TONE] ?? "neutral"}>{egg.kind}</Badge>
          {features.map((feature) => (
            <Badge key={feature} tone="neutral">
              {feature}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="hidden text-xs text-ink-dim sm:inline">
            {egg.serverCount} server(s) · {egg.variables.length} variable(s)
          </span>
          <button
            type="button"
            title="Rename"
            onClick={() => setRenaming(true)}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title="Duplicate"
            onClick={() => void onDuplicate()}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <Copy className="size-3.5" />
          </button>
          <button
            type="button"
            title="Export egg JSON"
            onClick={onExport}
            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
          >
            <Download className="size-3.5" />
          </button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onEdit}>
            Configure
          </Button>
          <button
            type="button"
            title="Delete service"
            onClick={() => void onDelete()}
            className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {egg.description ? <p className="text-xs text-ink-muted">{egg.description}</p> : null}

      <dl className="grid gap-3 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-ink-dim">Startup</dt>
          <dd className="truncate font-mono text-ink-muted" title={egg.startup}>
            {egg.startup}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-dim">Images</dt>
          <dd className="truncate font-mono text-ink-muted" title={Object.values(images).join(", ")}>
            {Object.values(images).join(", ") || "—"}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 text-xs text-brand-soft hover:underline"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {open ? "Hide variables" : `Variables (${egg.variables.length})`}
      </button>

      {open ? <EggVariables eggId={egg.id} variables={egg.variables} /> : null}
    </div>
  );
}

function NestForm({ mode, nest, onDone }: { mode: "create" | "edit"; nest?: NestRow; onDone: () => void }) {
  const action = mode === "create" ? createNestAction : updateNestAction;
  const [state, formAction] = useActionState<EggState, FormData>(action, {});
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

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" && nest ? <input type="hidden" name="nestId" value={nest.id} /> : null}
      <FormError message={state.error} />
      <Field label="Name" required error={state.fieldErrors?.name}>
        <Input name="name" defaultValue={nest?.name ?? ""} required placeholder="Minecraft" />
      </Field>
      <Field label="Description" error={state.fieldErrors?.description}>
        <Textarea name="description" defaultValue={nest?.description ?? ""} rows={2} />
      </Field>
      <Field label="Icon" hint="Free-form label used by the UI." error={state.fieldErrors?.icon}>
        <Input name="icon" defaultValue={nest?.icon ?? ""} placeholder="minecraft" />
      </Field>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Saving…">{mode === "create" ? "Create nest" : "Save nest"}</SubmitButton>
      </div>
    </form>
  );
}

function ImportForm({ nests, onDone }: { nests: { id: number; name: string }[]; onDone: () => void }) {
  const [state, formAction] = useActionState<EggState, FormData>(importEggAction, {});
  const [fileName, setFileName] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.push(state.success, "ok");
      state.warnings?.forEach((warning) => toast.push(warning, "warn"));
      router.refresh();
      onDone();
    } else if (state.error) {
      toast.push(state.error, "bad");
      state.warnings?.forEach((warning) => toast.push(warning, "warn"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <Field label="Egg file" hint="A Pterodactyl egg-*.json export, or an array of them.">
        <input
          type="file"
          name="file"
          accept="application/json,.json"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          className="input-base cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-surface-3 file:px-2 file:py-1 file:text-xs file:text-ink"
        />
      </Field>

      <Field label="…or paste the JSON" hint={fileName ? `Ignored while ${fileName} is selected.` : undefined}>
        <Textarea name="json" rows={8} className="font-mono text-xs" placeholder='{ "meta": { "version": "PTDL_v2" }, … }' />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Destination nest" hint="Leave empty to use the nest named in the file.">
          <Select name="nestId" defaultValue="">
            <option value="">Auto / create</option>
            {nests.map((nest) => (
              <option key={nest.id} value={nest.id}>
                {nest.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="New nest name" hint="Used when no destination is selected.">
          <Input name="newNestName" placeholder="Imported" />
        </Field>
      </div>

      <Checkbox
        name="overwrite"
        label="Overwrite if it already exists"
        description="Updates the matching egg in place (matched by uuid, then by name) and prunes variables the file omits."
      />

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Importing…">
          <Upload className="size-3.5" />
          Import
        </SubmitButton>
      </div>
    </form>
  );
}

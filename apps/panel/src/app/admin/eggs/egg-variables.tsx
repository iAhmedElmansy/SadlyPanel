"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  createEggVariableAction,
  deleteEggVariableAction,
  updateEggVariableAction,
  type EggState,
} from "./actions";
import { Button, SubmitButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, FormError, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

export interface VariableRow {
  id: number;
  name: string;
  description: string | null;
  envVariable: string;
  defaultValue: string;
  userViewable: boolean;
  userEditable: boolean;
  rules: string;
  sortOrder: number;
}

const RULE_PRESETS = [
  "required|string|max:40",
  "required|numeric|between:1,65535",
  "nullable|string",
  "required|boolean",
  "required|in:true,false",
];

export function EggVariables({ eggId, variables }: { eggId: number; variables: VariableRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<VariableRow | null>(null);
  const toast = useToast();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-dim">
          {variables.length === 0
            ? "No variables. Users will only see the resource limits."
            : `${variables.length} variable(s) · ${variables.filter((v) => v.userEditable).length} editable by users`}
        </p>
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3" />
          Add variable
        </Button>
      </div>

      {variables.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="table-base">
            <thead>
              <tr>
                <th>Label</th>
                <th>Variable</th>
                <th>Default</th>
                <th>Access</th>
                <th>Rules</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {variables.map((variable) => (
                <tr key={variable.id}>
                  <td className="text-ink">
                    {variable.name}
                    {variable.description ? (
                      <span className="block max-w-72 truncate text-[11px] text-ink-dim">{variable.description}</span>
                    ) : null}
                  </td>
                  <td className="font-mono text-xs text-brand-soft">{variable.envVariable}</td>
                  <td className="max-w-40 truncate font-mono text-xs text-ink-muted" title={variable.defaultValue}>
                    {variable.defaultValue || "—"}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {variable.userViewable ? <Badge tone="info">view</Badge> : <Badge tone="neutral">hidden</Badge>}
                      {variable.userEditable ? <Badge tone="ok">edit</Badge> : <Badge tone="neutral">locked</Badge>}
                    </div>
                  </td>
                  <td className="max-w-40 truncate font-mono text-[11px] text-ink-dim" title={variable.rules}>
                    {variable.rules}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        title="Edit variable"
                        onClick={() => setEditing(variable)}
                        className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Delete variable"
                        onClick={async () => {
                          if (
                            !(await confirm({
                              title: `Delete ${variable.envVariable}?`,
                              tone: "danger",
                              confirmLabel: "Delete variable",
                            }))
                          )
                            return;
                          const result = await deleteEggVariableAction(variable.id);
                          if (result.error) toast.push(result.error, "bad");
                          else if (result.success) toast.push(result.success, "ok");
                          result.warnings?.forEach((warning) => toast.push(warning, "warn"));
                          router.refresh();
                        }}
                        className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add variable"
        description="Exposed to the container as an environment variable and usable as {{NAME}} in the startup command."
      >
        <VariableForm mode="create" eggId={eggId} nextSort={variables.length} onDone={() => setCreateOpen(false)} />
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={`Edit ${editing?.envVariable ?? ""}`}>
        {editing ? (
          <VariableForm mode="edit" eggId={eggId} variable={editing} onDone={() => setEditing(null)} />
        ) : null}
      </Modal>
      {dialog}
    </div>
  );
}

function VariableForm({
  mode,
  eggId,
  variable,
  nextSort = 0,
  onDone,
}: {
  mode: "create" | "edit";
  eggId: number;
  variable?: VariableRow;
  nextSort?: number;
  onDone: () => void;
}) {
  const action = mode === "create" ? createEggVariableAction : updateEggVariableAction;
  const [state, formAction] = useActionState<EggState, FormData>(action, {});
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errorFor = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="eggId" value={eggId} />
      {mode === "edit" && variable ? <input type="hidden" name="variableId" value={variable.id} /> : null}
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label" required error={errorFor("name")}>
          <Input name="name" defaultValue={variable?.name ?? ""} required placeholder="Server jar file" />
        </Field>
        <Field label="Environment variable" required hint="Uppercase, no spaces." error={errorFor("envVariable")}>
          <Input
            name="envVariable"
            defaultValue={variable?.envVariable ?? ""}
            required
            placeholder="SERVER_JARFILE"
            className="font-mono"
          />
        </Field>
      </div>

      <Field label="Description" error={errorFor("description")}>
        <Textarea name="description" defaultValue={variable?.description ?? ""} rows={2} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Default value" error={errorFor("defaultValue")}>
          <Input name="defaultValue" defaultValue={variable?.defaultValue ?? ""} className="font-mono text-xs" />
        </Field>
        <Field label="Sort order" error={errorFor("sortOrder")}>
          <Input name="sortOrder" type="number" min={0} max={999} defaultValue={variable?.sortOrder ?? nextSort} />
        </Field>
      </div>

      <Field
        label="Validation rules"
        hint="Laravel-style rules, kept for Pterodactyl egg compatibility."
        error={errorFor("rules")}
      >
        <Input
          name="rules"
          defaultValue={variable?.rules ?? "nullable|string"}
          list="variable-rule-presets"
          className="font-mono text-xs"
        />
        <datalist id="variable-rule-presets">
          {RULE_PRESETS.map((preset) => (
            <option key={preset} value={preset} />
          ))}
        </datalist>
      </Field>

      <div className="space-y-2">
        <Checkbox
          name="userViewable"
          defaultChecked={variable?.userViewable ?? true}
          label="Visible to users"
          description="Uncheck for secrets such as API tokens."
        />
        <Checkbox
          name="userEditable"
          defaultChecked={variable?.userEditable ?? true}
          label="Editable by users"
          description="Uncheck to lock the value to the default."
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Saving…">{mode === "create" ? "Add variable" : "Save variable"}</SubmitButton>
      </div>
    </form>
  );
}

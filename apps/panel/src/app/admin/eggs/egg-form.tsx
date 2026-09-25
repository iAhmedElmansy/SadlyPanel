"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createEggAction, updateEggAction, type EggState } from "./actions";
import { Button, SubmitButton } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { SegmentedTabs } from "@/components/layout/tabs";
import { useToast } from "@/components/ui/toast";
import { SERVICE_KINDS } from "@/lib/constants";

export interface EggFormValues {
  id?: number;
  nestId: number;
  name: string;
  description: string;
  kind: string;
  author: string;
  dockerImages: string;
  startup: string;
  configFiles: string;
  configStartup: string;
  configLogs: string;
  configStop: string;
  scriptContainer: string;
  scriptEntry: string;
  scriptInstall: string;
  features: string;
  fileDenylist: string;
  forceOutgoingIp: boolean;
  sortOrder: number;
}

export const EMPTY_EGG: EggFormValues = {
  nestId: 0,
  name: "",
  description: "",
  kind: "game",
  author: "spanel@sadlystudios.bond",
  dockerImages: '{\n  "Java 21": "ghcr.io/pterodactyl/yolks:java_21"\n}',
  startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}} nogui",
  configFiles: "{}",
  configStartup: '{\n  "done": ")! For help, type "\n}',
  configLogs: '{\n  "custom": false,\n  "location": "logs/latest.log"\n}',
  configStop: "^C",
  scriptContainer: "ghcr.io/pterodactyl/installers:alpine",
  scriptEntry: "ash",
  scriptInstall: "#!/bin/ash\n# Runs once, before the first boot. /mnt/server is the server volume.\n",
  features: "[]",
  fileDenylist: "[]",
  forceOutgoingIp: false,
  sortOrder: 0,
};

const KNOWN_FEATURES = ["eula", "java_version", "pid_limit", "webhost", "php", "steam_disk_space"];

/**
 * Create/edit form for a service (egg). Grouped into panes because an egg has a
 * lot of surface: identity, runtime, parser config and the install script.
 */
export function EggForm({
  mode,
  values,
  nests,
  onDone,
}: {
  mode: "create" | "edit";
  values: EggFormValues;
  nests: { id: number; name: string }[];
  onDone?: () => void;
}) {
  const action = mode === "create" ? createEggAction : updateEggAction;
  const [state, formAction] = useActionState<EggState, FormData>(action, {});
  const [pane, setPane] = useState<"general" | "runtime" | "config" | "install">("general");
  const [features, setFeatures] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(values.features || "[]");
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
    } catch {
      return [];
    }
  });
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.push(state.success, "ok");
      state.warnings?.forEach((warning) => toast.push(warning, "warn"));
      router.refresh();
      onDone?.();
    } else if (state.error) {
      toast.push(state.error, "bad");
    }
    // Only react to a new action result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errorFor = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" && values.id ? <input type="hidden" name="eggId" value={values.id} /> : null}
      <input type="hidden" name="features" value={JSON.stringify(features)} />

      <FormError message={state.error} />

      <SegmentedTabs
        items={[
          { key: "general", label: "General" },
          { key: "runtime", label: "Runtime" },
          { key: "config", label: "Parsers" },
          { key: "install", label: "Install script" },
        ]}
        active={pane}
        onChange={(key) => setPane(key as typeof pane)}
      />

      <div className={pane === "general" ? "space-y-4" : "hidden"}>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Name" required error={errorFor("name")}>
            <Input name="name" defaultValue={values.name} required placeholder="Paper" />
          </Field>
          <Field label="Nest" required error={errorFor("nestId")}>
            <Select name="nestId" defaultValue={values.nestId || nests[0]?.id} required>
              {nests.map((nest) => (
                <option key={nest.id} value={nest.id}>
                  {nest.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Description" error={errorFor("description")}>
          <Textarea name="description" defaultValue={values.description} rows={2} placeholder="What this service runs." />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Service kind" required hint="Drives the deployment flow." error={errorFor("kind")}>
            <Select name="kind" defaultValue={values.kind}>
              {SERVICE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Author" error={errorFor("author")}>
            <Input name="author" defaultValue={values.author} placeholder="you@example.com" />
          </Field>
          <Field label="Sort order" hint="Lower shows first." error={errorFor("sortOrder")}>
            <Input name="sortOrder" type="number" min={0} max={9999} defaultValue={values.sortOrder} />
          </Field>
        </div>

        <Field label="Features" hint="Behaviour toggles honoured by the daemon.">
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...KNOWN_FEATURES, ...features])].map((feature) => {
              const enabled = features.includes(feature);
              return (
                <button
                  key={feature}
                  type="button"
                  onClick={() =>
                    setFeatures((current) =>
                      current.includes(feature) ? current.filter((f) => f !== feature) : [...current, feature],
                    )
                  }
                  className={`badge cursor-pointer ${
                    enabled ? "border-brand/40 bg-brand/12 text-brand-soft" : "border-line bg-surface-2 text-ink-dim"
                  }`}
                >
                  {feature}
                </button>
              );
            })}
          </div>
        </Field>
      </div>

      <div className={pane === "runtime" ? "space-y-4" : "hidden"}>
        <Field
          label="Docker images"
          required
          hint='JSON map of label to image, e.g. { "Java 21": "ghcr.io/pterodactyl/yolks:java_21" }'
          error={errorFor("dockerImages")}
        >
          <Textarea name="dockerImages" defaultValue={values.dockerImages} rows={5} className="font-mono text-xs" />
        </Field>

        <Field
          label="Startup command"
          required
          hint="{{VARIABLE}} tokens are replaced with the server's environment."
          error={errorFor("startup")}
        >
          <Textarea name="startup" defaultValue={values.startup} rows={3} className="font-mono text-xs" required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Stop command / signal"
            required
            hint="^C for console stop, SIGQUIT/SIGTERM, or a console command like `stop`."
            error={errorFor("configStop")}
          >
            <Input name="configStop" defaultValue={values.configStop} required className="font-mono" />
          </Field>
          <Field label="File denylist" hint="JSON array of paths users may not touch." error={errorFor("fileDenylist")}>
            <Input name="fileDenylist" defaultValue={values.fileDenylist} className="font-mono text-xs" />
          </Field>
        </div>

        <Checkbox
          name="forceOutgoingIp"
          defaultChecked={values.forceOutgoingIp}
          label="Force outgoing IP"
          description="Bind outbound traffic to the server's primary allocation IP."
        />
      </div>

      <div className={pane === "config" ? "space-y-4" : "hidden"}>
        <Field
          label="Configuration files"
          hint="Pterodactyl-style parser map, used to rewrite ports/IPs on boot."
          error={errorFor("configFiles")}
        >
          <Textarea name="configFiles" defaultValue={values.configFiles} rows={6} className="font-mono text-xs" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Startup detection" hint='e.g. { "done": ")! For help, type " }' error={errorFor("configStartup")}>
            <Textarea name="configStartup" defaultValue={values.configStartup} rows={4} className="font-mono text-xs" />
          </Field>
          <Field label="Log configuration" hint='e.g. { "custom": false, "location": "logs/latest.log" }' error={errorFor("configLogs")}>
            <Textarea name="configLogs" defaultValue={values.configLogs} rows={4} className="font-mono text-xs" />
          </Field>
        </div>
      </div>

      <div className={pane === "install" ? "space-y-4" : "hidden"}>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Installer image" required error={errorFor("scriptContainer")}>
            <Input name="scriptContainer" defaultValue={values.scriptContainer} required className="font-mono text-xs" />
          </Field>
          <Field label="Entrypoint" required hint="ash for alpine, bash for debian." error={errorFor("scriptEntry")}>
            <Input name="scriptEntry" defaultValue={values.scriptEntry} required className="font-mono" />
          </Field>
        </div>
        <Field
          label="Install script"
          hint="Runs once in a throwaway container with the volume mounted at /mnt/server."
          error={errorFor("scriptInstall")}
        >
          <Textarea name="scriptInstall" defaultValue={values.scriptInstall} rows={16} className="font-mono text-xs" />
        </Field>
      </div>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Close
          </Button>
        ) : null}
        <SubmitButton pendingLabel="Saving…">{mode === "create" ? "Create service" : "Save service"}</SubmitButton>
      </div>
    </form>
  );
}

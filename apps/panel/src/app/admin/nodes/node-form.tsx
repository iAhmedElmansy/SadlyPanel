"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Checkbox, Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createNodeAction, updateNodeAction, type NodeState } from "./actions";

export interface NodeFormValues {
  id?: number;
  name: string;
  description: string;
  locationId: number | null;
  fqdn: string;
  scheme: string;
  behindProxy: boolean;
  public: boolean;
  maintenanceMode: boolean;
  memory: number;
  memoryOverallocate: number;
  disk: number;
  diskOverallocate: number;
  cpu: number;
  cpuOverallocate: number;
  uploadSize: number;
  daemonBase: string;
  daemonListenHost: string;
  daemonPort: number;
  daemonSftpPort: number;
  proxyEnabled: boolean;
  proxyHttpPort: number;
  proxyHttpsPort: number;
}

export const EMPTY_NODE: NodeFormValues = {
  name: "",
  description: "",
  locationId: null,
  fqdn: "",
  scheme: "https",
  behindProxy: false,
  public: true,
  maintenanceMode: false,
  memory: 8192,
  memoryOverallocate: 0,
  disk: 51200,
  diskOverallocate: 0,
  cpu: 400,
  cpuOverallocate: 0,
  uploadSize: 256,
  daemonBase: "/var/lib/spanel/volumes",
  daemonListenHost: "",
  daemonPort: 8080,
  daemonSftpPort: 2022,
  proxyEnabled: true,
  proxyHttpPort: 80,
  proxyHttpsPort: 443,
};

export function NodeForm({
  values,
  locations,
  mode,
  onDone,
}: {
  values: NodeFormValues;
  locations: { id: number; name: string; shortCode: string }[];
  mode: "create" | "edit";
  onDone?: () => void;
}) {
  const [state, action] = useActionState<NodeState, FormData>(
    mode === "create" ? createNodeAction : updateNodeAction,
    {},
  );
  const [scheme, setScheme] = useState(values.scheme);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.push(state.success, "ok");
      router.refresh();
      onDone?.();
    } else if (state.error) {
      toast.push(state.error, "bad");
    }
    // Only react to a new action result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="space-y-5">
      {values.id ? <input type="hidden" name="nodeId" value={values.id} /> : null}
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Node name" required error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={values.name} required placeholder="node-eu-1" />
        </Field>
        <Field label="Location">
          <Select name="locationId" defaultValue={values.locationId ?? ""}>
            <option value="">No location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.shortCode} — {location.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Description">
        <Textarea name="description" defaultValue={values.description} rows={2} />
      </Field>

      <fieldset className="space-y-4 rounded-lg border border-line p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">Connection</legend>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="FQDN or IP" required error={state.fieldErrors?.fqdn} hint="Public hostname the browser uses to reach the daemon (WebSocket console).">
            <Input name="fqdn" defaultValue={values.fqdn} required placeholder="node1.sadlystudios.bond" />
          </Field>
          <Field label="Scheme" required hint={scheme === "http" ? "HTTP is only safe on a private network." : undefined}>
            <Select name="scheme" value={scheme} onChange={(event) => setScheme(event.target.value)}>
              <option value="https">HTTPS</option>
              <option value="http">HTTP</option>
            </Select>
          </Field>
        </div>
        <Field label="Daemon listen host" error={state.fieldErrors?.daemonListenHost} hint="Internal/NAT IP for panel→daemon connections. Leave empty to use the FQDN above. Useful when the node is behind NAT (public IP differs from the host IP).">
          <Input name="daemonListenHost" defaultValue={values.daemonListenHost} placeholder="e.g. 10.0.0.5 or leave empty" className="font-mono text-xs" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Daemon port" required>
            <Input name="daemonPort" type="number" min={1} max={65535} defaultValue={values.daemonPort} required />
          </Field>
          <Field label="SFTP port" required>
            <Input name="daemonSftpPort" type="number" min={1} max={65535} defaultValue={values.daemonSftpPort} required />
          </Field>
          <Field label="Max upload (MiB)" required>
            <Input name="uploadSize" type="number" min={1} max={4096} defaultValue={values.uploadSize} required />
          </Field>
        </div>
        <Field label="Server data directory" required hint="Where the daemon stores server volumes.">
          <Input name="daemonBase" defaultValue={values.daemonBase} required className="font-mono text-xs" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Checkbox name="behindProxy" defaultChecked={values.behindProxy} label="Behind a reverse proxy" />
          <Checkbox name="public" defaultChecked={values.public} label="Available for self-service" />
          <Checkbox name="maintenanceMode" defaultChecked={values.maintenanceMode} label="Maintenance mode" />
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-line p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">Resource pool</legend>
        <p className="text-xs text-ink-dim">
          Overallocation is a percentage above the physical total. Use -1 to disable capacity checks entirely.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Memory (MiB)" required error={state.fieldErrors?.memory}>
            <Input name="memory" type="number" min={0} defaultValue={values.memory} required />
          </Field>
          <Field label="Memory overallocate (%)">
            <Input name="memoryOverallocate" type="number" min={-1} max={1000} defaultValue={values.memoryOverallocate} />
          </Field>
          <Field label="Disk (MiB)" required error={state.fieldErrors?.disk}>
            <Input name="disk" type="number" min={0} defaultValue={values.disk} required />
          </Field>
          <Field label="Disk overallocate (%)">
            <Input name="diskOverallocate" type="number" min={-1} max={1000} defaultValue={values.diskOverallocate} />
          </Field>
          <Field label="CPU (%)" required hint="100 per physical core. 400 = 4 cores." error={state.fieldErrors?.cpu}>
            <Input name="cpu" type="number" min={0} defaultValue={values.cpu} required />
          </Field>
          <Field label="CPU overallocate (%)">
            <Input name="cpuOverallocate" type="number" min={-1} max={1000} defaultValue={values.cpuOverallocate} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-line p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">Reverse proxy (web hosting)</legend>
        <Checkbox
          name="proxyEnabled"
          defaultChecked={values.proxyEnabled}
          label="Enable managed reverse proxy"
          description="Required for websites and hostname routing without ports."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="HTTP port">
            <Input name="proxyHttpPort" type="number" min={1} max={65535} defaultValue={values.proxyHttpPort} />
          </Field>
          <Field label="HTTPS port">
            <Input name="proxyHttpsPort" type="number" min={1} max={65535} defaultValue={values.proxyHttpsPort} />
          </Field>
        </div>
      </fieldset>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">{mode === "create" ? "Create node" : "Save node"}</SubmitButton>
      </div>
    </form>
  );
}

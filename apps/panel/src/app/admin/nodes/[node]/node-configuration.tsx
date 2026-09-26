"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, KeyRound, RefreshCw, Wifi, SlidersHorizontal } from "lucide-react";
import { rotateNodeTokenAction, testNodeAction, type NodeState } from "../actions";
import type { ServiceCommands } from "@/lib/services/node-config";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/copy-button";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";

export function NodeConfiguration({
  nodeId,
  config,
  installCommand,
  nodeInstallCommand,
  configureCommand,
  serviceCommands,
}: {
  nodeId: number;
  config: string;
  installCommand: string;
  nodeInstallCommand: string;
  configureCommand: string;
  serviceCommands: ServiceCommands;
}) {
  const [busy, setBusy] = useState<"test" | "rotate" | null>(null);
  const [showAlternates, setShowAlternates] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  const act = async (kind: "test" | "rotate", action: () => Promise<NodeState>) => {
    setBusy(kind);
    const result = await action();
    setBusy(null);
    if (result.error) toast.push(result.error, "bad");
    else if (result.success) toast.push(result.success, "ok");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Bring this node online"
          description="Two steps: paste one command on the server, then verify. No other setup is needed."
          action={
            <div className="flex gap-2">
              <Button variant="ghost" loading={busy === "test"} onClick={() => act("test", () => testNodeAction(nodeId))}>
                <Wifi className="size-3.5" />
                Test connection
              </Button>
              <Button
                variant="danger"
                loading={busy === "rotate"}
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: "Rotate the daemon token?",
                      description: "The node will disconnect until its config is updated.",
                      tone: "danger",
                      confirmLabel: "Rotate token",
                    }))
                  )
                    return;
                  return act("rotate", () => rotateNodeTokenAction(nodeId));
                }}
              >
                <KeyRound className="size-3.5" />
                Rotate token
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink">1 — Install</p>
            <p className="text-xs text-ink-muted">
              Copy this single line and run it on the node as root (or with sudo). It installs everything —
              Docker, the spanel user, directories, the daemon and the systemd service — then connects the node to this
              panel automatically.
            </p>
            <CodeBlock value={installCommand} maxHeight="max-h-40" label="Copy install command" />
            <p className="text-xs text-warn">
              This command contains the node token. Anyone who has it can control every server on the node — keep it private.
            </p>
          </div>

          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-sm font-semibold text-ink">2 — Verify</p>
            <p className="text-xs text-ink-muted">
              When the command finishes, confirm the node is healthy. Click <span className="text-ink">Test connection</span>{" "}
              above, or run this on the node:
            </p>
            <Line command="sudo spanel-daemon doctor" description="Checks Node, Docker, config and that the panel accepts this node." />
          </div>

          <div className="border-t border-line pt-3">
            <button
              type="button"
              onClick={() => setShowAlternates((value) => !value)}
              className="flex items-center gap-1.5 text-xs text-ink-dim transition-colors hover:text-ink"
              aria-expanded={showAlternates}
            >
              {showAlternates ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              Other ways to run this
            </button>

            {showAlternates ? (
              <div className="mt-3 space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-ink">Node.js 20+ already installed</p>
                  <p className="text-xs text-ink-dim">Same installer, skipping the step that installs Node.js.</p>
                  <CodeBlock value={nodeInstallCommand} maxHeight="max-h-40" label="Copy command" />
                </div>
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Set configuration only"
          description="Already installed the daemon? Point it at this node without touching Docker, the user or the service."
          action={
            <span className="flex items-center gap-1.5 text-xs text-ink-dim">
              <SlidersHorizontal className="size-3" />
              no system changes
            </span>
          }
        />
        <CardBody className="space-y-3">
          <p className="text-xs text-ink-muted">
            Run this on the node. It rewrites <span className="font-mono">/etc/spanel/config.yml</span> from the panel
            using the token pair — nothing else on the system is changed. Use it after rotating the token or moving the
            node between panels.
          </p>
          <CodeBlock value={configureCommand} maxHeight="max-h-40" label="Copy configure command" />
          <p className="rounded-md border border-ok/30 bg-ok/5 px-3 py-2 text-xs text-ink-muted">
            On success the console prints{" "}
            <span className="font-mono text-ok">configuration set successfully</span>. Apply it with a restart:{" "}
            <span className="font-mono text-ink">{serviceCommands.restart}</span>.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Service control" description="Manage the daemon with systemd once it is installed." />
        <CardBody className="space-y-2 text-xs text-ink-muted">
          <Line command={serviceCommands.enable} description="Enable the daemon and start it now (first boot / after install)." />
          <Line command={serviceCommands.restart} description="Restart after a configuration or token change." />
          <Line command={serviceCommands.status} description="Is the daemon running?" />
          <Line command={serviceCommands.stop} description="Stop the daemon." />
          <Line command={serviceCommands.logs} description="Show the last 120 log lines." />
          <Line command="sudo spanel-daemon doctor" description="Health check: Node, Docker, config, data directory and panel credentials." />
          <Line command="sudo spanel-daemon update" description="Fast-forward this node and rebuild + restart only if the daemon changed." />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="What gets written to the node"
          description="/etc/spanel/config.yml — the installer writes this for you. Shown here so you can check or set it up by hand."
          action={
            <span className="flex items-center gap-1.5 text-xs text-ink-dim">
              <RefreshCw className="size-3" />
              stays in sync with this node
            </span>
          }
        />
        <CardBody className="space-y-3">
          <CodeBlock value={config} label="Copy configuration" />
          <p className="text-xs text-ink-dim">
            You normally never edit this by hand: <span className="font-mono">spanel-daemon configure</span> pulls it from
            the panel using the token pair, so re-running the install command always refreshes it.
          </p>
        </CardBody>
      </Card>
      {dialog}
    </div>
  );
}

function Line({ command, description }: { command: string; description: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <code className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink">{command}</code>
      <span className="text-ink-dim">{description}</span>
    </div>
  );
}

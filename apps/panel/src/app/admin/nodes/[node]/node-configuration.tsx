"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, RefreshCw, Wifi } from "lucide-react";
import { rotateNodeTokenAction, testNodeAction, type NodeState } from "../actions";
import type { ServiceCommands } from "@/lib/services/node-config";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/copy-button";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/preferences";
import { useRouter } from "next/navigation";

export function NodeConfiguration({
  nodeId,
  config,
  setConfigCommand,
  serviceCommands,
}: {
  nodeId: number;
  config: string;
  setConfigCommand: string;
  serviceCommands: ServiceCommands;
}) {
  const t = useT();
  const [busy, setBusy] = useState<"test" | "rotate" | null>(null);
  const [verified, setVerified] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  const act = async (kind: "test" | "rotate", action: () => Promise<NodeState>) => {
    setBusy(kind);
    const result = await action();
    setBusy(null);
    if (result.error) {
      // A failed test means the panel could not reach the daemon — drop any
      // earlier confirmation so the status line does not lie.
      if (kind === "test") setVerified(false);
      toast.push(result.error, "bad");
    } else if (result.success) {
      // A successful connection test is a real confirmation that the node picked
      // up the configuration and the daemon is live, so surface the localized
      // "configuration set successfully" status alongside the detailed toast.
      if (kind === "test") setVerified(true);
      toast.push(result.success, "ok");
    }
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t("admin.niConfigureTitle")}
          description={t("admin.niConfigureDesc")}
          action={
            <div className="flex gap-2">
              <Button variant="ghost" loading={busy === "test"} onClick={() => act("test", () => testNodeAction(nodeId))}>
                <Wifi className="size-3.5" />
                {t("admin.niTestConnection")}
              </Button>
              <Button
                variant="danger"
                loading={busy === "rotate"}
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: t("admin.niRotateConfirmTitle"),
                      description: t("admin.niRotateConfirmDesc"),
                      tone: "danger",
                      confirmLabel: t("admin.niRotateConfirmCta"),
                    }))
                  )
                    return;
                  return act("rotate", () => rotateNodeTokenAction(nodeId));
                }}
              >
                <KeyRound className="size-3.5" />
                {t("admin.niRotateToken")}
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-4">
          <p className="text-xs text-ink-muted">{t("admin.niConfigureIntro")}</p>
          <CodeBlock value={setConfigCommand} maxHeight="max-h-96" label={t("admin.niCopySetConfig")} />
          <p className="text-xs text-warn">{t("admin.niTokenWarning")}</p>
          <div className="rounded-md border border-ok/30 bg-ok/5 px-3 py-2 text-xs text-ink-muted">
            {t("admin.niConsoleHint")}{" "}
            <span className="font-mono text-ok">configuration set successfully</span>
          </div>
          {verified ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-ok" role="status">
              <CheckCircle2 className="size-3.5" />
              {t("admin.niConfigSetSuccess")}
            </p>
          ) : (
            <p className="text-xs text-ink-dim">{t("admin.niVerifyHint")}</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("admin.niServiceTitle")} description={t("admin.niServiceDesc")} />
        <CardBody className="space-y-2 text-xs text-ink-muted">
          <Line command={serviceCommands.enable} description={t("admin.niSvcEnable")} />
          <Line command={serviceCommands.restart} description={t("admin.niSvcRestart")} />
          <Line command={serviceCommands.status} description={t("admin.niSvcStatus")} />
          <Line command={serviceCommands.stop} description={t("admin.niSvcStop")} />
          <Line command={serviceCommands.logs} description={t("admin.niSvcLogs")} />
          <Line command="sudo spanel-daemon doctor" description={t("admin.niSvcDoctor")} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("admin.niConfigFileTitle")}
          description={t("admin.niConfigFileDesc")}
          action={
            <span className="flex items-center gap-1.5 text-xs text-ink-dim">
              <RefreshCw className="size-3" />
              {t("admin.niStaysInSync")}
            </span>
          }
        />
        <CardBody className="space-y-3">
          <CodeBlock value={config} label={t("admin.niCopyConfig")} />
          <p className="text-xs text-ink-dim">{t("admin.niConfigFileNote")}</p>
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

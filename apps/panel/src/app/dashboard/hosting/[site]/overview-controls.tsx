"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Power, RotateCw } from "lucide-react";
import { powerAction } from "@/app/dashboard/servers/actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Meter } from "@/components/ui/meter";
import { Alert } from "@/components/ui/alert";
import { formatBytes, formatMib, formatUptime } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

interface Stats {
  state: string;
  memoryBytes: number;
  cpuAbsolute: number;
  diskBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptimeMs: number;
  unreachable?: boolean;
}

const EMPTY: Stats = {
  state: "offline",
  memoryBytes: 0,
  cpuAbsolute: 0,
  diskBytes: 0,
  networkRxBytes: 0,
  networkTxBytes: 0,
  uptimeMs: 0,
};

/**
 * Live power controls + resource usage for a website. Reuses the shared
 * powerAction server action (start/stop/restart) and the same resources proxy
 * endpoint the game console polls, so this is real control — not a stub.
 */
export function OverviewControls({
  serverUuid,
  limits,
  canStart,
  canStop,
  canRestart,
  initialState,
}: {
  serverUuid: string;
  limits: { memory: number; disk: number; cpu: number };
  canStart: boolean;
  canStop: boolean;
  canRestart: boolean;
  initialState: string;
}) {
  const t = useT();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ ...EMPTY, state: initialState });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/servers/${serverUuid}/resources`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as Partial<Stats>;
        if (active) setStats((prev) => ({ ...prev, ...data }));
      } catch {
        // ignore transient errors
      }
    };
    poll();
    const interval = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [serverUuid]);

  const run = async (action: string) => {
    setBusy(action);
    setNotice(null);
    const result = await powerAction(serverUuid, action);
    setNotice(result.error ?? result.message ?? null);
    setBusy(null);
    router.refresh();
  };

  const running = stats.state === "running";
  const memoryLimitBytes = limits.memory > 0 ? limits.memory * 1024 * 1024 : stats.memoryBytes;
  const diskLimitBytes = limits.disk * 1024 * 1024;

  return (
    <div className="space-y-4">
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" disabled={!canStart || running || busy !== null} loading={busy === "start"} onClick={() => run("start")}>
          <Play className="size-3.5" />
          {t("dashboard.powerStart")}
        </Button>
        <Button variant="ghost" disabled={!canRestart || busy !== null} loading={busy === "restart"} onClick={() => run("restart")}>
          <RotateCw className="size-3.5" />
          {t("dashboard.powerRestart")}
        </Button>
        <Button variant="ghost" disabled={!canStop || !running || busy !== null} loading={busy === "stop"} onClick={() => run("stop")}>
          <Power className="size-3.5" />
          {t("dashboard.powerStop")}
        </Button>
        <span className="ms-auto font-mono text-xs text-ink-dim">{stats.state}</span>
      </div>

      <Card>
        <CardHeader title={t("dashboard.liveUsage")} description={stats.unreachable ? t("dashboard.nodeUnreachable") : undefined} />
        <CardBody className="space-y-4">
          <Meter
            label={t("dashboard.memory")}
            used={stats.memoryBytes}
            total={memoryLimitBytes}
            valueLabel={`${formatBytes(stats.memoryBytes)} / ${limits.memory ? formatMib(limits.memory) : "∞"}`}
          />
          <Meter
            label={t("dashboard.cpu")}
            used={stats.cpuAbsolute}
            total={limits.cpu > 0 ? limits.cpu : 100}
            valueLabel={`${stats.cpuAbsolute.toFixed(1)}% / ${limits.cpu ? `${limits.cpu}%` : "∞"}`}
          />
          <Meter
            label={t("dashboard.disk")}
            used={stats.diskBytes}
            total={diskLimitBytes}
            valueLabel={`${formatBytes(stats.diskBytes)} / ${formatMib(limits.disk)}`}
          />
          <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs">
            <div>
              <dt className="text-ink-dim">{t("dashboard.uptime")}</dt>
              <dd className="font-mono text-ink">{running ? formatUptime(stats.uptimeMs) : "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-dim">{t("dashboard.bandwidthOut")}</dt>
              <dd className="font-mono text-ink">{formatBytes(stats.networkTxBytes)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

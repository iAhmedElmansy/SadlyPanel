"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { HealthHeart, heartTitle } from "../health-heart";
import { EmptyState } from "@/components/ui/empty-state";
import { Activity } from "lucide-react";
import { formatMib, formatUptime, relativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

/**
 * Live node telemetry: health badge, hardware inventory reported by the daemon
 * and the rolling heartbeat history.
 *
 * The page is a server component, so this refreshes itself by re-fetching the
 * route (router.refresh via a meta-less interval is avoided: instead the parent
 * page is dynamic and this component polls the JSON endpoint).
 */

export interface TelemetrySample {
  at: string;
  memoryPercent: number;
  diskPercent: number;
  cpuPercent: number;
  latencyMs: number;
  runningServers: number;
}

export interface TelemetryLatest {
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  cpuPercent: number;
  loadAverage: number;
  latencyMs: number;
  runningServers: number;
  totalServers: number;
  uptimeSeconds: number;
}

const AXIS = { stroke: "#6c6c72", fontSize: 10 };
const GRID = "#26262a";

function TooltipShell({ active, payload, label }: { active?: boolean; payload?: unknown[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const rows = payload as { name?: string; value?: number; color?: string; unit?: string }[];
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-2 text-[11px] shadow-lg">
      <p className="mb-1 text-ink-dim">{label}</p>
      {rows.map((row) => (
        <p key={row.name} className="flex items-center gap-1.5 text-ink">
          <span className="size-1.5 rounded-full" style={{ background: row.color }} />
          {row.name}: {row.value}
          {row.unit ?? ""}
        </p>
      ))}
    </div>
  );
}

export function NodeTelemetry({
  health,
  lastHeartbeatAt,
  daemonVersion,
  system,
  latest,
  series,
}: {
  nodeId: number;
  health: "online" | "degraded" | "offline" | "unknown";
  lastHeartbeatAt: string | null;
  daemonVersion: string | null;
  system: {
    os: string | null;
    arch: string | null;
    kernel: string | null;
    cpuModel: string | null;
    cpuCores: number | null;
    memoryTotal: number | null;
    diskTotal: number | null;
    dockerVersion: string | null;
  };
  latest: TelemetryLatest | null;
  series: TelemetrySample[];
}) {
  const t = useT();
  const chartData = useMemo(
    () =>
      series.map((sample) => ({
        ...sample,
        time: new Date(sample.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      })),
    [series],
  );

  const facts: { label: string; value: string }[] = [
    { label: t("admin.telFactDaemon"), value: daemonVersion ?? "—" },
    { label: t("admin.telFactDocker"), value: system.dockerVersion ?? "—" },
    { label: t("admin.telFactOs"), value: system.os ?? "—" },
    { label: t("admin.telFactKernel"), value: system.kernel ?? "—" },
    { label: t("admin.telFactArch"), value: system.arch ?? "—" },
    { label: t("admin.telFactCpu"), value: system.cpuModel ? t("admin.telFactCpuCores", { model: system.cpuModel, cores: system.cpuCores ?? "?" }) : "—" },
    { label: t("admin.telFactMemory"), value: system.memoryTotal ? formatMib(system.memoryTotal) : "—" },
    { label: t("admin.telFactDisk"), value: system.diskTotal ? formatMib(system.diskTotal) : "—" },
  ];

  return (
    <div className="mb-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader
          title={t("admin.telHealth")}
          description={t("admin.telHealthDesc")}
          action={
            <span className="flex items-center gap-2">
              <HealthHeart health={health} title={heartTitle(health, daemonVersion, t)} size="size-5" />
              <span className="text-xs text-ink-dim">{relativeTime(lastHeartbeatAt)}</span>
            </span>
          }
        />
        {chartData.length === 0 ? (
          <EmptyState
            icon={<Activity className="size-5" />}
            title={t("admin.telNoHeartbeats")}
            description={t("admin.telNoHeartbeatsDesc")}
          />
        ) : (
          <CardBody className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <Fact label={t("admin.telCpu")} value={latest ? `${latest.cpuPercent}%` : "—"} hint={latest ? t("admin.telLoad", { value: latest.loadAverage }) : undefined} />
              <Fact
                label={t("admin.telMemory")}
                value={latest ? formatMib(latest.memoryUsed) : "—"}
                hint={latest ? t("admin.telOf", { value: formatMib(latest.memoryTotal) }) : undefined}
              />
              <Fact
                label={t("admin.telDisk")}
                value={latest ? formatMib(latest.diskUsed) : "—"}
                hint={latest ? t("admin.telOf", { value: formatMib(latest.diskTotal) }) : undefined}
              />
              <Fact
                label={t("admin.telContainers")}
                value={latest ? `${latest.runningServers}/${latest.totalServers}` : "—"}
                hint={latest ? t("admin.telUp", { value: formatUptime(latest.uptimeSeconds * 1000) }) : undefined}
              />
            </div>

            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f5f5f3" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#f5f5f3" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="memFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#9a9aa0" stopOpacity={0.38} />
                      <stop offset="100%" stopColor="#9a9aa0" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="time" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={28} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" width={44} />
                  <Tooltip content={<TooltipShell />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#a3a3a8" }} />
                  <Area
                    type="monotone"
                    dataKey="cpuPercent"
                    name={t("admin.telChartCpu")}
                    stroke="#f5f5f3"
                    fill="url(#cpuFill)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="memoryPercent"
                    name={t("admin.telChartMemory")}
                    stroke="#9a9aa0"
                    fill="url(#memFill)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="diskPercent"
                    name={t("admin.telChartDisk")}
                    stroke="#e0a53f"
                    fill="transparent"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="time" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={28} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
                  <Tooltip content={<TooltipShell />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#a3a3a8" }} />
                  <Line
                    type="monotone"
                    dataKey="latencyMs"
                    name={t("admin.telChartLatency")}
                    stroke="#3ecf8e"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="runningServers"
                    name={t("admin.telChartRunning")}
                    stroke="#c9c9c6"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader title={t("admin.telHardware")} description={t("admin.telHardwareDesc")} />
        <CardBody>
          <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-xs text-ink-dim">{fact.label}</dt>
                <dd className="truncate text-sm text-ink" title={fact.value}>
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 px-3 py-2">
      <p className="text-xs text-ink-dim">{label}</p>
      <p className="truncate text-sm font-semibold text-ink">{value}</p>
      {hint ? <p className="truncate text-[11px] text-ink-dim">{hint}</p> : null}
    </div>
  );
}

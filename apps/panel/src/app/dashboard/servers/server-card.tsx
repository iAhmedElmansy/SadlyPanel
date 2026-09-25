"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Boxes, Cpu, Gamepad2, HardDrive, MemoryStick, TerminalSquare } from "lucide-react";
import { useT } from "@/lib/i18n/preferences";
import { cn, formatBytes, formatCpu, formatMib } from "@/lib/utils";

/** The server shape the list page hands each card (already RBAC-scoped). */
export interface ServerCardData {
  uuidShort: string;
  name: string;
  serviceKind: string;
  eggName: string;
  nodeName: string;
  address: string;
  status: string;
  suspended: boolean;
  installStatus: string;
  /** Configured limits (MiB / MiB / percent). 0 = unlimited. */
  memory: number;
  disk: number;
  cpu: number;
}

/** Live resource usage as returned by /api/servers/[server]/resources. */
interface LiveUsage {
  state: string;
  memoryBytes: number;
  memoryLimitBytes: number;
  cpuAbsolute: number;
  diskBytes: number;
  unreachable?: boolean;
}

const TYPE_ICON: Record<string, typeof Boxes> = {
  game: Gamepad2,
  application: TerminalSquare,
};

/** running -> green, installing/starting/stopping -> amber, everything else -> red. */
function statusColor(state: string, suspended: boolean): string {
  if (suspended) return "bg-bad";
  if (state === "running") return "bg-ok";
  if (state === "installing" || state === "starting" || state === "stopping") return "bg-warn";
  return "bg-bad";
}

function pct(used: number, limit: number): number | null {
  if (!limit || limit <= 0) return null; // unlimited or unknown
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

export function ServerCard({ server }: { server: ServerCardData }) {
  const t = useT();
  const [live, setLive] = useState<LiveUsage | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // Only poll servers that could be reporting usage — skip installing/suspended.
    if (server.suspended || server.installStatus !== "success") return;

    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/servers/${server.uuidShort}/resources`, { cache: "no-store" });
        if (res.ok && mounted.current) setLive(await res.json());
      } catch {
        /* transient — keep the last known value */
      } finally {
        if (mounted.current) timer = setTimeout(poll, 8000);
      }
    };
    void poll();
    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [server.uuidShort, server.suspended, server.installStatus]);

  const liveState = server.suspended ? "suspended" : live?.state ?? server.status;
  const TypeIcon = TYPE_ICON[server.serviceKind] ?? Boxes;

  // Live percentages against the configured limits.
  const cpuLive = live ? Math.round(live.cpuAbsolute) : null;
  const memPct = live ? pct(live.memoryBytes, live.memoryLimitBytes || server.memory * 1024 * 1024) : null;
  const diskPct = live ? pct(live.diskBytes, server.disk * 1024 * 1024) : null;
  const cpuPct = cpuLive !== null && server.cpu > 0 ? Math.min(100, Math.round((cpuLive / server.cpu) * 100)) : null;

  return (
    <Link
      href={`/dashboard/servers/${server.uuidShort}`}
      className="group flex items-stretch gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-surface-2"
    >
      {/* Identity: type icon before the name, full address below */}
      <div className="flex min-w-0 flex-[1.4] items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-3 text-ink-muted group-hover:text-brand-soft">
          <TypeIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink group-hover:text-brand-soft">{server.name}</p>
          <p className="truncate font-mono text-xs text-ink-dim">{server.address}</p>
        </div>
      </div>

      {/* Live resource meters — each with its own icon, live value and configured cap */}
      <div className="hidden flex-[2] items-center gap-5 sm:flex">
        <Meter
          icon={<Cpu className="size-3.5" />}
          live={cpuLive !== null ? `${cpuLive}%` : "—"}
          configured={formatCpu(server.cpu)}
          percent={cpuPct}
          label={t("dashboard.serversColCpu")}
        />
        <Meter
          icon={<MemoryStick className="size-3.5" />}
          live={live ? formatBytes(live.memoryBytes) : "—"}
          configured={formatMib(server.memory)}
          percent={memPct}
          label={t("dashboard.serversColRam")}
        />
        <Meter
          icon={<HardDrive className="size-3.5" />}
          live={live ? formatBytes(live.diskBytes) : "—"}
          configured={formatMib(server.disk)}
          percent={diskPct}
          label={t("dashboard.serversColDisk")}
        />
      </div>

      {/* Trailing vertical status bar: green running / amber working / red stopped */}
      <div
        className={cn("w-1 shrink-0 self-stretch rounded-full", statusColor(liveState, server.suspended))}
        title={liveState}
        aria-label={liveState}
      />
    </Link>
  );
}

function Meter({
  icon,
  live,
  configured,
  percent,
  label,
}: {
  icon: React.ReactNode;
  live: string;
  configured: string;
  percent: number | null;
  label: string;
}) {
  return (
    <div className="min-w-0 flex-1" aria-label={label}>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-ink-dim">{icon}</span>
        <span className="font-mono text-ink">{live}</span>
        <span className="font-mono text-ink-dim">/ {configured}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
        <span
          className="block h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: percent !== null ? `${percent}%` : "0%" }}
        />
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Power, RotateCw, Send, Skull, Terminal as TerminalIcon } from "lucide-react";
import type { Terminal } from "@xterm/xterm";
import { powerAction, sendCommandAction } from "../actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Meter } from "@/components/ui/meter";
import { cn, formatBytes, formatMib, formatUptime } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

interface Stats {
  state: string;
  memoryBytes: number;
  memoryLimitBytes: number;
  cpuAbsolute: number;
  diskBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptimeMs: number;
  unreachable?: boolean;
  error?: string;
}

type ConnectionState = "connecting" | "open" | "closed" | "error";

const EMPTY_STATS: Stats = {
  state: "offline",
  memoryBytes: 0,
  memoryLimitBytes: 0,
  cpuAbsolute: 0,
  diskBytes: 0,
  networkRxBytes: 0,
  networkTxBytes: 0,
  uptimeMs: 0,
};

export function ServerConsole({
  serverUuid,
  limits,
  canConsole,
  canStart,
  canStop,
  canRestart,
  initialState,
}: {
  serverUuid: string;
  limits: { memory: number; disk: number; cpu: number };
  canConsole: boolean;
  canStart: boolean;
  canStop: boolean;
  canRestart: boolean;
  initialState: string;
}) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<{ fit: () => void } | null>(null);
  const reconnectRef = useRef<number>(0);
  const disposedRef = useRef(false);

  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [stats, setStats] = useState<Stats>({ ...EMPTY_STATS, state: initialState });
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const write = useCallback((line: string) => {
    termRef.current?.writeln(line);
  }, []);

  // Boot the terminal once, lazily importing xterm so it stays out of the SSR bundle.
  useEffect(() => {
    let cleanup = () => {};

    (async () => {
      const [{ Terminal: XTerm }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
      ]);
      if (disposedRef.current || !containerRef.current) return;

      const term = new XTerm({
        convertEol: true,
        cursorBlink: false,
        disableStdin: true,
        fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
        fontSize: 12.5,
        lineHeight: 1.35,
        scrollback: 6000,
        allowProposedApi: true,
        theme: {
          // Chrome matches the obsidian UI; ANSI colours below stay true so
          // programs' coloured output renders correctly.
          background: "#060607",
          foreground: "#e6e6e3",
          cursor: "#f5f5f3",
          black: "#151517",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#f59e0b",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#e2e8f0",
          brightBlack: "#6c6c72",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(containerRef.current);
      fit.fit();

      termRef.current = term;
      fitRef.current = fit;

      const onResize = () => fit.fit();
      window.addEventListener("resize", onResize);
      cleanup = () => {
        window.removeEventListener("resize", onResize);
        term.dispose();
      };

      term.writeln("\x1b[38;5;61m╭─ SPanel console ───────────────────────────────────────────╮\x1b[0m");
      term.writeln("\x1b[38;5;61m│\x1b[0m Connecting to the node…");
    })();

    return () => {
      disposedRef.current = true;
      cleanup();
    };
  }, []);

  // Websocket lifecycle with exponential backoff.
  useEffect(() => {
    if (!canConsole) {
      setConnection("closed");
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const connect = async () => {
      if (cancelled) return;
      setConnection("connecting");
      try {
        const response = await fetch(`/api/servers/${serverUuid}/websocket`, { cache: "no-store" });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Console unavailable.");
        const ticket = (await response.json()) as { socket: string; token: string };

        const socket = new WebSocket(ticket.socket);
        socketRef.current = socket;

        socket.onopen = () => {
          socket.send(JSON.stringify({ event: "auth", args: [ticket.token] }));
        };

        socket.onmessage = (event) => {
          let payload: { event?: string; args?: unknown[] };
          try {
            payload = JSON.parse(String(event.data));
          } catch {
            write(String(event.data));
            return;
          }

          switch (payload.event) {
            case "auth success":
              setConnection("open");
              reconnectRef.current = 0;
              socket.send(JSON.stringify({ event: "send logs", args: [] }));
              socket.send(JSON.stringify({ event: "send stats", args: [] }));
              break;
            case "console output":
              for (const line of payload.args ?? []) write(String(line));
              break;
            case "status":
              setStats((prev) => ({ ...prev, state: String(payload.args?.[0] ?? prev.state) }));
              break;
            case "stats": {
              try {
                const raw = JSON.parse(String(payload.args?.[0] ?? "{}")) as Partial<Stats> & {
                  memory_bytes?: number;
                  memory_limit_bytes?: number;
                  cpu_absolute?: number;
                  disk_bytes?: number;
                  network?: { rx_bytes?: number; tx_bytes?: number };
                  uptime?: number;
                  state?: string;
                };
                setStats((prev) => ({
                  ...prev,
                  state: raw.state ?? prev.state,
                  memoryBytes: raw.memoryBytes ?? raw.memory_bytes ?? 0,
                  memoryLimitBytes: raw.memoryLimitBytes ?? raw.memory_limit_bytes ?? 0,
                  cpuAbsolute: raw.cpuAbsolute ?? raw.cpu_absolute ?? 0,
                  diskBytes: raw.diskBytes ?? raw.disk_bytes ?? 0,
                  networkRxBytes: raw.networkRxBytes ?? raw.network?.rx_bytes ?? 0,
                  networkTxBytes: raw.networkTxBytes ?? raw.network?.tx_bytes ?? 0,
                  uptimeMs: raw.uptimeMs ?? raw.uptime ?? 0,
                  unreachable: false,
                }));
              } catch {
                // ignore malformed stats frames
              }
              break;
            }
            case "install output":
              for (const line of payload.args ?? []) write(`\x1b[38;5;110m[install]\x1b[0m ${String(line)}`);
              break;
            case "daemon message":
              for (const line of payload.args ?? []) write(`\x1b[38;5;178m[daemon]\x1b[0m ${String(line)}`);
              break;
            case "jwt error":
            case "auth error":
              write(`\x1b[31m[console] ${String(payload.args?.[0] ?? "authentication failed")}\x1b[0m`);
              setConnection("error");
              break;
            default:
              break;
          }
        };

        socket.onerror = () => setConnection("error");

        socket.onclose = () => {
          if (cancelled) return;
          setConnection("closed");
          const attempt = Math.min(reconnectRef.current + 1, 6);
          reconnectRef.current = attempt;
          const delay = Math.min(1000 * 2 ** (attempt - 1), 20_000);
          write(`\x1b[38;5;244m[console] disconnected, retrying in ${Math.round(delay / 1000)}s…\x1b[0m`);
          timer = setTimeout(connect, delay);
        };
      } catch (error) {
        setConnection("error");
        write(`\x1b[31m[console] ${error instanceof Error ? error.message : "connection failed"}\x1b[0m`);
        const attempt = Math.min(reconnectRef.current + 1, 6);
        reconnectRef.current = attempt;
        timer = setTimeout(connect, Math.min(1000 * 2 ** (attempt - 1), 20_000));
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [serverUuid, canConsole, write]);

  // Fallback polling so limits/usage still render if the socket is unavailable.
  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active || connection === "open") return;
      try {
        const response = await fetch(`/api/servers/${serverUuid}/resources`, { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as Stats;
          if (active) setStats((prev) => ({ ...prev, ...data }));
        }
      } catch {
        // ignore
      }
    };
    poll();
    const interval = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [serverUuid, connection]);

  const runPower = async (action: string) => {
    setBusy(action);
    setNotice(null);
    const result = await powerAction(serverUuid, action);
    setNotice(result.error ?? result.message ?? null);
    setBusy(null);
  };

  const submitCommand = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;

    setHistory((prev) => [value, ...prev].slice(0, 50));
    setHistoryIndex(-1);
    setCommand("");
    write(`\x1b[38;5;61m>\x1b[0m ${value}`);

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event: "send command", args: [value] }));
      return;
    }
    const result = await sendCommandAction(serverUuid, value);
    if (result.error) write(`\x1b[31m[console] ${result.error}\x1b[0m`);
  };

  const onCommandKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.min(historyIndex + 1, history.length - 1);
      if (next >= 0) {
        setHistoryIndex(next);
        setCommand(history[next]);
      }
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setCommand(next >= 0 ? history[next] : "");
    }
  };

  const running = stats.state === "running";
  const memoryLimitBytes = limits.memory > 0 ? limits.memory * 1024 * 1024 : stats.memoryLimitBytes;
  const diskLimitBytes = limits.disk * 1024 * 1024;

  const connectionLabel = {
    connecting: t("dashboard.connConnecting"),
    open: t("dashboard.connLive"),
    closed: t("dashboard.connOffline"),
    error: t("dashboard.connError"),
  }[connection];

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" disabled={!canStart || running || busy !== null} loading={busy === "start"} onClick={() => runPower("start")}>
            <Play className="size-3.5" />
            {t("dashboard.powerStart")}
          </Button>
          <Button variant="ghost" disabled={!canRestart || busy !== null} loading={busy === "restart"} onClick={() => runPower("restart")}>
            <RotateCw className="size-3.5" />
            {t("dashboard.powerRestart")}
          </Button>
          <Button variant="ghost" disabled={!canStop || !running || busy !== null} loading={busy === "stop"} onClick={() => runPower("stop")}>
            <Power className="size-3.5" />
            {t("dashboard.powerStop")}
          </Button>
          <Button variant="danger" disabled={!canStop || busy !== null} loading={busy === "kill"} onClick={() => runPower("kill")}>
            <Skull className="size-3.5" />
            {t("dashboard.powerKill")}
          </Button>

          <span
            className={cn(
              "ms-auto badge",
              connection === "open"
                ? "border-ok/40 bg-ok/12 text-ok"
                : connection === "connecting"
                  ? "border-warn/40 bg-warn/12 text-warn"
                  : "border-bad/40 bg-bad/12 text-bad",
            )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {connectionLabel}
          </span>
        </div>

        {notice ? (
          <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-ink-muted">{notice}</div>
        ) : null}

        <div className="console-shell overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs text-ink-dim">
            <TerminalIcon className="size-3.5" />
            <span>{t("dashboard.console")}</span>
            <span className="ms-auto font-mono">{stats.state}</span>
          </div>
          <div ref={containerRef} className="h-[440px] w-full px-2 py-2" />
          <form onSubmit={submitCommand} className="flex items-center gap-2 border-t border-line px-3 py-2">
            <span className="font-mono text-xs text-brand-soft">$</span>
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={onCommandKeyDown}
              disabled={!canConsole}
              placeholder={canConsole ? t("dashboard.consoleCmdPlaceholder") : t("dashboard.consoleNoPermPlaceholder")}
              aria-label={t("dashboard.serverCommand")}
              className="flex-1 bg-transparent font-mono text-xs text-ink outline-none placeholder:text-ink-dim"
            />
            <button
              type="submit"
              disabled={!canConsole || !command.trim()}
              className="rounded p-1 text-ink-dim transition hover:text-brand-soft disabled:opacity-40"
              aria-label={t("dashboard.sendCommand")}
            >
              <Send className="size-3.5" />
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-4">
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
                <dt className="text-ink-dim">{t("dashboard.state")}</dt>
                <dd className="font-mono text-ink">{stats.state}</dd>
              </div>
              <div>
                <dt className="text-ink-dim">{t("dashboard.netIn")}</dt>
                <dd className="font-mono text-ink">{formatBytes(stats.networkRxBytes)}</dd>
              </div>
              <div>
                <dt className="text-ink-dim">{t("dashboard.netOut")}</dt>
                <dd className="font-mono text-ink">{formatBytes(stats.networkTxBytes)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("dashboard.configuredLimits")} />
          <CardBody>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-ink-dim">{t("dashboard.memory")}</dt>
                <dd className="font-mono">{formatMib(limits.memory)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">{t("dashboard.disk")}</dt>
                <dd className="font-mono">{formatMib(limits.disk)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">{t("dashboard.cpu")}</dt>
                <dd className="font-mono">{limits.cpu === 0 ? t("dashboard.unlimited") : `${limits.cpu}%`}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

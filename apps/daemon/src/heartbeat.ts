import os from "node:os";
import { statfs } from "node:fs/promises";
import type { DaemonConfig } from "./config.js";
import { createLogger } from "./logger.js";
import type { PanelClient, HeartbeatBody, HeartbeatReply } from "./panel-client.js";
import type { DockerManager } from "./docker.js";
import type { ServerManager } from "./server-manager.js";

const log = createLogger("heartbeat");

const MIB = 1024 * 1024;
const DEFAULT_INTERVAL_MS = 15_000;

function toMib(bytes: number): number {
  return Math.round(bytes / MIB);
}

interface CpuSnapshot {
  idle: number;
  total: number;
}

function cpuSnapshot(): CpuSnapshot {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

/**
 * Periodically reports node health to the panel.
 *
 * The panel treats a node with no beat for 60s as offline, so the interval is
 * kept well below that and the send is fire-and-forget: a panel outage must
 * never interrupt the containers running on the node.
 */
export class HeartbeatReporter {
  private timer?: NodeJS.Timeout;
  private previousCpu = cpuSnapshot();
  private intervalMs = DEFAULT_INTERVAL_MS;
  private lastLatency = 0;
  private running = false;
  private cachedDockerVersion = "";

  constructor(
    private readonly config: DaemonConfig,
    private readonly panel: PanelClient,
    private readonly docker: DockerManager,
    private readonly manager: ServerManager,
    private readonly version: string,
  ) {}

  /** Percentage of CPU used across all cores since the previous sample. */
  private cpuPercent(): number {
    const current = cpuSnapshot();
    const idleDelta = current.idle - this.previousCpu.idle;
    const totalDelta = current.total - this.previousCpu.total;
    this.previousCpu = current;
    if (totalDelta <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((totalDelta - idleDelta) / totalDelta) * 1000) / 10));
  }

  private async disk(): Promise<{ used: number; total: number }> {
    try {
      const stats = await statfs(this.config.system.data);
      const total = Number(stats.blocks) * Number(stats.bsize);
      const free = Number(stats.bavail) * Number(stats.bsize);
      return { used: toMib(Math.max(0, total - free)), total: toMib(total) };
    } catch {
      return { used: 0, total: 0 };
    }
  }

  async collect(): Promise<HeartbeatBody> {
    if (!this.cachedDockerVersion) this.cachedDockerVersion = await this.docker.version();
    const disk = await this.disk();
    const cpus = os.cpus();
    const servers = this.manager.list();

    return {
      daemonVersion: this.version,
      system: {
        os: `${os.type()} ${os.release()}`,
        arch: process.arch,
        kernel: os.release(),
        cpuModel: cpus[0]?.model?.trim() ?? "unknown",
        cpuCores: cpus.length,
        memoryTotal: toMib(os.totalmem()),
        diskTotal: disk.total,
        dockerVersion: this.cachedDockerVersion,
      },
      usage: {
        memoryUsed: toMib(os.totalmem() - os.freemem()),
        memoryTotal: toMib(os.totalmem()),
        diskUsed: disk.used,
        diskTotal: disk.total,
        cpuPercent: this.cpuPercent(),
        loadAverage: Math.round((os.loadavg()[0] ?? 0) * 100) / 100,
        runningServers: this.manager.runningCount(),
        totalServers: servers.length,
        uptimeSeconds: Math.round(process.uptime()),
      },
      latencyMs: this.lastLatency,
    };
  }

  /** Sends a single beat. Returns the panel reply, or null when unreachable. */
  async beat(): Promise<HeartbeatReply | null> {
    const body = await this.collect();
    const startedAt = Date.now();
    const reply = await this.panel.heartbeat(body);
    this.lastLatency = Date.now() - startedAt;

    if (!reply) return null;

    if (reply.intervalMs && reply.intervalMs !== this.intervalMs && reply.intervalMs >= 5000) {
      this.intervalMs = reply.intervalMs;
      log.debug(`Panel requested a ${this.intervalMs}ms heartbeat interval`);
      this.reschedule();
    }

    this.reconcile(reply);
    return reply;
  }

  /** Logs servers the panel expects here but that this node does not know about, and auto-syncs them. */
  private reconcile(reply: HeartbeatReply): void {
    if (!Array.isArray(reply.servers)) return;
    const known = new Set(this.manager.list().map((spec) => spec.uuid));
    const missing = reply.servers.filter((server) => !known.has(server.uuid));
    if (missing.length === 0) return;

    log.warn(
      `The panel expects ${missing.length} server(s) that are not present on this node: ${missing
        .slice(0, 5)
        .map((s) => s.uuid)
        .join(", ")}${missing.length > 5 ? "…" : ""}`,
    );

    // Auto-fetch missing server specs from the panel and register them.
    for (const server of missing) {
      void this.panel.fetchSpec(server.uuid).then((result) => {
        if (!result?.spec) {
          log.warn(`Could not fetch spec for ${server.uuid} from the panel`);
          return;
        }
        log.info(`Auto-syncing server ${server.uuid} from the panel`);
        return this.manager.sync(result.spec as import("./types.js").ServerSpec);
      }).catch((error) => {
        log.warn(`Failed to auto-sync server ${server.uuid}: ${error instanceof Error ? error.message : error}`);
      });
    }
  }

  private reschedule(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = setInterval(() => void this.beat().catch(() => undefined), this.intervalMs);
  }

  start(): void {
    if (this.running || !this.panel.configured) return;
    this.running = true;
    void this.beat().catch(() => undefined);
    this.timer = setInterval(() => void this.beat().catch(() => undefined), this.intervalMs);
    log.info(`Reporting node health to ${this.config.remote} every ${this.intervalMs / 1000}s`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.running = false;
  }
}

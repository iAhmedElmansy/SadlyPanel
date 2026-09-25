import Docker from "dockerode";
import type { Duplex } from "node:stream";
import { createLogger } from "./logger.js";
import type { DaemonConfig } from "./config.js";
import type { ResourceUsage, ServerSpec } from "./types.js";

const log = createLogger("docker");

export const CONTAINER_PREFIX = "spanel-";

export function containerName(uuid: string): string {
  return `${CONTAINER_PREFIX}${uuid}`;
}

/** Translates panel limits into Docker HostConfig resource controls. */
export function buildHostConfig(spec: ServerSpec, config: DaemonConfig, volumePath: string): Docker.HostConfig {
  const memoryBytes = spec.limits.memory > 0 ? spec.limits.memory * 1024 * 1024 : 0;
  const swapBytes =
    spec.limits.swap === -1 ? -1 : memoryBytes === 0 ? 0 : memoryBytes + Math.max(0, spec.limits.swap) * 1024 * 1024;

  const portBindings: Docker.PortMap = {};
  for (const allocation of spec.allocations) {
    for (const protocol of ["tcp", "udp"] as const) {
      portBindings[`${allocation.port}/${protocol}`] = [
        { HostIp: allocation.ip, HostPort: String(allocation.port) },
      ];
    }
  }

  // The primary volume bind is always present. Admin-defined mounts are
  // appended in addition to it (never replacing it). Sources/targets are
  // trusted panel input, but we still drop obviously invalid entries (empty
  // strings) so a malformed spec can't produce a bogus bind string.
  const binds = [`${volumePath}:/home/container:rw`];
  for (const mount of spec.mounts ?? []) {
    const source = mount.source?.trim();
    const target = mount.target?.trim();
    if (!source || !target) continue;
    binds.push(`${source}:${target}:${mount.readOnly ? "ro" : "rw"}`);
  }

  const hostConfig: Docker.HostConfig = {
    Binds: binds,
    PortBindings: portBindings,
    NetworkMode: config.docker.network.name,
    Dns: config.docker.network.dns,
    RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
    LogConfig: { Type: "json-file", Config: { "max-size": "5m", "max-file": "1" } },
    ReadonlyRootfs: false,
    SecurityOpt: ["no-new-privileges"],
    CapDrop: ["setpcap", "mknod", "audit_write", "net_raw", "dac_override", "fowner", "fsetid", "sys_chroot", "setfcap"],
    Tmpfs: { "/tmp": "rw,exec,nosuid,size=64M" },
    // Resource limits
    Memory: memoryBytes,
    MemoryReservation: memoryBytes > 0 ? Math.floor(memoryBytes * 0.75) : 0,
    MemorySwap: swapBytes,
    OomKillDisable: memoryBytes > 0 ? !spec.limits.oomKiller : false,
    BlkioWeight: Math.min(1000, Math.max(10, spec.limits.io)),
    PidsLimit: 512,
  };

  if (spec.limits.cpu > 0) {
    // 100% == one core. Docker expresses this as quota/period.
    hostConfig.CpuQuota = spec.limits.cpu * 1000;
    hostConfig.CpuPeriod = 100_000;
    hostConfig.CpuShares = 1024;
  }
  if (spec.limits.threads) hostConfig.CpusetCpus = spec.limits.threads;

  return hostConfig;
}

function exposedPorts(spec: ServerSpec): Record<string, Record<string, never>> {
  const exposed: Record<string, Record<string, never>> = {};
  for (const allocation of spec.allocations) {
    exposed[`${allocation.port}/tcp`] = {};
    exposed[`${allocation.port}/udp`] = {};
  }
  return exposed;
}

export function environmentArray(spec: ServerSpec, config: DaemonConfig): string[] {
  const primary = spec.allocations.find((allocation) => allocation.isPrimary) ?? spec.allocations[0];
  const merged: Record<string, string> = {
    ...spec.environment,
    TZ: config.system.timezone,
    STARTUP: spec.invocation,
    SERVER_MEMORY: String(spec.limits.memory),
    SERVER_IP: primary?.ip ?? "0.0.0.0",
    SERVER_PORT: String(primary?.port ?? 0),
  };
  return Object.entries(merged).map(([key, value]) => `${key}=${value}`);
}

export class DockerManager {
  readonly docker: Docker;

  constructor(private readonly config: DaemonConfig) {
    // Windows (Docker Desktop) exposes the engine over a named pipe; Unix hosts
    // use the socket. DOCKER_SOCKET overrides either.
    const defaultSocket = process.platform === "win32" ? "//./pipe/docker_engine" : "/var/run/docker.sock";
    this.docker = new Docker({ socketPath: process.env.DOCKER_SOCKET ?? defaultSocket });
  }

  async ping(): Promise<void> {
    await this.docker.ping();
  }

  async version(): Promise<string> {
    try {
      const info = (await this.docker.version()) as { Version?: string };
      return info.Version ?? "unknown";
    } catch {
      return "unavailable";
    }
  }

  /** Creates the bridge network the containers attach to, if missing. */
  async ensureNetwork(): Promise<void> {
    const name = this.config.docker.network.name;
    try {
      const networks = await this.docker.listNetworks({ filters: { name: [name] } });
      if (networks.some((network) => network.Name === name)) {
        log.info(`Docker network ${name} already exists`);
        return;
      }

      await this.docker.createNetwork({
        Name: name,
        Driver: this.config.docker.network.driver,
        EnableIPv6: false,
        Internal: false,
        Attachable: false,
        IPAM: {
          Driver: "default",
          Config: [{ Subnet: "172.19.0.0/16", Gateway: this.config.docker.network.interface }],
        },
        Options: {
          "com.docker.network.bridge.default_bridge": "false",
          "com.docker.network.bridge.enable_icc": "true",
          "com.docker.network.bridge.name": name,
          "com.docker.network.driver.mtu": "1500",
        },
      });
      log.info(`Created docker network ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // "Pool overlaps" means another network already uses that subnet range.
      // Try a different subnet (172.20.x, 172.21.x, …) automatically.
      if (message.includes("Pool overlaps") || message.includes("pool overlaps")) {
        log.warn(`Subnet 172.19.0.0/16 overlaps with an existing network; trying alternate subnets…`);
        for (let octet = 20; octet <= 31; octet++) {
          try {
            await this.docker.createNetwork({
              Name: name,
              Driver: this.config.docker.network.driver,
              EnableIPv6: false,
              Internal: false,
              Attachable: false,
              IPAM: {
                Driver: "default",
                Config: [{ Subnet: `172.${octet}.0.0/16`, Gateway: `172.${octet}.0.1` }],
              },
              Options: {
                "com.docker.network.bridge.default_bridge": "false",
                "com.docker.network.bridge.enable_icc": "true",
                "com.docker.network.bridge.name": name,
                "com.docker.network.driver.mtu": "1500",
              },
            });
            log.info(`Created docker network ${name} on subnet 172.${octet}.0.0/16`);
            return;
          } catch {
            continue;
          }
        }
        log.warn(`Unable to create docker network ${name}: all subnets 172.19–172.31 overlap. Create it manually.`);
      } else {
        log.warn(`Unable to ensure docker network ${name}`, error);
      }
    }
  }

  container(uuid: string): Docker.Container {
    return this.docker.getContainer(containerName(uuid));
  }

  async exists(uuid: string): Promise<boolean> {
    try {
      await this.container(uuid).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async pullImage(image: string, onProgress?: (line: string) => void): Promise<void> {
    log.info(`Pulling image ${image}`);
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(image, {}, (error: Error | null, stream?: NodeJS.ReadableStream) => {
        if (error || !stream) return reject(error ?? new Error("No pull stream returned."));
        this.docker.modem.followProgress(
          stream,
          (progressError: Error | null) => (progressError ? reject(progressError) : resolve()),
          (event: { status?: string; progress?: string }) => {
            if (onProgress && event.status) onProgress(`${event.status}${event.progress ? ` ${event.progress}` : ""}`);
          },
        );
      });
    });
  }

  async createContainer(spec: ServerSpec, volumePath: string): Promise<Docker.Container> {
    const hostConfig = buildHostConfig(spec, this.config, volumePath);

    return this.docker.createContainer({
      name: containerName(spec.uuid),
      Image: spec.image,
      Hostname: spec.uuid.slice(0, 12),
      WorkingDir: "/home/container",
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: true,
      Tty: true,
      Env: environmentArray(spec, this.config),
      ExposedPorts: exposedPorts(spec),
      Labels: {
        "spanel.managed": "true",
        "spanel.uuid": spec.uuid,
        "spanel.kind": spec.serviceKind,
      },
      HostConfig: hostConfig,
      Entrypoint: ["/bin/sh", "-c"],
      Cmd: [spec.invocation],
    });
  }

  async removeContainer(uuid: string): Promise<void> {
    try {
      await this.container(uuid).remove({ force: true, v: false });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status !== 404) throw error;
    }
  }

  async state(uuid: string): Promise<string> {
    try {
      const info = await this.container(uuid).inspect();
      if (info.State.Running) return "running";
      if (info.State.Restarting) return "starting";
      return "offline";
    } catch {
      return "offline";
    }
  }

  async attach(uuid: string): Promise<Duplex> {
    const stream = await this.container(uuid).attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
      logs: false,
    });
    return stream as unknown as Duplex;
  }

  async logs(uuid: string, tail: number): Promise<string> {
    try {
      const buffer = (await this.container(uuid).logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: false,
      })) as unknown as Buffer;
      return buffer.toString("utf8");
    } catch {
      return "";
    }
  }

  /** Single-shot stats sample converted into panel units. */
  async stats(uuid: string, diskBytes: number, limits: { memory: number }): Promise<ResourceUsage> {
    const fallback: ResourceUsage = {
      state: "offline",
      isSuspended: false,
      memoryBytes: 0,
      memoryLimitBytes: limits.memory * 1024 * 1024,
      cpuAbsolute: 0,
      diskBytes,
      networkRxBytes: 0,
      networkTxBytes: 0,
      uptimeMs: 0,
    };

    try {
      const container = this.container(uuid);
      const info = await container.inspect();
      if (!info.State.Running) return fallback;

      const raw = (await container.stats({ stream: false })) as unknown as DockerStats;

      const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - (raw.precpu_stats?.cpu_usage?.total_usage ?? 0);
      const systemDelta = raw.cpu_stats.system_cpu_usage - (raw.precpu_stats?.system_cpu_usage ?? 0);
      const cores = raw.cpu_stats.online_cpus || raw.cpu_stats.cpu_usage.percpu_usage?.length || 1;
      const cpuAbsolute = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * cores * 100 : 0;

      const cache = raw.memory_stats.stats?.inactive_file ?? raw.memory_stats.stats?.cache ?? 0;
      const memoryBytes = Math.max(0, (raw.memory_stats.usage ?? 0) - cache);

      let rx = 0;
      let tx = 0;
      for (const network of Object.values(raw.networks ?? {})) {
        rx += network.rx_bytes ?? 0;
        tx += network.tx_bytes ?? 0;
      }

      const startedAt = new Date(info.State.StartedAt).getTime();

      return {
        state: "running",
        isSuspended: false,
        memoryBytes,
        memoryLimitBytes: limits.memory > 0 ? limits.memory * 1024 * 1024 : (raw.memory_stats.limit ?? 0),
        cpuAbsolute: Number(cpuAbsolute.toFixed(2)),
        diskBytes,
        networkRxBytes: rx,
        networkTxBytes: tx,
        uptimeMs: Number.isFinite(startedAt) ? Date.now() - startedAt : 0,
      };
    } catch {
      return fallback;
    }
  }

  /** Runs the egg install script in a throwaway container. */
  async runInstall(
    spec: ServerSpec,
    volumePath: string,
    scriptPath: string,
    onOutput: (line: string) => void,
  ): Promise<number> {
    await this.pullImage(spec.egg.scriptContainer, onOutput).catch((error) => {
      onOutput(`[install] unable to pull installer image: ${error instanceof Error ? error.message : error}`);
    });

    const container = await this.docker.createContainer({
      name: `${containerName(spec.uuid)}-installer`,
      Image: spec.egg.scriptContainer,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      User: "root",
      WorkingDir: "/mnt/server",
      Env: environmentArray(spec, this.config),
      Entrypoint: [spec.egg.scriptEntry, "/mnt/install/install.sh"],
      HostConfig: {
        Binds: [`${volumePath}:/mnt/server:rw`, `${scriptPath}:/mnt/install:ro`],
        NetworkMode: this.config.docker.network.name,
        Dns: this.config.docker.network.dns,
        Memory: 1024 * 1024 * 1024,
        LogConfig: { Type: "json-file", Config: { "max-size": "5m", "max-file": "1" } },
      },
      Labels: { "spanel.managed": "true", "spanel.installer": spec.uuid },
    });

    const stream = await container.attach({ stream: true, stdout: true, stderr: true });
    let buffer = "";
    stream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) onOutput(line.replace(/\r$/, ""));
    });

    await container.start();
    const result = (await container.wait()) as { StatusCode: number };
    if (buffer.trim()) onOutput(buffer.trim());
    await container.remove({ force: true }).catch(() => undefined);
    return result.StatusCode;
  }

  async listManaged(): Promise<string[]> {
    const containers = await this.docker.listContainers({ all: true, filters: { label: ["spanel.managed=true"] } });
    return containers
      .map((container) => container.Labels?.["spanel.uuid"])
      .filter((uuid): uuid is string => typeof uuid === "string");
  }
}

interface DockerStats {
  cpu_stats: {
    cpu_usage: { total_usage: number; percpu_usage?: number[] };
    system_cpu_usage: number;
    online_cpus?: number;
  };
  precpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number };
  memory_stats: { usage?: number; limit?: number; stats?: { cache?: number; inactive_file?: number } };
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
}

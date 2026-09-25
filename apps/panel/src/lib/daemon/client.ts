import { createHmac } from "node:crypto";
import type { Node } from "@prisma/client";
import { decrypt } from "../crypto";

/**
 * Typed client for the SPanel daemon (the agent installed on every node).
 *
 * Every request is authenticated with a bearer token of the form
 * `<tokenId>.<token>` plus an HMAC signature over the body so a leaked
 * proxy log cannot be replayed with a modified payload.
 */

export class DaemonError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "DaemonError";
  }
}

export interface DaemonResourceUsage {
  state: string;
  isSuspended: boolean;
  memoryBytes: number;
  memoryLimitBytes: number;
  cpuAbsolute: number;
  diskBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptimeMs: number;
}

export interface DaemonFileEntry {
  name: string;
  mode: string;
  size: number;
  isFile: boolean;
  isSymlink: boolean;
  mimetype: string;
  modifiedAt: string;
}

export interface ServerBuildLimits {
  memory: number;
  swap: number;
  disk: number;
  io: number;
  cpu: number;
  threads: string | null;
  oomKiller: boolean;
}

export interface ServerNetworkAllocation {
  ip: string;
  port: number;
  isPrimary: boolean;
}

export interface DaemonServerSpec {
  uuid: string;
  name: string;
  serviceKind: string;
  suspended: boolean;
  invocation: string;
  image: string;
  stopSignal: string;
  environment: Record<string, string>;
  limits: ServerBuildLimits;
  allocations: ServerNetworkAllocation[];
  egg: {
    uuid: string;
    features: string[];
    fileDenylist: string[];
    configFiles: unknown;
    configStartup: unknown;
    configLogs: unknown;
    scriptContainer: string;
    scriptEntry: string;
    scriptInstall: string;
  };
  web?: {
    runtime: string;
    phpVersion: string | null;
    documentRoot: string;
    hostnames: {
      hostname: string;
      kind: string;
      httpsMode: string;
      forceHttps: boolean;
      targetPort: number | null;
    }[];
  };
  /** Admin-defined host→container binds. Optional for backward compatibility. */
  mounts?: {
    source: string;
    target: string;
    readOnly: boolean;
  }[];
}

export interface DaemonSystemInfo {
  version: string;
  architecture: string;
  cpuCount: number;
  kernel: string;
  os: string;
  dockerVersion: string;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  totalDiskBytes: number;
  freeDiskBytes: number;
  serverCount: number;
}

/** Node telemetry snapshot, mirroring the daemon heartbeat body. */
export interface DaemonHealthReport {
  daemonVersion: string;
  system: {
    os: string;
    arch: string;
    kernel: string;
    cpuModel: string;
    cpuCores: number;
    memoryTotal: number;
    diskTotal: number;
    dockerVersion: string;
  };
  usage: {
    memoryUsed: number;
    memoryTotal: number;
    diskUsed: number;
    diskTotal: number;
    cpuPercent: number;
    loadAverage: number;
    runningServers: number;
    totalServers: number;
    uptimeSeconds: number;
  };
  latencyMs: number;
}

export interface DaemonClientTarget {
  id: number;
  scheme: string;
  fqdn: string;
  daemonListenHost: string;
  daemonPort: number;
  daemonTokenId: string;
  daemonToken: string;
}

export function nodeTarget(node: Node): DaemonClientTarget {
  return {
    id: node.id,
    scheme: node.scheme,
    fqdn: node.fqdn,
    daemonListenHost: (node as Record<string, unknown>).daemonListenHost as string ?? "",
    daemonPort: node.daemonPort,
    daemonTokenId: node.daemonTokenId,
    daemonToken: decrypt(node.daemonToken),
  };
}

const DEFAULT_TIMEOUT_MS = 15_000;

export class DaemonClient {
  private readonly base: string;
  private readonly token: string;
  private readonly secret: string;

  constructor(private readonly target: DaemonClientTarget) {
    // For server-side (panel→daemon) connections:
    // - If daemonListenHost is set, connect directly to it (internal/NAT IP) on the daemon port via HTTP.
    // - If scheme is HTTPS and no listenHost override, nginx terminates TLS on 443;
    //   connect via https://fqdn (port 443) so it goes through nginx.
    // - Otherwise connect directly to fqdn:daemonPort.
    const connectHost = target.daemonListenHost || target.fqdn;
    if (target.daemonListenHost) {
      // Direct internal connection — always HTTP to the raw daemon port.
      this.base = `http://${connectHost}:${target.daemonPort}`;
    } else if (target.scheme === "https") {
      // HTTPS via nginx on standard port 443.
      this.base = `https://${connectHost}`;
    } else {
      this.base = `http://${connectHost}:${target.daemonPort}`;
    }
    this.secret = target.daemonToken;
    this.token = `${target.daemonTokenId}.${target.daemonToken}`;
  }

  /**
   * Public websocket URL used by the browser console — always uses the public FQDN.
   * When scheme is HTTPS, uses wss:// on the standard port (443) because nginx
   * terminates TLS and proxies to the daemon's internal port.
   */
  websocketUrl(serverUuid: string): string {
    const wsScheme = this.target.scheme === "https" ? "wss" : "ws";
    // When using HTTPS, TLS is terminated by nginx on port 443, so omit the port.
    // When using HTTP, include the daemon port explicitly.
    if (this.target.scheme === "https") {
      return `${wsScheme}://${this.target.fqdn}/api/servers/${serverUuid}/ws`;
    }
    return `${wsScheme}://${this.target.fqdn}:${this.target.daemonPort}/api/servers/${serverUuid}/ws`;
  }

  private sign(body: string): string {
    return createHmac("sha256", this.secret).update(body).digest("hex");
  }

  private async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; timeoutMs?: number; raw?: boolean } = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const serialised = options.body === undefined ? "" : JSON.stringify(options.body);

    try {
      const response = await fetch(`${this.base}${path}`, {
        method,
        signal: controller.signal,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
          "X-Spanel-Signature": this.sign(serialised),
        },
        body: options.body === undefined ? undefined : serialised,
      });

      if (!response.ok) {
        let detail: unknown;
        try {
          detail = await response.json();
        } catch {
          detail = await response.text().catch(() => undefined);
        }
        throw new DaemonError(`Daemon responded ${response.status} for ${method} ${path}`, response.status, detail);
      }

      if (options.raw) return (await response.text()) as unknown as T;
      if (response.status === 204) return undefined as unknown as T;
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (error) {
      if (error instanceof DaemonError) throw error;
      const message = error instanceof Error ? error.message : "unknown error";
      throw new DaemonError(`Unable to reach daemon at ${this.base}: ${message}`, 0);
    } finally {
      clearTimeout(timeout);
    }
  }

  // -- node level ----------------------------------------------------------
  system(): Promise<DaemonSystemInfo> {
    return this.request<DaemonSystemInfo>("GET", "/api/system", { timeoutMs: 8000 });
  }

  /** Node-level telemetry snapshot, identical to the heartbeat body. */
  healthReport(): Promise<DaemonHealthReport> {
    return this.request<DaemonHealthReport>("GET", "/api/health/report", { timeoutMs: 8000 });
  }

  /** Asks the daemon to send a heartbeat right now. */
  requestHeartbeat(): Promise<{ sent: boolean; panel: string | null }> {
    return this.request<{ sent: boolean; panel: string | null }>("POST", "/api/health/report", { timeoutMs: 10_000 });
  }

  /** Container state of every server the node knows about. */
  serverStates(): Promise<{ states: { uuid: string; state: string }[] }> {
    return this.request<{ states: { uuid: string; state: string }[] }>("GET", "/api/states", { timeoutMs: 8000 });
  }

  // -- server lifecycle ----------------------------------------------------
  createServer(spec: DaemonServerSpec, startOnCompletion = false) {
    return this.request<{ accepted: boolean }>("POST", "/api/servers", {
      body: { spec, startOnCompletion },
      timeoutMs: 30_000,
    });
  }

  syncServer(spec: DaemonServerSpec) {
    return this.request<{ synced: boolean }>("PATCH", `/api/servers/${spec.uuid}`, { body: { spec } });
  }

  deleteServer(uuid: string) {
    return this.request<void>("DELETE", `/api/servers/${uuid}`, { timeoutMs: 30_000 });
  }

  reinstallServer(uuid: string) {
    return this.request<{ accepted: boolean }>("POST", `/api/servers/${uuid}/reinstall`, { timeoutMs: 30_000 });
  }

  power(uuid: string, action: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/power`, { body: { action }, timeoutMs: 30_000 });
  }

  sendCommand(uuid: string, command: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/commands`, { body: { commands: [command] } });
  }

  resources(uuid: string) {
    return this.request<DaemonResourceUsage>("GET", `/api/servers/${uuid}/resources`, { timeoutMs: 8000 });
  }

  logs(uuid: string, lines = 200) {
    return this.request<{ data: string[] }>("GET", `/api/servers/${uuid}/logs?lines=${lines}`);
  }

  // -- file manager --------------------------------------------------------
  listDirectory(uuid: string, directory: string) {
    return this.request<{ entries: DaemonFileEntry[] }>(
      "GET",
      `/api/servers/${uuid}/files/list?directory=${encodeURIComponent(directory)}`,
    );
  }

  readFile(uuid: string, file: string) {
    return this.request<string>("GET", `/api/servers/${uuid}/files/contents?file=${encodeURIComponent(file)}`, {
      raw: true,
    });
  }

  writeFile(uuid: string, file: string, contents: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/write`, { body: { file, contents } });
  }

  createDirectory(uuid: string, root: string, name: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/create-directory`, { body: { root, name } });
  }

  renameFiles(uuid: string, root: string, files: { from: string; to: string }[]) {
    return this.request<void>("PUT", `/api/servers/${uuid}/files/rename`, { body: { root, files } });
  }

  deleteFiles(uuid: string, root: string, files: string[]) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/delete`, { body: { root, files } });
  }

  copyFile(uuid: string, location: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/copy`, { body: { location } });
  }

  compressFiles(uuid: string, root: string, files: string[]) {
    return this.request<{ name: string }>("POST", `/api/servers/${uuid}/files/compress`, {
      body: { root, files },
      timeoutMs: 120_000,
    });
  }

  decompressFile(uuid: string, root: string, file: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/decompress`, {
      body: { root, file },
      timeoutMs: 120_000,
    });
  }

  chmodFiles(uuid: string, root: string, files: { file: string; mode: string }[]) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/chmod`, { body: { root, files } });
  }

  pullFile(uuid: string, root: string, url: string, fileName?: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/pull`, {
      body: { root, url, fileName },
      timeoutMs: 60_000,
    });
  }

  // -- backups -------------------------------------------------------------
  createBackup(uuid: string, backupUuid: string, ignore: string[]) {
    return this.request<void>("POST", `/api/servers/${uuid}/backup`, {
      body: { uuid: backupUuid, ignore },
      timeoutMs: 60_000,
    });
  }

  restoreBackup(uuid: string, backupUuid: string, truncate: boolean) {
    return this.request<void>("POST", `/api/servers/${uuid}/backup/${backupUuid}/restore`, {
      body: { truncate },
      timeoutMs: 60_000,
    });
  }

  deleteBackup(uuid: string, backupUuid: string) {
    return this.request<void>("DELETE", `/api/servers/${uuid}/backup/${backupUuid}`);
  }

  // -- webhost / reverse proxy --------------------------------------------
  syncProxy(payload: {
    serverUuid: string;
    hostnames: { hostname: string; kind: string; httpsMode: string; forceHttps: boolean; targetPort: number | null }[];
    upstream: { ip: string; port: number } | null;
    web?: { runtime: string; phpVersion: string | null; documentRoot: string };
  }) {
    return this.request<{ applied: boolean; notes?: string[] }>("POST", "/api/proxy/sync", {
      body: payload,
      timeoutMs: 60_000,
    });
  }

  removeProxy(serverUuid: string) {
    return this.request<void>("DELETE", `/api/proxy/${serverUuid}`);
  }
}

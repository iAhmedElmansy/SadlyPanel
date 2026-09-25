/** Shared types mirroring the panel's daemon contract. */

export interface ServerLimits {
  memory: number; // MiB, 0 = unlimited
  swap: number; // MiB, -1 = unlimited
  disk: number; // MiB
  io: number; // 10..1000
  cpu: number; // percent, 0 = unlimited
  threads: string | null;
  oomKiller: boolean;
}

export interface ServerAllocation {
  ip: string;
  port: number;
  isPrimary: boolean;
}

export interface EggSpec {
  uuid: string;
  features: string[];
  fileDenylist: string[];
  configFiles: unknown;
  configStartup: unknown;
  configLogs: unknown;
  scriptContainer: string;
  scriptEntry: string;
  scriptInstall: string;
}

export interface WebSpec {
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
}

/** A host→container bind exposed into the server (admin-defined mounts). */
export interface MountSpec {
  source: string;
  target: string;
  readOnly: boolean;
}

export interface ServerSpec {
  uuid: string;
  name: string;
  serviceKind: string;
  suspended: boolean;
  invocation: string;
  image: string;
  stopSignal: string;
  environment: Record<string, string>;
  limits: ServerLimits;
  allocations: ServerAllocation[];
  egg: EggSpec;
  web?: WebSpec;
  /** Optional so older panels that omit this field still work. */
  mounts?: MountSpec[];
}

export type ServerState = "offline" | "starting" | "running" | "stopping" | "installing";

export interface ResourceUsage {
  state: ServerState | string;
  isSuspended: boolean;
  memoryBytes: number;
  memoryLimitBytes: number;
  cpuAbsolute: number;
  diskBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptimeMs: number;
}

export interface FileEntry {
  name: string;
  mode: string;
  size: number;
  isFile: boolean;
  isSymlink: boolean;
  mimetype: string;
  modifiedAt: string;
}

export interface SystemInfo {
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

export interface ProxySyncRequest {
  serverUuid: string;
  hostnames: {
    hostname: string;
    kind: string;
    httpsMode: string;
    forceHttps: boolean;
    targetPort: number | null;
  }[];
  upstream: { ip: string; port: number } | null;
  web?: { runtime: string; phpVersion: string | null; documentRoot: string };
}

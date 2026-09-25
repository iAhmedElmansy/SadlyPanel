import { prisma } from "../db";
import type { DaemonServerSpec } from "./client";

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Replaces {{VAR}} tokens in a startup string with concrete environment values. */
export function renderStartup(startup: string, environment: Record<string, string>): string {
  return startup.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/gi, (_match, key: string) => {
    const upper = key.toUpperCase();
    return environment[upper] ?? "";
  });
}

/**
 * Builds the full spec the daemon needs to create/sync a server container.
 * Reads the server with everything required in a single query.
 */
export async function buildServerSpec(serverId: number): Promise<DaemonServerSpec> {
  const server = await prisma.server.findUniqueOrThrow({
    where: { id: serverId },
    include: {
      egg: { include: { variables: true } },
      allocations: true,
      variables: { include: { variable: true } },
      bindings: true,
      node: true,
      mounts: { include: { mount: true } },
    },
  });

  const primary = server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];

  const environment: Record<string, string> = {};
  for (const eggVar of server.egg.variables) {
    environment[eggVar.envVariable] = eggVar.defaultValue;
  }
  for (const value of server.variables) {
    environment[value.variable.envVariable] = value.value;
  }

  // Standard runtime variables every egg can rely on.
  environment.SERVER_MEMORY = String(server.memory);
  environment.SERVER_DISK = String(server.disk);
  environment.SERVER_IP = primary?.ip ?? "0.0.0.0";
  environment.SERVER_PORT = String(primary?.port ?? 0);
  environment.SERVER_UUID = server.uuid;
  environment.P_SERVER_UUID = server.uuid;
  environment.P_SERVER_ALLOCATION_LIMIT = String(server.allocationLimit);
  environment.TZ = "UTC";
  if (server.webRuntime) environment.WEB_RUNTIME = server.webRuntime;
  if (server.phpVersion) environment.PHP_VERSION = server.phpVersion;
  environment.DOCUMENT_ROOT = server.documentRoot;

  const spec: DaemonServerSpec = {
    uuid: server.uuid,
    name: server.name,
    serviceKind: server.serviceKind,
    suspended: server.suspended,
    invocation: renderStartup(server.startup, environment),
    image: server.image,
    stopSignal: server.egg.configStop || "^C",
    environment,
    limits: {
      memory: server.memory,
      swap: server.swap,
      disk: server.disk,
      io: server.io,
      cpu: server.cpu,
      threads: server.threads,
      oomKiller: server.oomKiller,
    },
    allocations: server.allocations.map((a) => ({ ip: a.ip, port: a.port, isPrimary: a.isPrimary })),
    egg: {
      uuid: server.egg.uuid,
      features: parseJson<string[]>(server.egg.features, []),
      fileDenylist: parseJson<string[]>(server.egg.fileDenylist, []),
      configFiles: parseJson<unknown>(server.egg.configFiles, {}),
      configStartup: parseJson<unknown>(server.egg.configStartup, {}),
      configLogs: parseJson<unknown>(server.egg.configLogs, {}),
      scriptContainer: server.egg.scriptContainer,
      scriptEntry: server.egg.scriptEntry,
      scriptInstall: server.egg.scriptInstall,
    },
    mounts: server.mounts.map((sm) => ({
      source: sm.mount.source,
      target: sm.mount.target,
      readOnly: sm.mount.readOnly,
    })),
  };

  if (server.serviceKind === "webhost") {
    spec.web = {
      runtime: server.webRuntime ?? "html",
      phpVersion: server.phpVersion,
      documentRoot: server.documentRoot,
      hostnames: server.bindings.map((b) => ({
        hostname: b.hostname,
        kind: b.kind,
        httpsMode: b.httpsMode,
        forceHttps: b.forceHttps,
        targetPort: b.targetPort,
      })),
    };
  }

  return spec;
}

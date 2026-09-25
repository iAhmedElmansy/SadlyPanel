import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import YAML from "yaml";

/**
 * Daemon configuration. Loaded from (in order):
 *   1. --config <path>
 *   2. SPANEL_CONFIG env var
 *   3. /etc/spanel/config.yml
 *   4. ./config.yml
 * Environment variables always win so containers can be configured without a file.
 */

export interface DaemonConfig {
  debug: boolean;
  api: {
    host: string;
    port: number;
    ssl: { enabled: boolean; cert: string; key: string };
    uploadLimit: number;
  };
  system: {
    data: string;
    archiveDirectory: string;
    backupDirectory: string;
    tmpDirectory: string;
    timezone: string;
    sftp: { bindPort: number };
  };
  docker: {
    network: { name: string; driver: string; interface: string; dns: string[] };
    installLimit: number;
  };
  proxy: {
    enabled: boolean;
    httpPort: number;
    httpsPort: number;
    acmeEmail: string;
    configDirectory: string;
    reloadCommand: string;
  };
  remote: string;
  tokenId: string;
  token: string;
  /** Skip Docker checks and run in a degraded dev mode (local development). */
  skipDocker: boolean;
}

const isLinux = process.platform === "linux";

/**
 * Platform-aware defaults. Production nodes are Linux and use the FHS paths
 * (/etc/spanel, /var/lib/spanel). For local development on other platforms
 * (Windows, macOS) we fall back to a per-user ~/.spanel directory so the
 * daemon never tries to create system paths like C:\var\lib on Windows.
 */
const DEFAULT_DATA_DIR = isLinux ? "/var/lib/spanel/volumes" : path.join(os.homedir(), ".spanel", "volumes");
const DEFAULT_VHOSTS_DIR = isLinux ? "/etc/spanel/vhosts" : path.join(os.homedir(), ".spanel", "vhosts");

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function candidatePaths(): string[] {
  const explicit = argValue("--config") ?? process.env.SPANEL_CONFIG;
  const paths = explicit ? [explicit] : [];
  paths.push("/etc/spanel/config.yml");
  // Per-user location, handy for local development where /etc is unavailable.
  paths.push(path.join(os.homedir(), ".spanel", "config.yml"));
  paths.push(path.join(process.cwd(), "config.yml"));
  return paths;
}

function readFileConfig(): Record<string, unknown> {
  for (const candidate of candidatePaths()) {
    try {
      if (fs.existsSync(candidate)) {
        const parsed = YAML.parse(fs.readFileSync(candidate, "utf8"));
        if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
      }
    } catch (error) {
      console.error(`[config] Unable to parse ${candidate}:`, error instanceof Error ? error.message : error);
    }
  }
  return {};
}

function pick<T>(value: unknown, fallback: T): T {
  return value === undefined || value === null || value === "" ? fallback : (value as T);
}

function bool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export function loadConfig(): DaemonConfig {
  const file = readFileConfig();
  const api = (file.api ?? {}) as Record<string, unknown>;
  const ssl = (api.ssl ?? {}) as Record<string, unknown>;
  const system = (file.system ?? {}) as Record<string, unknown>;
  const sftp = (system.sftp ?? {}) as Record<string, unknown>;
  const docker = (file.docker ?? {}) as Record<string, unknown>;
  const network = (docker.network ?? {}) as Record<string, unknown>;
  const proxy = (file.proxy ?? {}) as Record<string, unknown>;

  const dataDir = pick(process.env.SPANEL_DATA ?? system.data, DEFAULT_DATA_DIR);

  const config: DaemonConfig = {
    debug: bool(process.env.SPANEL_DEBUG ?? file.debug, false),
    api: {
      host: pick(process.env.SPANEL_HOST ?? api.host, "0.0.0.0"),
      port: Number(pick(process.env.SPANEL_PORT ?? api.port, 8080)),
      ssl: {
        enabled: bool(process.env.SPANEL_SSL ?? ssl.enabled, false),
        cert: pick(process.env.SPANEL_SSL_CERT ?? ssl.cert, ""),
        key: pick(process.env.SPANEL_SSL_KEY ?? ssl.key, ""),
      },
      uploadLimit: Number(pick(api.upload_limit, 256)),
    },
    system: {
      data: dataDir,
      archiveDirectory: pick(system.archive_directory, path.join(dataDir, ".archives")),
      backupDirectory: pick(system.backup_directory, path.join(dataDir, ".backups")),
      tmpDirectory: pick(system.tmp_directory, path.join(os.tmpdir(), "spanel")),
      timezone: pick(system.timezone, "UTC"),
      sftp: { bindPort: Number(pick(sftp.bind_port, 2022)) },
    },
    docker: {
      network: {
        name: pick(network.name, "spanel0"),
        driver: pick(network.driver, "bridge"),
        interface: pick(network.interface, "172.19.0.1"),
        dns: Array.isArray(network.dns) ? (network.dns as string[]) : ["1.1.1.1", "8.8.8.8"],
      },
      installLimit: Number(pick(docker.install_limit, 5)),
    },
    proxy: {
      enabled: bool(proxy.enabled, true),
      httpPort: Number(pick(proxy.http_port, 80)),
      httpsPort: Number(pick(proxy.https_port, 443)),
      acmeEmail: pick(proxy.acme_email, ""),
      configDirectory: pick(process.env.SPANEL_VHOSTS ?? proxy.config_directory, DEFAULT_VHOSTS_DIR),
      reloadCommand: pick(proxy.reload_command, "nginx -s reload"),
    },
    remote: pick(process.env.SPANEL_REMOTE ?? file.remote, "").replace(/\/+$/, ""),
    tokenId: pick(process.env.SPANEL_TOKEN_ID ?? file.token_id, ""),
    token: pick(process.env.SPANEL_TOKEN ?? file.token, ""),
    skipDocker: bool(process.env.SPANEL_SKIP_DOCKER ?? file.skip_docker, false),
  };

  if (!config.token || !config.tokenId) {
    throw new Error(
      "[config] token_id and token are required. Copy them from the panel (Admin → Nodes → your node) into /etc/spanel/config.yml.",
    );
  }

  for (const dir of [
    config.system.data,
    config.system.archiveDirectory,
    config.system.backupDirectory,
    config.system.tmpDirectory,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return config;
}

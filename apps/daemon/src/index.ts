import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import { statfs } from "node:fs/promises";
import { loadConfig, type DaemonConfig } from "./config.js";
import { createLogger, setLogLevel } from "./logger.js";
import { AuthError, verifyPanelRequest } from "./auth.js";
import { DockerManager } from "./docker.js";
import { ServerManager } from "./server-manager.js";
import { FileService } from "./file-service.js";
import { ProxyService } from "./proxy-service.js";
import { BackupService } from "./backup-service.js";
import { ConsoleGateway } from "./console-gateway.js";
import { PanelClient } from "./panel-client.js";
import { HeartbeatReporter } from "./heartbeat.js";
import type { ServerSpec, SystemInfo } from "./types.js";
import { HttpError } from "./errors.js";
import { VERSION } from "./version.js";

const log = createLogger("daemon");
export { VERSION };

interface RouteContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  body: unknown;
  params: Record<string, string>;
}

type Handler = (context: RouteContext) => Promise<unknown>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const pattern = path
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        keys.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { pattern: new RegExp(`^${pattern}$`), keys };
}

async function readBody(request: http.IncomingMessage, limitBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new HttpError("Request body too large.", 413));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function diskSpace(directory: string): Promise<{ total: number; free: number }> {
  try {
    const stats = await statfs(directory);
    return { total: Number(stats.blocks) * Number(stats.bsize), free: Number(stats.bavail) * Number(stats.bsize) };
  } catch {
    return { total: 0, free: 0 };
  }
}

export class Daemon {
  private readonly routes: Route[] = [];
  private readonly docker: DockerManager;
  private readonly manager: ServerManager;
  private readonly proxy: ProxyService;
  private readonly backups: BackupService;
  private readonly panel: PanelClient;
  private readonly heartbeat: HeartbeatReporter;
  private server?: http.Server | https.Server;
  private gateway?: ConsoleGateway;

  constructor(private readonly config: DaemonConfig) {
    this.docker = new DockerManager(config);
    this.manager = new ServerManager(config, this.docker);
    this.proxy = new ProxyService(config, (uuid) => this.manager.volumePath(uuid));
    this.backups = new BackupService(config, (uuid) => this.manager.volumePath(uuid));
    this.panel = new PanelClient(config);
    this.heartbeat = new HeartbeatReporter(config, this.panel, this.docker, this.manager, VERSION);
    this.registerRoutes();
    this.registerPanelReporting();
  }

  /** Mirrors local lifecycle events back to the panel. */
  private registerPanelReporting(): void {
    this.manager.on("status", (uuid: string, state: string) => {
      void this.panel.reportServerState(uuid, state);
    });
    this.manager.on("installed", (uuid: string, successful: boolean, note: string, reinstall: boolean) => {
      void this.panel.reportInstall(uuid, successful, note, reinstall);
    });
  }

  private route(method: string, path: string, handler: Handler): void {
    const { pattern, keys } = compile(path);
    this.routes.push({ method, pattern, keys, handler });
  }

  private specOf(uuid: string): ServerSpec {
    return this.manager.require(uuid).spec;
  }

  private files(uuid: string): FileService {
    const spec = this.specOf(uuid);
    return new FileService(this.manager.safePath(uuid), spec.egg.fileDenylist ?? []);
  }

  private registerRoutes(): void {
    // -- node ---------------------------------------------------------------
    this.route("GET", "/api/system", async (): Promise<SystemInfo> => {
      const disk = await diskSpace(this.config.system.data);
      return {
        version: VERSION,
        architecture: process.arch,
        cpuCount: os.cpus().length,
        kernel: os.release(),
        os: `${os.type()} ${os.release()}`,
        dockerVersion: await this.docker.version(),
        totalMemoryBytes: os.totalmem(),
        freeMemoryBytes: os.freemem(),
        totalDiskBytes: disk.total,
        freeDiskBytes: disk.free,
        serverCount: this.manager.count(),
      };
    });

    this.route("GET", "/api/servers", async () => ({
      servers: this.manager.list().map((spec) => ({ uuid: spec.uuid, name: spec.name, kind: spec.serviceKind })),
    }));

    /** Snapshot of node health, identical to the heartbeat body. Useful for debugging. */
    this.route("GET", "/api/health/report", async () => this.heartbeat.collect());

    /** Forces an immediate heartbeat (used by the panel's "Test connection"). */
    this.route("POST", "/api/health/report", async () => {
      const reply = await this.heartbeat.beat();
      return { sent: reply !== null, panel: this.config.remote || null };
    });

    /** Current state of every server on this node, for panel reconciliation. */
    this.route("GET", "/api/states", async () => ({ states: this.manager.states() }));

    // -- lifecycle ----------------------------------------------------------
    this.route("POST", "/api/servers", async ({ body }) => {
      const payload = body as { spec?: ServerSpec; startOnCompletion?: boolean };
      if (!payload?.spec?.uuid) throw new HttpError("A server spec is required.", 422);
      await this.manager.create(payload.spec, payload.startOnCompletion ?? false);
      return { accepted: true };
    });

    this.route("PATCH", "/api/servers/:uuid", async ({ body, params }) => {
      const payload = body as { spec?: ServerSpec };
      if (!payload?.spec?.uuid) throw new HttpError("A server spec is required.", 422);
      if (payload.spec.uuid !== params.uuid) throw new HttpError("Spec uuid does not match the URL.", 422);
      await this.manager.sync(payload.spec);
      return { synced: true };
    });

    this.route("DELETE", "/api/servers/:uuid", async ({ params }) => {
      await this.proxy.remove(params.uuid!).catch(() => undefined);
      await this.manager.destroy(params.uuid!);
      return null;
    });

    this.route("POST", "/api/servers/:uuid/reinstall", async ({ params }) => {
      await this.manager.reinstall(params.uuid!);
      return { accepted: true };
    });

    this.route("POST", "/api/servers/:uuid/power", async ({ params, body }) => {
      const action = (body as { action?: string }).action;
      if (!action) throw new HttpError("An action is required.", 422);
      await this.manager.power(params.uuid!, action);
      return null;
    });

    this.route("POST", "/api/servers/:uuid/commands", async ({ params, body }) => {
      const commands = (body as { commands?: string[] }).commands ?? [];
      for (const command of commands) await this.manager.sendCommand(params.uuid!, command);
      return null;
    });

    this.route("GET", "/api/servers/:uuid/resources", async ({ params }) => this.manager.usage(params.uuid!));

    this.route("GET", "/api/servers/:uuid/logs", async ({ params, url }) => {
      const lines = Number(url.searchParams.get("lines") ?? 200);
      const output = await this.docker.logs(params.uuid!, Math.min(2000, Math.max(1, lines)));
      return { data: output.split("\n") };
    });

    // -- files --------------------------------------------------------------
    this.route("GET", "/api/servers/:uuid/files/list", async ({ params, url }) => ({
      entries: await this.files(params.uuid!).list(url.searchParams.get("directory") ?? "/"),
    }));

    this.route("GET", "/api/servers/:uuid/files/contents", async ({ params, url, response }) => {
      const file = url.searchParams.get("file");
      if (!file) throw new HttpError("A file is required.", 422);
      const contents = await this.files(params.uuid!).read(file);
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(contents);
      return undefined;
    });

    this.route("POST", "/api/servers/:uuid/files/write", async ({ params, body }) => {
      const payload = body as { file?: string; contents?: string };
      if (!payload.file) throw new HttpError("A file is required.", 422);
      await this.files(params.uuid!).write(payload.file, payload.contents ?? "");
      return null;
    });

    this.route("POST", "/api/servers/:uuid/files/create-directory", async ({ params, body }) => {
      const payload = body as { root?: string; name?: string };
      if (!payload.name) throw new HttpError("A name is required.", 422);
      await this.files(params.uuid!).createDirectory(payload.root ?? "/", payload.name);
      return null;
    });

    this.route("PUT", "/api/servers/:uuid/files/rename", async ({ params, body }) => {
      const payload = body as { root?: string; files?: { from: string; to: string }[] };
      await this.files(params.uuid!).rename(payload.root ?? "/", payload.files ?? []);
      return null;
    });

    this.route("POST", "/api/servers/:uuid/files/delete", async ({ params, body }) => {
      const payload = body as { root?: string; files?: string[] };
      await this.files(params.uuid!).delete(payload.root ?? "/", payload.files ?? []);
      return null;
    });

    this.route("POST", "/api/servers/:uuid/files/copy", async ({ params, body }) => {
      const payload = body as { location?: string };
      if (!payload.location) throw new HttpError("A location is required.", 422);
      return { file: await this.files(params.uuid!).copy(payload.location) };
    });

    this.route("POST", "/api/servers/:uuid/files/compress", async ({ params, body }) => {
      const payload = body as { root?: string; files?: string[] };
      return { name: await this.files(params.uuid!).compress(payload.root ?? "/", payload.files ?? []) };
    });

    this.route("POST", "/api/servers/:uuid/files/decompress", async ({ params, body }) => {
      const payload = body as { root?: string; file?: string };
      if (!payload.file) throw new HttpError("A file is required.", 422);
      await this.files(params.uuid!).decompress(payload.root ?? "/", payload.file);
      return null;
    });

    this.route("POST", "/api/servers/:uuid/files/chmod", async ({ params, body }) => {
      const payload = body as { root?: string; files?: { file: string; mode: string }[] };
      await this.files(params.uuid!).chmod(payload.root ?? "/", payload.files ?? []);
      return null;
    });

    this.route("POST", "/api/servers/:uuid/files/pull", async ({ params, body }) => {
      const payload = body as { root?: string; url?: string; fileName?: string };
      if (!payload.url) throw new HttpError("A URL is required.", 422);
      return { file: await this.files(params.uuid!).pull(payload.root ?? "/", payload.url, payload.fileName) };
    });

    // -- backups ------------------------------------------------------------
    this.route("POST", "/api/servers/:uuid/backup", async ({ params, body }) => {
      const payload = body as { uuid?: string; ignore?: string[] };
      if (!payload.uuid) throw new HttpError("A backup uuid is required.", 422);
      const backupUuid = payload.uuid;
      // Runs detached: large volumes take minutes.
      void this.backups
        .create(params.uuid!, backupUuid, payload.ignore ?? [])
        .then((result) => {
          log.info(`Backup ${result.uuid} finished (${result.bytes} bytes)`);
          void this.panel.reportBackup(backupUuid, {
            successful: true,
            bytes: result.bytes,
            checksum: result.checksum,
          });
        })
        .catch((error) => {
          log.error("Backup failed", error);
          void this.panel.reportBackup(backupUuid, {
            successful: false,
            error: error instanceof Error ? error.message : "Backup failed.",
          });
        });
      return null;
    });

    this.route("POST", "/api/servers/:uuid/backup/:backup/restore", async ({ params, body }) => {
      const truncate = Boolean((body as { truncate?: boolean }).truncate);
      void this.backups
        .restore(params.uuid!, params.backup!, truncate)
        .catch((error) => log.error("Restore failed", error));
      return null;
    });

    this.route("DELETE", "/api/servers/:uuid/backup/:backup", async ({ params }) => {
      await this.backups.remove(params.backup!);
      return null;
    });

    // -- proxy --------------------------------------------------------------
    this.route("POST", "/api/proxy/sync", async ({ body }) => {
      const payload = body as Parameters<ProxyService["sync"]>[0];
      if (!payload?.serverUuid) throw new HttpError("serverUuid is required.", 422);
      return this.proxy.sync(payload);
    });

    this.route("DELETE", "/api/proxy/:uuid", async ({ params }) => {
      await this.proxy.remove(params.uuid!);
      return null;
    });
  }

  private async handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    // Unauthenticated liveness probe.
    if (url.pathname === "/api/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok", version: VERSION, servers: this.manager.count() }));
      return;
    }

    const match = this.routes.find((route) => route.method === request.method && route.pattern.test(url.pathname));

    let rawBody = "";
    if (request.method !== "GET" && request.method !== "DELETE") {
      rawBody = await readBody(request, this.config.api.uploadLimit * 1024 * 1024);
    }

    try {
      verifyPanelRequest(request, rawBody, { tokenId: this.config.tokenId, token: this.config.token });
    } catch (error) {
      const status = error instanceof AuthError ? error.status : 401;
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unauthorised." }));
      return;
    }

    if (!match) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: `No route for ${request.method} ${url.pathname}` }));
      return;
    }

    const groups = url.pathname.match(match.pattern)!.slice(1);
    const params: Record<string, string> = {};
    match.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(groups[index] ?? "");
    });

    let body: unknown = undefined;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Invalid JSON body." }));
        return;
      }
    }

    try {
      const result = await match.handler({ request, response, url, body, params });
      if (response.writableEnded) return;
      if (result === null || result === undefined) {
        response.writeHead(204);
        response.end();
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Internal daemon error.";
      if (status >= 500) log.error(`${request.method} ${url.pathname} failed`, error);
      else log.warn(`${request.method} ${url.pathname}: ${message}`);
      if (!response.writableEnded) {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: message }));
      }
    }
  }

  async start(): Promise<void> {
    if (this.config.debug) setLogLevel("debug");

    if (this.config.skipDocker) {
      log.warn("SPANEL_SKIP_DOCKER is set — skipping Docker checks. Server management is unavailable (development mode).");
    } else {
      try {
        await this.docker.ping();
        log.info(`Docker reachable (${await this.docker.version()})`);
      } catch (error) {
        log.error("Docker is not reachable. Install Docker and ensure the Docker socket is accessible.", error);
        throw error;
      }

      await this.docker.ensureNetwork();
    }

    await this.manager.boot();

    const handler = (request: http.IncomingMessage, response: http.ServerResponse) => {
      void this.handle(request, response).catch((error) => {
        log.error("Unhandled request error", error);
        if (!response.writableEnded) {
          response.writeHead(500, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: "Internal daemon error." }));
        }
      });
    };

    if (this.config.api.ssl.enabled) {
      this.server = https.createServer(
        {
          cert: fs.readFileSync(this.config.api.ssl.cert),
          key: fs.readFileSync(this.config.api.ssl.key),
        },
        handler,
      );
    } else {
      this.server = http.createServer(handler);
    }

    this.gateway = new ConsoleGateway(this.server as http.Server, this.manager, this.config.token);

    await new Promise<void>((resolve) => {
      this.server!.listen(this.config.api.port, this.config.api.host, resolve);
    });

    log.info(
      `SPanel daemon ${VERSION} listening on ${this.config.api.ssl.enabled ? "https" : "http"}://${this.config.api.host}:${this.config.api.port}`,
    );
    log.info(`Panel: ${this.config.remote || "not configured"} · data: ${this.config.system.data}`);

    this.heartbeat.start();
  }

  async stop(): Promise<void> {
    this.heartbeat.stop();
    this.gateway?.close();
    await this.manager.shutdown();
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const daemon = new Daemon(config);
  await daemon.start();

  const shutdown = (signal: string) => {
    log.info(`Received ${signal}, shutting down…`);
    void daemon.stop().then(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => log.error("Unhandled rejection", reason));
}

main().catch((error) => {
  log.error("Daemon failed to start", error);
  process.exit(1);
});

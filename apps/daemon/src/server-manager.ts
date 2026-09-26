import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { Duplex } from "node:stream";
import type { DaemonConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { DockerManager } from "./docker.js";
import { SafePath, directorySize } from "./fs-safe.js";
import type { ResourceUsage, ServerSpec } from "./types.js";
import { HttpError } from "./errors.js";

const log = createLogger("servers");

export interface ServerEvents {
  console: (uuid: string, line: string) => void;
  status: (uuid: string, state: string) => void;
  stats: (uuid: string, usage: ResourceUsage) => void;
  install: (uuid: string, line: string) => void;
  installed: (uuid: string, successful: boolean, note: string, reinstall: boolean) => void;
}

interface RuntimeState {
  spec: ServerSpec;
  state: string;
  stream?: Duplex;
  ringBuffer: string[];
  diskBytes: number;
  installing: boolean;
  lastDiskCheck: number;
}

const RING_SIZE = 500;

/**
 * Owns every server on this node: on-disk metadata, container lifecycle,
 * console multiplexing, resource sampling and disk quota enforcement.
 */
export class ServerManager extends EventEmitter {
  private readonly servers = new Map<string, RuntimeState>();
  private statsTimer?: NodeJS.Timeout;

  constructor(
    private readonly config: DaemonConfig,
    private readonly docker: DockerManager,
  ) {
    super();
    this.setMaxListeners(0);
  }

  // -- paths ---------------------------------------------------------------

  volumePath(uuid: string): string {
    return path.join(this.config.system.data, uuid);
  }

  private metaPath(uuid: string): string {
    return path.join(this.config.system.data, ".meta", `${uuid}.json`);
  }

  safePath(uuid: string): SafePath {
    return new SafePath(this.volumePath(uuid));
  }

  // -- persistence ---------------------------------------------------------

  async boot(): Promise<void> {
    await fsp.mkdir(path.join(this.config.system.data, ".meta"), { recursive: true });

    let entries: string[] = [];
    try {
      entries = await fsp.readdir(path.join(this.config.system.data, ".meta"));
    } catch {
      entries = [];
    }

    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      try {
        const raw = await fsp.readFile(path.join(this.config.system.data, ".meta", entry), "utf8");
        const spec = JSON.parse(raw) as ServerSpec;
        this.servers.set(spec.uuid, {
          spec,
          state: "offline",
          ringBuffer: [],
          diskBytes: 0,
          installing: false,
          lastDiskCheck: 0,
        });
      } catch (error) {
        log.warn(`Unable to load metadata ${entry}`, error);
      }
    }

    // Reconcile with docker so restarts of the daemon do not lose running state.
    for (const [uuid, runtime] of this.servers) {
      runtime.state = await this.docker.state(uuid);
      if (runtime.state === "running") void this.attachConsole(uuid);
    }

    log.info(`Loaded ${this.servers.size} server(s) from disk`);
    this.startStatsLoop();
  }

  private async persist(spec: ServerSpec): Promise<void> {
    await fsp.mkdir(path.dirname(this.metaPath(spec.uuid)), { recursive: true });
    await fsp.writeFile(this.metaPath(spec.uuid), JSON.stringify(spec, null, 2), "utf8");
  }

  list(): ServerSpec[] {
    return [...this.servers.values()].map((runtime) => runtime.spec);
  }

  count(): number {
    return this.servers.size;
  }

  /** Number of servers currently in the running state (used by heartbeats). */
  runningCount(): number {
    let running = 0;
    for (const runtime of this.servers.values()) if (runtime.state === "running") running += 1;
    return running;
  }

  /** Current state of every known server, for reconciliation with the panel. */
  states(): { uuid: string; state: string }[] {
    return [...this.servers.entries()].map(([uuid, runtime]) => ({
      uuid,
      state: runtime.installing ? "installing" : runtime.state,
    }));
  }

  get(uuid: string): RuntimeState | undefined {
    return this.servers.get(uuid);
  }

  require(uuid: string): RuntimeState {
    const runtime = this.servers.get(uuid);
    if (!runtime) throw new HttpError(`Server ${uuid} is not registered on this node.`, 404);
    return runtime;
  }

  // -- console -------------------------------------------------------------

  private pushConsole(uuid: string, line: string): void {
    const runtime = this.servers.get(uuid);
    if (!runtime) return;
    runtime.ringBuffer.push(line);
    if (runtime.ringBuffer.length > RING_SIZE) runtime.ringBuffer.shift();
    this.emit("console", uuid, line);
  }

  history(uuid: string): string[] {
    return this.servers.get(uuid)?.ringBuffer ?? [];
  }

  private setState(uuid: string, state: string): void {
    const runtime = this.servers.get(uuid);
    if (!runtime || runtime.state === state) return;
    runtime.state = state;
    this.emit("status", uuid, state);
  }

  /** Attaches to the container's stdio and fans output out to websocket clients. */
  private async attachConsole(uuid: string): Promise<void> {
    const runtime = this.servers.get(uuid);
    if (!runtime || runtime.stream) return;

    try {
      const stream = await this.docker.attach(uuid);
      runtime.stream = stream;

      let buffer = "";
      stream.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) this.pushConsole(uuid, line.replace(/\r$/, ""));
      });
      stream.on("end", () => {
        if (buffer.trim()) this.pushConsole(uuid, buffer.trim());
        runtime.stream = undefined;
        void this.refreshState(uuid);
      });
      stream.on("error", (error: Error) => {
        log.debug(`Console stream error for ${uuid}: ${error.message}`);
        runtime.stream = undefined;
      });
    } catch (error) {
      log.debug(`Unable to attach console for ${uuid}`, error);
    }
  }

  async sendCommand(uuid: string, command: string): Promise<void> {
    const runtime = this.require(uuid);
    if (runtime.state !== "running") throw new HttpError("The server is not running.", 409);
    if (!runtime.stream) await this.attachConsole(uuid);
    if (!runtime.stream) throw new HttpError("Console is not attached.", 409);
    runtime.stream.write(`${command}\n`);
  }

  // -- lifecycle -----------------------------------------------------------

  async create(spec: ServerSpec, startOnCompletion: boolean): Promise<void> {
    const volume = this.volumePath(spec.uuid);
    await fsp.mkdir(volume, { recursive: true });
    await this.persist(spec);

    this.servers.set(spec.uuid, {
      spec,
      state: "installing",
      ringBuffer: [],
      diskBytes: 0,
      installing: true,
      lastDiskCheck: 0,
    });
    this.setState(spec.uuid, "installing");

    // Install and container creation run detached so the panel request returns fast.
    void this.runInstallAndBoot(spec, startOnCompletion);
  }

  private async runInstallAndBoot(spec: ServerSpec, start: boolean, reinstall = false): Promise<void> {
    const emitInstall = (line: string) => {
      this.emit("install", spec.uuid, line);
      this.pushConsole(spec.uuid, `\x1b[38;5;110m[install]\x1b[0m ${line}`);
    };
    const finish = (successful: boolean, note: string) => {
      const runtime = this.servers.get(spec.uuid);
      if (runtime) runtime.installing = false;
      this.setState(spec.uuid, "offline");
      this.emit("installed", spec.uuid, successful, note, reinstall);
    };

    try {
      emitInstall(`Preparing ${spec.name} (${spec.egg.uuid})`);

      if (spec.egg.scriptInstall.trim().length > 0) {
        const scriptDir = await this.createInstallScratch(spec.uuid);
        await fsp.writeFile(path.join(scriptDir, "install.sh"), spec.egg.scriptInstall, { mode: 0o755 });

        const code = await this.docker.runInstall(spec, this.volumePath(spec.uuid), scriptDir, emitInstall);
        await fsp.rm(scriptDir, { recursive: true, force: true }).catch(() => undefined);

        if (code !== 0) {
          emitInstall(`Install script exited with code ${code}.`);
          finish(false, `Install script exited with code ${code}.`);
          return;
        }
      }

      // Minecraft eggs need an accepted EULA to boot at all.
      if (spec.egg.features.includes("eula")) {
        const eula = path.join(this.volumePath(spec.uuid), "eula.txt");
        if (!fs.existsSync(eula)) await fsp.writeFile(eula, "eula=true\n", "utf8");
      }

      await this.docker.pullImage(spec.image, emitInstall).catch((error) => {
        emitInstall(`Image pull warning: ${error instanceof Error ? error.message : error}`);
      });
      await this.docker.removeContainer(spec.uuid);
      await this.docker.createContainer(spec, this.volumePath(spec.uuid));

      emitInstall("Installation complete.");
      finish(true, "Installation complete.");

      if (start) await this.power(spec.uuid, "start");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitInstall(`Installation failed: ${message}`);
      finish(false, message);
    }
  }

  /**
   * Creates a private, writable scratch directory for an egg's install script.
   *
   * Prefers the configured tmp directory (usually /tmp/spanel), but falls back
   * to a directory under the daemon's own data dir when that base isn't
   * writable — which happens when the installer created /tmp/spanel as root and
   * never chowned it to the spanel service user (the cause of
   * "EACCES: permission denied, mkdir '/tmp/spanel/install-…'"). The data dir is
   * always owned by the daemon user, so this self-heals without a reinstall.
   */
  private async createInstallScratch(uuid: string): Promise<string> {
    const bases = [this.config.system.tmpDirectory, path.join(this.config.system.data, ".tmp")];
    let lastError: unknown;
    for (const base of bases) {
      try {
        await fsp.mkdir(base, { recursive: true });
        const dir = path.join(base, `install-${uuid}`);
        await fsp.mkdir(dir, { recursive: true });
        // A recursive mkdir on a pre-existing, wrong-owner dir doesn't throw, so
        // confirm we can actually write before committing to this location.
        await fsp.access(dir, fs.constants.W_OK);
        return dir;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(
      `No writable install scratch directory. Run \`chown -R spanel:spanel ${this.config.system.tmpDirectory}\` on the node, or reinstall the daemon. (${
        lastError instanceof Error ? lastError.message : String(lastError)
      })`,
    );
  }

  /** Applies a new spec: rewrites metadata and recreates the container if needed. */
  async sync(spec: ServerSpec): Promise<void> {
    const existing = this.servers.get(spec.uuid);
    await this.persist(spec);

    if (!existing) {
      this.servers.set(spec.uuid, {
        spec,
        state: await this.docker.state(spec.uuid),
        ringBuffer: [],
        diskBytes: 0,
        installing: false,
        lastDiskCheck: 0,
      });
      return;
    }

    const previous = existing.spec;
    existing.spec = spec;

    const needsRebuild =
      JSON.stringify(previous.limits) !== JSON.stringify(spec.limits) ||
      JSON.stringify(previous.allocations) !== JSON.stringify(spec.allocations) ||
      previous.image !== spec.image ||
      previous.invocation !== spec.invocation ||
      JSON.stringify(previous.environment) !== JSON.stringify(spec.environment);

    if (spec.suspended) {
      if (existing.state === "running") await this.power(spec.uuid, "kill");
      this.setState(spec.uuid, "offline");
      return;
    }

    if (!needsRebuild) return;

    const wasRunning = existing.state === "running";
    this.pushConsole(spec.uuid, "\x1b[38;5;178m[daemon]\x1b[0m Applying new configuration…");

    if (wasRunning) await this.power(spec.uuid, "stop").catch(() => undefined);
    await this.waitForState(spec.uuid, "offline", 30_000).catch(() => undefined);

    await this.docker.removeContainer(spec.uuid);
    if (previous.image !== spec.image) {
      await this.docker.pullImage(spec.image, (line) => this.pushConsole(spec.uuid, `[image] ${line}`)).catch(() => undefined);
    }
    await this.docker.createContainer(spec, this.volumePath(spec.uuid));
    this.pushConsole(spec.uuid, "\x1b[38;5;178m[daemon]\x1b[0m Configuration applied.");

    if (wasRunning) await this.power(spec.uuid, "start");
  }

  async destroy(uuid: string): Promise<void> {
    const runtime = this.servers.get(uuid);
    if (runtime?.stream) runtime.stream.destroy();

    await this.docker.removeContainer(uuid).catch(() => undefined);
    await fsp.rm(this.volumePath(uuid), { recursive: true, force: true }).catch(() => undefined);
    await fsp.rm(this.metaPath(uuid), { force: true }).catch(() => undefined);

    this.servers.delete(uuid);
    log.info(`Destroyed server ${uuid}`);
  }

  async reinstall(uuid: string): Promise<void> {
    const runtime = this.require(uuid);
    if (runtime.state === "running") await this.power(uuid, "stop").catch(() => undefined);
    runtime.installing = true;
    this.setState(uuid, "installing");
    void this.runInstallAndBoot(runtime.spec, false, true);
  }

  async power(uuid: string, action: string): Promise<void> {
    const runtime = this.require(uuid);
    if (runtime.spec.suspended && action !== "kill" && action !== "stop") {
      throw new HttpError("This server is suspended.", 409);
    }
    if (runtime.installing) throw new HttpError("The server is still installing.", 409);

    const container = this.docker.container(uuid);

    switch (action) {
      case "start": {
        if (runtime.state === "running") return;
        if (!(await this.docker.exists(uuid))) {
          await this.docker.createContainer(runtime.spec, this.volumePath(uuid));
        }
        await this.enforceDiskQuota(uuid, true);
        this.setState(uuid, "starting");
        this.pushConsole(uuid, "\x1b[38;5;178m[daemon]\x1b[0m Starting container\u2026");
        try {
          await container.start();
        } catch (error) {
          this.setState(uuid, "offline");
          this.pushConsole(uuid, "\x1b[38;5;203m[daemon]\x1b[0m Failed to start container.");
          throw error;
        }
        await this.attachConsole(uuid);
        this.setState(uuid, "running");
        break;
      }
      case "stop": {
        if (runtime.state === "offline") return;
        this.setState(uuid, "stopping");
        const signal = runtime.spec.stopSignal || "^C";
        if (signal.startsWith("^")) {
          // Graceful in-console stop (e.g. ^C) then wait for exit.
          await container.stop({ t: 30 }).catch(() => undefined);
        } else if (signal.toUpperCase().startsWith("SIG")) {
          await container.kill({ signal: signal.toUpperCase() }).catch(() => undefined);
        } else {
          await this.sendCommand(uuid, signal).catch(() => undefined);
          await container.stop({ t: 30 }).catch(() => undefined);
        }
        // Verify the container actually stopped; fall back to kill if needed.
        const postStopState = await this.docker.state(uuid);
        if (postStopState === "running") {
          await container.kill().catch(() => undefined);
        }
        this.setState(uuid, "offline");
        break;
      }
      case "restart": {
        await this.power(uuid, "stop").catch(() => undefined);
        await this.power(uuid, "start");
        break;
      }
      case "kill": {
        await container.kill().catch(() => undefined);
        this.setState(uuid, "offline");
        this.pushConsole(uuid, "\x1b[38;5;203m[daemon]\x1b[0m Container killed.");
        break;
      }
      default:
        throw new HttpError(`Unknown power action: ${action}`, 422);
    }
  }

  private async refreshState(uuid: string): Promise<void> {
    this.setState(uuid, await this.docker.state(uuid));
  }

  private async waitForState(uuid: string, state: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((await this.docker.state(uuid)) === state) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for ${uuid} to become ${state}.`);
  }

  // -- resources -----------------------------------------------------------

  async usage(uuid: string): Promise<ResourceUsage> {
    const runtime = this.require(uuid);
    const disk = await this.diskUsage(uuid);
    const usage = await this.docker.stats(uuid, disk, { memory: runtime.spec.limits.memory });
    return { ...usage, state: runtime.installing ? "installing" : usage.state, isSuspended: runtime.spec.suspended };
  }

  private async diskUsage(uuid: string): Promise<number> {
    const runtime = this.require(uuid);
    // Disk walks are expensive; sample at most every 30 seconds.
    if (Date.now() - runtime.lastDiskCheck < 30_000) return runtime.diskBytes;
    runtime.diskBytes = await directorySize(this.volumePath(uuid));
    runtime.lastDiskCheck = Date.now();
    return runtime.diskBytes;
  }

  /** Blocks boot (or stops the server) when it exceeds its disk allowance. */
  private async enforceDiskQuota(uuid: string, blocking: boolean): Promise<boolean> {
    const runtime = this.require(uuid);
    const limitBytes = runtime.spec.limits.disk * 1024 * 1024;
    if (limitBytes <= 0) return true;

    const used = await directorySize(this.volumePath(uuid));
    runtime.diskBytes = used;
    runtime.lastDiskCheck = Date.now();

    if (used <= limitBytes) return true;

    const message = `Disk limit exceeded: ${(used / 1048576).toFixed(0)} MiB used of ${runtime.spec.limits.disk} MiB.`;
    this.pushConsole(uuid, `\x1b[38;5;203m[daemon]\x1b[0m ${message}`);
    if (blocking) throw new HttpError(message, 507);
    return false;
  }

  private startStatsLoop(): void {
    if (this.statsTimer) return;
    this.statsTimer = setInterval(() => {
      void (async () => {
        for (const [uuid, runtime] of this.servers) {
          if (runtime.state !== "running") continue;
          try {
            const usage = await this.usage(uuid);
            this.emit("stats", uuid, usage);

            const limitBytes = runtime.spec.limits.disk * 1024 * 1024;
            if (limitBytes > 0 && usage.diskBytes > limitBytes * 1.05) {
              this.pushConsole(
                uuid,
                "\x1b[38;5;203m[daemon]\x1b[0m Disk limit exceeded — stopping the server.",
              );
              await this.power(uuid, "stop").catch(() => undefined);
            }
          } catch (error) {
            log.debug(`Stats sampling failed for ${uuid}`, error);
          }
        }
      })();
    }, 4000);
  }

  async shutdown(): Promise<void> {
    if (this.statsTimer) clearInterval(this.statsTimer);
    for (const runtime of this.servers.values()) runtime.stream?.destroy();
  }
}

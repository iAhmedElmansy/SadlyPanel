#!/usr/bin/env node
/**
 * SPanel daemon CLI — `spanel-daemon <command>`
 *
 * Everything an operator needs on a node without touching a shell script:
 *
 *   spanel-daemon install    --panel <url> --token-id <id> --token <token>
 *   spanel-daemon configure  --panel <url> --token-id <id> --token <token>
 *   spanel-daemon start      [--config /etc/spanel/config.yml]
 *   spanel-daemon service    <install|start|stop|restart|status|logs>
 *   spanel-daemon doctor
 *   spanel-daemon version
 *
 * `install` performs the privileged system preparation (packages, Docker, the
 * spanel user, directories, systemd unit). `configure` only writes
 * /etc/spanel/config.yml — it can fetch the file straight from the panel so the
 * token pair is the only thing that has to be copied.
 *
 * Only Node built-ins are used so this runs before `npm install`.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "./version.js";

const CONFIG_PATH = "/etc/spanel/config.yml";
const VHOSTS_DIR = "/etc/spanel/vhosts";
const LOG_DIR = "/var/log/spanel";
const DEFAULT_DATA_DIR = "/var/lib/spanel/volumes";
const SERVICE_NAME = "spanel-daemon";
const SERVICE_PATH = `/etc/systemd/system/${SERVICE_NAME}.service`;

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[38;5;244m",
  blue: "\x1b[38;5;39m",
  green: "\x1b[38;5;41m",
  amber: "\x1b[38;5;214m",
  red: "\x1b[38;5;203m",
};

const say = (message: string) => process.stdout.write(`${C.blue}[spanel]${C.reset} ${message}\n`);
const ok = (message: string) => process.stdout.write(`${C.green}  ok${C.reset}   ${message}\n`);
const warn = (message: string) => process.stderr.write(`${C.amber}  warn${C.reset} ${message}\n`);
const bad = (message: string) => process.stderr.write(`${C.red}  fail${C.reset} ${message}\n`);
const note = (message: string) => process.stdout.write(`${C.dim}       ${message}${C.reset}\n`);

function die(message: string): never {
  bad(message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// argv
// ---------------------------------------------------------------------------

export interface ParsedArgs {
  command: string;
  sub?: string;
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }

  return { command: positional[0] ?? "help", sub: positional[1], flags };
}

function flagString(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// shell helpers
// ---------------------------------------------------------------------------

function has(command: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${command} >/dev/null 2>&1`]).status === 0;
}

function run(command: string, args: string[], options: { allowFailure?: boolean; quiet?: boolean } = {}): boolean {
  const result = spawnSync(command, args, { stdio: options.quiet ? "ignore" : "inherit" });
  if (result.status === 0) return true;
  const label = `${command} ${args.join(" ")}`;
  if (options.allowFailure) {
    warn(`${label} exited with ${result.status ?? "signal"}`);
    return false;
  }
  die(`${label} failed with status ${result.status ?? "signal"}.`);
}

function capture(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function shell(script: string, options: { allowFailure?: boolean } = {}): boolean {
  return run("sh", ["-c", script], options);
}

function requireRoot(action: string): void {
  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    die(`${action} needs root privileges. Re-run with sudo.`);
  }
}

function requireLinux(action: string): void {
  if (process.platform !== "linux") {
    die(`${action} is only supported on Linux nodes (detected ${process.platform}).`);
  }
}

// ---------------------------------------------------------------------------
// config helpers
// ---------------------------------------------------------------------------

interface ConfigSummary {
  remote: string;
  tokenId: string;
  token: string;
  port: number;
  data: string;
}

/** Minimal reader for the flat keys the CLI needs; avoids a YAML dependency. */
export function readConfigSummary(text: string): ConfigSummary {
  const value = (key: string): string => {
    const match = text.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, "m"));
    return match?.[1]?.replace(/^["']|["']$/g, "") ?? "";
  };
  return {
    remote: value("remote"),
    tokenId: value("token_id"),
    token: value("token"),
    port: Number(value("port")) || 8080,
    data: value("data") || DEFAULT_DATA_DIR,
  };
}

function loadConfigSummary(configPath = CONFIG_PATH): ConfigSummary | null {
  if (!fs.existsSync(configPath)) return null;
  return readConfigSummary(fs.readFileSync(configPath, "utf8"));
}

function writeConfigFile(configPath: string, contents: string): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, contents.endsWith("\n") ? contents : `${contents}\n`, { mode: 0o640 });
  // The daemon runs as `spanel`, so the group needs read access to the token.
  shell(`chgrp spanel ${configPath} 2>/dev/null || true`, { allowFailure: true });
  shell(`chmod 640 ${configPath}`, { allowFailure: true });
}

/** Pulls config.yml from the panel using the node credentials. */
async function fetchConfigFromPanel(panel: string, tokenId: string, token: string): Promise<string> {
  const base = panel.replace(/\/+$/, "");
  const signature = createHmac("sha256", token).update("").digest("hex");
  const response = await fetch(`${base}/api/remote/nodes/config`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${tokenId}.${token}`,
      "X-Spanel-Signature": signature,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Panel responded ${response.status}. ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { config?: string; node?: { name?: string } };
  if (!payload.config) throw new Error("The panel did not return a configuration.");
  if (payload.node?.name) ok(`Fetched configuration for node "${payload.node.name}".`);
  return payload.config;
}

/** Local fallback used when the panel cannot be reached during install. */
export function renderLocalConfig(input: {
  panel: string;
  tokenId: string;
  token: string;
  port: number;
  data: string;
}): string {
  return `# Written by spanel-daemon configure (offline fallback).
debug: false

api:
  host: 0.0.0.0
  port: ${input.port}
  ssl:
    enabled: false
    cert: ""
    key: ""
  upload_limit: 256

system:
  data: ${input.data}
  archive_directory: ${input.data}/.archives
  backup_directory: ${input.data}/.backups
  tmp_directory: /tmp/spanel
  username: spanel
  timezone: UTC
  sftp:
    bind_port: 2022

docker:
  network:
    name: spanel0
    driver: bridge
    interface: 172.19.0.1
    dns:
      - 1.1.1.1
      - 8.8.8.8
  install_limit: 5

proxy:
  enabled: true
  http_port: 80
  https_port: 443
  acme_email: ""
  config_directory: ${VHOSTS_DIR}
  reload_command: nginx -s reload

remote: ${input.panel.replace(/\/+$/, "")}
token_id: ${input.tokenId}
token: ${input.token}
`;
}

// ---------------------------------------------------------------------------
// install steps
// ---------------------------------------------------------------------------

function packageManager(): "apt" | "dnf" | null {
  if (has("apt-get")) return "apt";
  if (has("dnf")) return "dnf";
  return null;
}

function installBasePackages(): void {
  const manager = packageManager();
  if (!manager) {
    warn("Neither apt-get nor dnf was found; install curl, git, tar, nginx and certbot manually.");
    return;
  }

  say("Installing base packages…");
  if (manager === "apt") {
    shell("DEBIAN_FRONTEND=noninteractive apt-get update -y", { allowFailure: true });
    shell(
      "DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates gnupg git tar unzip nginx certbot python3-certbot-nginx",
      { allowFailure: true },
    );
  } else {
    shell("dnf install -y curl ca-certificates gnupg2 git tar unzip nginx certbot python3-certbot-nginx", {
      allowFailure: true,
    });
  }
  ok("Base packages present.");
}

function installDocker(): void {
  if (has("docker")) {
    ok(`Docker already installed (${capture("docker", ["--version"]) || "unknown version"}).`);
  } else {
    say("Installing Docker…");
    shell("curl -fsSL https://get.docker.com | sh");
  }
  shell("systemctl enable --now docker", { allowFailure: true });

  if (!fs.existsSync("/var/run/docker.sock")) {
    warn("/var/run/docker.sock is missing — the daemon cannot manage containers until Docker is running.");
  }
}

function ensureNodeRuntime(): void {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) {
    ok(`Node.js ${process.versions.node} is current enough.`);
    return;
  }

  const manager = packageManager();
  say(`Node.js ${process.versions.node} is too old; installing Node.js 22…`);
  if (manager === "apt") {
    shell("curl -fsSL https://deb.nodesource.com/setup_22.x | bash -", { allowFailure: true });
    shell("apt-get install -y nodejs", { allowFailure: true });
  } else if (manager === "dnf") {
    shell("curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -", { allowFailure: true });
    shell("dnf install -y nodejs", { allowFailure: true });
  } else {
    warn("Install Node.js 20 or newer manually, then re-run this command.");
  }
}

function ensureUserAndDirectories(dataDir: string): void {
  if (capture("id", ["-u", "spanel"]) === "") {
    say("Creating the spanel system user…");
    shell("useradd --system --shell /usr/sbin/nologin --home-dir /var/lib/spanel spanel", { allowFailure: true });
  }
  shell("usermod -aG docker spanel", { allowFailure: true });

  for (const dir of [dataDir, `${dataDir}/.archives`, `${dataDir}/.backups`, VHOSTS_DIR, LOG_DIR, "/tmp/spanel"]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // /tmp/spanel is the egg install-script scratch root and MUST be owned by the
  // service user, or installs fail with EACCES when the daemon (User=spanel)
  // tries to create install-<uuid> subdirectories inside a root-owned dir.
  shell(`chown -R spanel:spanel ${dataDir} ${LOG_DIR} /tmp/spanel`, { allowFailure: true });
  shell("chmod 750 /etc/spanel", { allowFailure: true });
  ok(`Data directory ready at ${dataDir}.`);
}

function wireNginx(): void {
  if (!fs.existsSync("/etc/nginx/conf.d")) return;
  const include = "/etc/nginx/conf.d/spanel.conf";
  if (!fs.existsSync(include)) {
    say("Wiring the SPanel vhost directory into nginx…");
    fs.writeFileSync(include, `include ${VHOSTS_DIR}/*.conf;\n`, "utf8");
  }
  if (run("nginx", ["-t"], { allowFailure: true, quiet: true })) {
    shell("systemctl reload nginx", { allowFailure: true });
    ok("nginx reloaded.");
  } else {
    warn("nginx -t failed; check the configuration before relying on custom domains.");
  }
}

/** Absolute path of the installed daemon entrypoint (dist/index.js). */
function daemonEntrypoint(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "index.js");
}

/**
 * Links this CLI onto the PATH as `spanel-daemon`, so an operator can run
 * `sudo spanel-daemon configure|doctor|service …` from anywhere instead of
 * remembering the /opt path. Best-effort and idempotent (`ln -sf`).
 */
function linkGlobalCli(): void {
  const cliPath = fileURLToPath(import.meta.url);
  const target = "/usr/local/bin/spanel-daemon";
  try {
    fs.chmodSync(cliPath, 0o755);
  } catch {
    // Non-fatal: the symlink still resolves through the node shebang.
  }
  if (shell(`ln -sf ${cliPath} ${target}`, { allowFailure: true })) {
    ok(`Linked the global command at ${target}.`);
  }
}

function installService(entrypoint: string, configPath: string): void {
  if (!has("systemctl")) {
    warn("systemd was not detected; run the daemon with your own supervisor:");
    note(`node ${entrypoint} --config ${configPath}`);
    return;
  }

  say("Installing the systemd unit…");
  const unit = `[Unit]
Description=SPanel Daemon
Documentation=https://spanel.sadlystudios.bond
After=network-online.target docker.service
Requires=docker.service

[Service]
User=spanel
Group=spanel
WorkingDirectory=${path.dirname(path.dirname(entrypoint))}
ExecStart=${process.execPath} ${entrypoint} --config ${configPath}
Restart=on-failure
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/daemon.log
StandardError=append:${LOG_DIR}/daemon.log

[Install]
WantedBy=multi-user.target
`;
  fs.writeFileSync(SERVICE_PATH, unit, "utf8");
  shell("systemctl daemon-reload", { allowFailure: true });
  shell(`systemctl enable ${SERVICE_NAME}`, { allowFailure: true });
  ok(`Service installed (${SERVICE_PATH}).`);
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

async function commandConfigure(flags: Record<string, string | boolean>): Promise<void> {
  const configPath = flagString(flags, "config") ?? CONFIG_PATH;
  const panel = flagString(flags, "panel") ?? flagString(flags, "url");
  const tokenId = flagString(flags, "token-id");
  const token = flagString(flags, "token");

  if (!panel || !tokenId || !token) {
    const missing = [
      !panel ? "--panel" : null,
      !tokenId ? "--token-id" : null,
      !token ? "--token" : null,
    ].filter(Boolean).join(", ");
    die(
      `configure is missing ${missing}. Copy the ready-made command from the panel: ` +
        "Admin → Nodes → open this node → the Install section shows it with every value filled in.",
    );
  }

  requireRoot("Writing the daemon configuration");

  let contents: string;
  try {
    contents = await fetchConfigFromPanel(panel, tokenId, token);
  } catch (error) {
    warn(`Could not fetch the configuration from the panel: ${error instanceof Error ? error.message : error}`);
    note("Falling back to a locally generated configuration; edit it if the node uses non-default paths.");
    contents = renderLocalConfig({
      panel,
      tokenId,
      token,
      port: Number(flagString(flags, "port") ?? 8080),
      data: flagString(flags, "data") ?? DEFAULT_DATA_DIR,
    });
  }

  writeConfigFile(configPath, contents);
  ok(`Configuration written to ${configPath}.`);

  const summary = readConfigSummary(contents);
  fs.mkdirSync(summary.data, { recursive: true });
  shell(`chown -R spanel:spanel ${summary.data} 2>/dev/null || true`, { allowFailure: true });

  // The install page's configure-only command keys off this exact phrase in the
  // daemon's console output to confirm success — keep the wording stable.
  ok("Daemon configuration set successfully.");
}

async function commandInstall(flags: Record<string, string | boolean>): Promise<void> {
  requireLinux("Installing the daemon");
  requireRoot("Installing the daemon");

  const panel = flagString(flags, "panel") ?? flagString(flags, "url");
  const tokenId = flagString(flags, "token-id");
  const token = flagString(flags, "token");
  const dataDir = flagString(flags, "data") ?? DEFAULT_DATA_DIR;
  const configPath = flagString(flags, "config") ?? CONFIG_PATH;

  say("SPanel daemon installation");

  if (flags["skip-packages"] !== true) installBasePackages();
  if (flags["skip-docker"] !== true) installDocker();
  ensureNodeRuntime();
  ensureUserAndDirectories(dataDir);
  wireNginx();

  if (panel && tokenId && token) {
    await commandConfigure({ panel, tokenId, token, "token-id": tokenId, config: configPath, data: dataDir, ...flags });
  } else if (fs.existsSync(configPath)) {
    ok(`Keeping the existing configuration at ${configPath}.`);
  } else {
    warn("No --panel/--token-id/--token given and no existing config.");
    note("Copy the ready-made install command from Admin → Nodes → this node → Install, then re-run it here.");
  }

  const entrypoint = daemonEntrypoint();
  if (!fs.existsSync(entrypoint)) {
    warn(`${entrypoint} is missing — build the daemon (npm install && npm run build) before starting the service.`);
  }
  installService(entrypoint, configPath);
  linkGlobalCli();

  if (fs.existsSync(entrypoint) && fs.existsSync(configPath) && has("systemctl")) {
    shell(`systemctl restart ${SERVICE_NAME}`, { allowFailure: true });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (spawnSync("systemctl", ["is-active", "--quiet", SERVICE_NAME]).status === 0) {
      ok("Daemon is running.");
      note("Verify from the panel: Admin → Nodes → Test connection.");
    } else {
      warn(`The daemon did not start. Inspect: journalctl -u ${SERVICE_NAME} -n 80 --no-pager`);
    }
  }

  const summary = loadConfigSummary(configPath);
  say("Installation complete.");
  note(`Open TCP ${summary?.port ?? 8080} plus your game/web ports in the firewall.`);
}

function commandService(sub: string | undefined): void {
  if (!has("systemctl")) die("systemd is not available on this host.");
  const action = sub ?? "status";

  switch (action) {
    case "install":
      requireRoot("Installing the service");
      installService(daemonEntrypoint(), CONFIG_PATH);
      return;
    case "start":
    case "stop":
    case "restart":
      requireRoot(`Running systemctl ${action}`);
      run("systemctl", [action, SERVICE_NAME]);
      ok(`systemctl ${action} ${SERVICE_NAME} done.`);
      return;
    case "status":
      run("systemctl", ["status", SERVICE_NAME, "--no-pager"], { allowFailure: true });
      return;
    case "logs":
      run("journalctl", ["-u", SERVICE_NAME, "-n", "120", "--no-pager"], { allowFailure: true });
      return;
    default:
      die(`Unknown service action: ${action}. Use install, start, stop, restart, status or logs.`);
  }
}

async function commandDoctor(flags: Record<string, string | boolean>): Promise<void> {
  const configPath = flagString(flags, "config") ?? CONFIG_PATH;
  let problems = 0;
  const fail = (message: string) => {
    problems += 1;
    bad(message);
  };

  say("SPanel daemon diagnostics");

  const major = Number(process.versions.node.split(".")[0]);
  major >= 20 ? ok(`Node.js ${process.versions.node}`) : fail(`Node.js ${process.versions.node} is below the required v20.`);

  has("docker") ? ok(`Docker CLI present (${capture("docker", ["--version"])})`) : fail("Docker CLI not found.");
  fs.existsSync("/var/run/docker.sock")
    ? ok("Docker socket present at /var/run/docker.sock")
    : fail("Docker socket missing at /var/run/docker.sock.");

  const summary = loadConfigSummary(configPath);
  if (!summary) {
    fail(`No configuration at ${configPath}. Run: spanel-daemon configure --panel … --token-id … --token …`);
  } else {
    ok(`Config found at ${configPath} (api port ${summary.port})`);
    summary.tokenId && summary.token ? ok("Node credentials present.") : fail("token_id/token are missing from the config.");
    fs.existsSync(summary.data) ? ok(`Data directory ${summary.data}`) : fail(`Data directory ${summary.data} does not exist.`);

    if (!summary.remote) {
      fail("`remote` is empty; the panel will never receive heartbeats.");
    } else {
      try {
        const signature = createHmac("sha256", summary.token).update("").digest("hex");
        const response = await fetch(`${summary.remote.replace(/\/+$/, "")}/api/remote/nodes/config`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${summary.tokenId}.${summary.token}`,
            "X-Spanel-Signature": signature,
          },
          signal: AbortSignal.timeout(10_000),
        });
        response.ok
          ? ok(`Panel reachable and credentials accepted (${summary.remote}).`)
          : fail(`Panel rejected the node credentials (HTTP ${response.status}).`);
      } catch (error) {
        fail(`Panel unreachable at ${summary.remote}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  const entrypoint = daemonEntrypoint();
  fs.existsSync(entrypoint) ? ok(`Daemon build present (${entrypoint})`) : fail(`${entrypoint} is missing; run npm run build.`);

  if (has("systemctl")) {
    spawnSync("systemctl", ["is-active", "--quiet", SERVICE_NAME]).status === 0
      ? ok(`${SERVICE_NAME} is active.`)
      : warn(`${SERVICE_NAME} is not running.`);
  }

  process.stdout.write("\n");
  if (problems === 0) {
    say("No problems detected.");
  } else {
    say(`${problems} problem(s) found.`);
    process.exitCode = 1;
  }
}

function commandStart(flags: Record<string, string | boolean>): void {
  const configPath = flagString(flags, "config") ?? CONFIG_PATH;
  const entrypoint = daemonEntrypoint();
  if (!fs.existsSync(entrypoint)) die(`${entrypoint} is missing. Build the daemon first: npm run build`);

  say(`Starting the daemon in the foreground (config: ${configPath})`);
  const child = spawn(process.execPath, [entrypoint, "--config", configPath], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => child.kill(signal));
  }
}

// ---------------------------------------------------------------------------
// update — fast-forward this node's checkout and rebuild ONLY when the daemon
// actually changed, then restart the service. Fast-forward only: it never runs
// `git reset --hard` over local commits or uncommitted edits.
// ---------------------------------------------------------------------------

/** Git work-tree root that contains this daemon build (walks up from dist/). */
function daemonRepoDir(pkgDir: string): string {
  const top = capture("git", ["-C", pkgDir, "rev-parse", "--show-toplevel"]);
  return top || pkgDir;
}

function commandUpdate(_flags: Record<string, string | boolean>): void {
  requireLinux("Updating the daemon");
  requireRoot("Updating the daemon");

  // dist/cli.js → <package> (parent of dist); the git root may be the monorepo
  // above it (apps/daemon lives inside the checkout).
  const pkgDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const repoDir = daemonRepoDir(pkgDir);

  if (!fs.existsSync(path.join(repoDir, ".git"))) {
    die(
      `No git checkout found at ${repoDir}. Self-update needs the daemon installed from a git ` +
        "clone. Re-run the panel install command to refresh it instead.",
    );
  }

  const gitCap = (args: string[]): string => capture("git", ["-C", repoDir, ...args]);
  const gitQuiet = (args: string[]): boolean =>
    spawnSync("git", ["-C", repoDir, ...args], { stdio: "ignore" }).status === 0;

  const branch = gitCap(["rev-parse", "--abbrev-ref", "HEAD"]) || "main";
  const shallow = gitCap(["rev-parse", "--is-shallow-repository"]) === "true";

  say(`Checking for updates in ${repoDir} (branch ${branch})…`);

  // A depth-1 clone (how the installer clones) can neither fast-forward nor diff
  // across commits, so deepen it to full history before the first update.
  const fetched = shallow
    ? gitQuiet(["fetch", "--unshallow", "origin", branch]) || gitQuiet(["fetch", "origin", branch])
    : gitQuiet(["fetch", "origin", branch]);
  if (!fetched) die("git fetch failed. Check the node's network and DNS, then retry.");

  const oldRev = gitCap(["rev-parse", "HEAD"]);

  // Fast-forward only — refuses to run over local commits or uncommitted edits
  // to tracked files, so local work is never destroyed (no reset --hard).
  if (!gitQuiet(["merge", "--ff-only", "FETCH_HEAD"])) {
    die(
      `Cannot fast-forward ${repoDir} to origin/${branch}. This usually means local commits or ` +
        `uncommitted changes to tracked files. Inspect: git -C ${repoDir} status. Nothing was changed.`,
    );
  }

  const newRev = gitCap(["rev-parse", "HEAD"]);
  const changed = oldRev && newRev ? gitCap(["diff", "--name-only", oldRev, newRev]) : "";
  const changedFiles = changed.split("\n").map((line) => line.trim()).filter(Boolean);

  if (changedFiles.length === 0) {
    ok("Daemon already up to date.");
    return;
  }

  const daemonChanged = changedFiles.some((file) => file.startsWith("apps/daemon/"));
  const lockChanged = changedFiles.some(
    (file) => file === "package-lock.json" || file === "apps/daemon/package.json",
  );

  if (!daemonChanged) {
    ok(`Updated ${oldRev.slice(0, 7)} → ${newRev.slice(0, 7)}; no daemon changes, restart skipped.`);
    return;
  }

  if (lockChanged) {
    say("Installing dependencies (lockfile changed)…");
    if (spawnSync("npm", ["install", "--no-audit", "--no-fund"], { stdio: "inherit", cwd: repoDir }).status !== 0) {
      die("npm install failed; resolve the error above and re-run `spanel-daemon update`.");
    }
  } else {
    note("Dependencies unchanged; skipping npm install.");
  }

  say("Building the daemon…");
  if (spawnSync("npm", ["run", "build"], { stdio: "inherit", cwd: pkgDir }).status !== 0) {
    die("Daemon build failed; the previous build is left in place. Fix the error above and re-run.");
  }
  ok("Daemon rebuilt.");

  if (has("systemctl")) {
    run("systemctl", ["restart", SERVICE_NAME]);
    ok(`${SERVICE_NAME} restarted (${oldRev.slice(0, 7)} → ${newRev.slice(0, 7)}).`);
  } else {
    warn("systemd not detected; restart the daemon with your supervisor to apply the update.");
  }
}

function commandHelp(): void {
  process.stdout.write(`${C.blue}SPanel daemon${C.reset} — node agent CLI

${C.dim}Quickest path (recommended)${C.reset}
  In the panel open Admin → Nodes → your node → the ${C.green}Install${C.reset} section.
  Copy the single-line command shown there and run it on the node. It sets up
  everything and connects the node automatically — you should not need to type
  the flags below by hand.

${C.dim}Usage${C.reset}
  spanel-daemon install    --panel <url> --token-id <id> --token <token> [--data <dir>] [--port <n>]
  spanel-daemon configure  --panel <url> --token-id <id> --token <token> [--config <path>]
  spanel-daemon doctor     [--config <path>]
  spanel-daemon service    install|start|stop|restart|status|logs
  spanel-daemon update
  spanel-daemon start      [--config <path>]
  spanel-daemon version

${C.dim}What each command does${C.reset}
  install    Full first-time setup: packages, Docker, the spanel user,
             directories and the systemd service, then writes the config and
             starts the daemon. Needs root. This is what the panel one-liner runs.
  configure  Re-fetches config.yml from the panel using the token pair (no system
             changes). Use it after rotating the token, then:
             ${C.green}sudo spanel-daemon service restart${C.reset}
  update     Fast-forwards this node's checkout and, only when the daemon changed,
             rebuilds it and restarts spanel-daemon (npm install runs only if the
             lockfile changed). Fast-forward only — never resets over local edits.
             Needs root.
  doctor     Health check — Node, Docker, the config, the data directory and
             whether the panel accepts this node's credentials.

${C.dim}Where do the flags come from?${C.reset}
  --panel     your panel URL (--url also accepted)
  --token-id  and  --token   come from Admin → Nodes → your node → Install.

  When running the daemon directly, the same values can be set through the
  environment: SPANEL_CONFIG, SPANEL_REMOTE, SPANEL_TOKEN_ID, SPANEL_TOKEN,
  SPANEL_HOST, SPANEL_PORT, SPANEL_DATA, SPANEL_DEBUG.
`);
}

async function main(): Promise<void> {
  const { command, sub, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "install":
      await commandInstall(flags);
      return;
    case "configure":
      await commandConfigure(flags);
      return;
    case "start":
    case "run":
      commandStart(flags);
      return;
    case "service":
      commandService(sub);
      return;
    case "update":
      commandUpdate(flags);
      return;
    case "doctor":
      await commandDoctor(flags);
      return;
    case "version":
      process.stdout.write(`spanel-daemon ${VERSION} (node ${process.versions.node}, ${os.platform()}/${process.arch})\n`);
      return;
    case "help":
    case "--help":
    case "-h":
      commandHelp();
      return;
    default:
      bad(`Unknown command: ${command}`);
      commandHelp();
      process.exitCode = 1;
  }
}

// Only run when executed directly, so the arg parser can be unit tested.
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((error) => {
    bad(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

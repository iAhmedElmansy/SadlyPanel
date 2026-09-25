#!/usr/bin/env node
/**
 * SPanel daemon bootstrap installer (pure Node.js, zero dependencies).
 *
 * Copy the exact command from Admin -> Nodes -> your node:
 *
 *   curl -fsSL https://panel.example.com/install/daemon.mjs -o /tmp/spanel-install.mjs \
 *     && sudo node /tmp/spanel-install.mjs \
 *       --panel https://panel.example.com \
 *       --token-id <token-id> \
 *       --token <node-token> \
 *       --port 8080
 *
 * What it does:
 *   1. installs base packages, Docker and Node.js 22 when missing
 *   2. creates the spanel user, data directories and nginx include
 *   3. fetches the daemon source (git repo or tarball) into /opt/spanel-daemon
 *   4. npm install --omit=dev && npm run build
 *   5. hands over to `spanel-daemon install` for config + systemd
 *
 * Everything is idempotent: re-running upgrades an existing install.
 */

import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const INSTALL_DIR = "/opt/spanel-daemon";
const CONFIG_PATH = "/etc/spanel/config.yml";
const VHOSTS_DIR = "/etc/spanel/vhosts";
const LOG_DIR = "/var/log/spanel";
const DEFAULT_DATA = "/var/lib/spanel/volumes";
const SERVICE = "spanel-daemon";

const C = { reset: "\x1b[0m", dim: "\x1b[38;5;244m", blue: "\x1b[38;5;39m", green: "\x1b[38;5;41m", amber: "\x1b[38;5;214m", red: "\x1b[38;5;203m" };
const say = (m) => process.stdout.write(`${C.blue}[spanel]${C.reset} ${m}\n`);
const ok = (m) => process.stdout.write(`${C.green}  ok${C.reset}   ${m}\n`);
const warn = (m) => process.stderr.write(`${C.amber}  warn${C.reset} ${m}\n`);
const note = (m) => process.stdout.write(`${C.dim}       ${m}${C.reset}\n`);
const die = (m) => {
  process.stderr.write(`${C.red}  fail${C.reset} ${m}\n`);
  process.exit(1);
};

// --------------------------------------------------------------------- argv
const flags = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i];
  if (!token.startsWith("--")) continue;
  const next = argv[i + 1];
  if (next === undefined || next.startsWith("--")) {
    flags[token.slice(2)] = true;
  } else {
    flags[token.slice(2)] = next;
    i += 1;
  }
}

const panel = typeof flags.panel === "string" ? flags.panel.replace(/\/+$/, "") : "";
const tokenId = typeof flags["token-id"] === "string" ? flags["token-id"] : "";
const token = typeof flags.token === "string" ? flags.token : "";
const daemonPort = String(flags.port ?? 8080);
const dataDir = typeof flags.data === "string" ? flags.data : DEFAULT_DATA;
const repo = typeof flags.repo === "string" ? flags.repo : process.env.SPANEL_DAEMON_REPO ?? "";
const tarball = typeof flags.tarball === "string" ? flags.tarball : "";

if (flags.help === true) {
  process.stdout.write(`SPanel daemon installer

  --panel <url>       panel base URL (required)
  --token-id <id>     node token id from Admin -> Nodes (required)
  --token <token>     node token (required)
  --port <n>          daemon API port (default 8080)
  --data <dir>        volumes directory (default ${DEFAULT_DATA})
  --repo <git-url>    daemon git repository to clone
  --tarball <url>     daemon tarball to download instead of git
  --skip-packages     do not touch the package manager
  --skip-docker       assume Docker is already installed
`);
  process.exit(0);
}

if (process.platform !== "linux") die(`This installer targets Linux nodes (detected ${process.platform}).`);
if (typeof process.getuid === "function" && process.getuid() !== 0) die("Run this installer as root (use sudo).");
if (!panel || !tokenId || !token) die("--panel, --token-id and --token are required. Copy the command from the panel.");

// ------------------------------------------------------------------ helpers
const sh = (script, allowFailure = false) => {
  const result = spawnSync("sh", ["-c", script], { stdio: "inherit" });
  if (result.status !== 0) {
    if (!allowFailure) die(`Command failed: ${script}`);
    warn(`Command failed (continuing): ${script}`);
    return false;
  }
  return true;
};
const quiet = (script) => spawnSync("sh", ["-c", script], { stdio: "ignore" }).status === 0;
const capture = (script) => {
  const result = spawnSync("sh", ["-c", script], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
};
const has = (command) => quiet(`command -v ${command} >/dev/null 2>&1`);

// ------------------------------------------------------------------ packages
const manager = has("apt-get") ? "apt" : has("dnf") ? "dnf" : null;

if (flags["skip-packages"] !== true) {
  if (!manager) {
    warn("Neither apt-get nor dnf found; install curl, git, tar, nginx and certbot yourself.");
  } else {
    say("Installing base packages…");
    if (manager === "apt") {
      sh("DEBIAN_FRONTEND=noninteractive apt-get update -y", true);
      sh(
        "DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates gnupg git tar unzip nginx certbot python3-certbot-nginx",
        true,
      );
    } else {
      sh("dnf install -y curl ca-certificates gnupg2 git tar unzip nginx certbot python3-certbot-nginx", true);
    }
    ok("Base packages present.");
  }
}

// -------------------------------------------------------------------- docker
if (flags["skip-docker"] !== true) {
  if (has("docker")) {
    ok(`Docker present (${capture("docker --version")}).`);
  } else {
    say("Installing Docker…");
    sh("curl -fsSL https://get.docker.com | sh");
  }
  sh("systemctl enable --now docker", true);
}

// ------------------------------------------------------------------- node.js
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) {
  say(`Node.js ${process.versions.node} is too old; installing Node.js 22…`);
  if (manager === "apt") {
    sh("curl -fsSL https://deb.nodesource.com/setup_22.x | bash -", true);
    sh("apt-get install -y nodejs", true);
  } else if (manager === "dnf") {
    sh("curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -", true);
    sh("dnf install -y nodejs", true);
  } else {
    die("Install Node.js 20 or newer, then re-run this installer.");
  }
} else {
  ok(`Node.js ${process.versions.node}.`);
}

// -------------------------------------------------------- user + directories
if (capture("id -u spanel") === "") {
  say("Creating the spanel system user…");
  sh("useradd --system --shell /usr/sbin/nologin --home-dir /var/lib/spanel spanel", true);
}
sh("usermod -aG docker spanel", true);

for (const dir of [dataDir, `${dataDir}/.archives`, `${dataDir}/.backups`, VHOSTS_DIR, LOG_DIR, INSTALL_DIR, "/tmp/spanel"]) {
  fs.mkdirSync(dir, { recursive: true });
}
sh(`chown -R spanel:spanel ${dataDir} ${LOG_DIR}`, true);
sh("chmod 750 /etc/spanel", true);
ok(`Directories ready (data: ${dataDir}).`);

// --------------------------------------------------------------- nginx include
if (fs.existsSync("/etc/nginx/conf.d") && !fs.existsSync("/etc/nginx/conf.d/spanel.conf")) {
  fs.writeFileSync("/etc/nginx/conf.d/spanel.conf", `include ${VHOSTS_DIR}/*.conf;\n`, "utf8");
  if (quiet("nginx -t")) {
    sh("systemctl reload nginx", true);
    ok("nginx wired to the SPanel vhost directory.");
  } else {
    warn("nginx -t failed; review the configuration before using custom domains.");
  }
}

// ------------------------------------------------------------- daemon source
const hasSource = fs.existsSync(path.join(INSTALL_DIR, "package.json"));

if (tarball) {
  say(`Downloading the daemon from ${tarball}…`);
  sh(`rm -rf ${INSTALL_DIR} && mkdir -p ${INSTALL_DIR}`);
  sh(`curl -fsSL ${tarball} | tar -xz -C ${INSTALL_DIR} --strip-components=1`);
} else if (repo) {
  if (fs.existsSync(path.join(INSTALL_DIR, ".git"))) {
    say("Updating the existing daemon checkout…");
    sh(`git -C ${INSTALL_DIR} fetch --depth 1 origin && git -C ${INSTALL_DIR} reset --hard FETCH_HEAD`, true);
  } else {
    say(`Cloning the daemon from ${repo}…`);
    sh(`rm -rf ${INSTALL_DIR}`);
    sh(`git clone --depth 1 ${repo} ${INSTALL_DIR}`);
  }
} else if (!hasSource) {
  warn(`No daemon source in ${INSTALL_DIR} and no --repo/--tarball given.`);
  note(`Copy apps/daemon there, then re-run: node ${process.argv[1]} --panel ${panel} --token-id ${tokenId} --token <token>`);
}

if (fs.existsSync(path.join(INSTALL_DIR, "package.json"))) {
  say("Installing daemon dependencies…");
  sh(`cd ${INSTALL_DIR} && npm install --omit=dev --no-audit --no-fund`, true);
  say("Building the daemon…");
  if (!sh(`cd ${INSTALL_DIR} && npm run build`, true)) {
    warn("Build failed; fix the error above and re-run `npm run build` in " + INSTALL_DIR);
  }
}

// ------------------------------------------------------ configuration + service
const cli = path.join(INSTALL_DIR, "dist", "cli.js");

if (fs.existsSync(cli)) {
  say("Handing over to the daemon CLI for configuration and service setup…");
  const args = [
    cli,
    "install",
    "--panel",
    panel,
    "--token-id",
    tokenId,
    "--token",
    token,
    "--port",
    daemonPort,
    "--data",
    dataDir,
    "--skip-packages",
    "--skip-docker",
  ];
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) warn("The daemon CLI reported a problem; see the output above.");
} else {
  // The build is unavailable, so fetch the config directly and write the unit here.
  warn(`${cli} not found; writing the configuration without the CLI.`);
  let config = "";
  try {
    const signature = createHmac("sha256", token).update("").digest("hex");
    const response = await fetch(`${panel}/api/remote/nodes/config`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${tokenId}.${token}`,
        "X-Spanel-Signature": signature,
      },
    });
    if (!response.ok) throw new Error(`panel responded ${response.status}`);
    config = (await response.json()).config ?? "";
  } catch (error) {
    warn(`Could not fetch the configuration: ${error instanceof Error ? error.message : error}`);
  }

  if (!config) {
    config = `debug: false

api:
  host: 0.0.0.0
  port: ${daemonPort}
  ssl:
    enabled: false
    cert: ""
    key: ""
  upload_limit: 256

system:
  data: ${dataDir}
  archive_directory: ${dataDir}/.archives
  backup_directory: ${dataDir}/.backups
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

remote: ${panel}
token_id: ${tokenId}
token: ${token}
`;
  }

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, config, { mode: 0o640 });
  sh(`chgrp spanel ${CONFIG_PATH} 2>/dev/null || true`, true);
  ok(`Configuration written to ${CONFIG_PATH}.`);

  if (has("systemctl")) {
    fs.writeFileSync(
      `/etc/systemd/system/${SERVICE}.service`,
      `[Unit]
Description=SPanel Daemon
After=network-online.target docker.service
Requires=docker.service

[Service]
User=spanel
Group=spanel
WorkingDirectory=${INSTALL_DIR}
ExecStart=${process.execPath} ${INSTALL_DIR}/dist/index.js --config ${CONFIG_PATH}
Restart=on-failure
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/daemon.log
StandardError=append:${LOG_DIR}/daemon.log

[Install]
WantedBy=multi-user.target
`,
      "utf8",
    );
    sh("systemctl daemon-reload", true);
    sh(`systemctl enable ${SERVICE}`, true);
    ok("systemd unit installed.");
  }
}

say("Done.");
note(`Open TCP ${daemonPort} plus your game/web ports in the firewall.`);
note(`Diagnostics: node ${cli} doctor`);
note(`Logs: journalctl -u ${SERVICE} -n 80 --no-pager`);

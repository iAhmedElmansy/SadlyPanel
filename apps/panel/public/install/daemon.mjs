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
import { createInterface } from "node:readline";

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
const sslEmailFlag =
  typeof flags["ssl-email"] === "string"
    ? flags["ssl-email"]
    : typeof flags.email === "string"
      ? flags.email
      : process.env.SPANEL_SSL_EMAIL ?? "";

if (flags.help === true) {
  process.stdout.write(`SPanel daemon installer

  --panel <url>       panel base URL (required)
  --token-id <id>     node token id from Admin -> Nodes (required)
  --token <token>     node token (required)
  --port <n>          daemon API port (default 8080)
  --data <dir>        volumes directory (default ${DEFAULT_DATA})
  --fqdn <host>       node FQDN for the TLS certificate (default: hostname -f)
  --ssl               enable HTTPS (obtain a Let's Encrypt cert, serve wss)
  --no-ssl            force plain HTTP, skip the SSL prompt
  --ssl-email <addr>  Let's Encrypt registration email (default admin@<apex>)
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

// ---------------------------------------------------------------------- ssl
const isIpv4 = (value) => /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(value);
const isHostname = (value) => /^[A-Za-z0-9.-]+$/.test(value);

/** Parse a tri-state boolean from env/flag values: true, false or undefined. */
const parseBool = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  return ["1", "true", "yes", "on", "y"].includes(String(value).toLowerCase());
};

/** Interactive [y/N] prompt using only Node built-ins (readline). */
function askYesNo(question, defaultYes) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const suffix = defaultYes ? "[Y/n]" : "[y/N]";
    rl.question(`${C.blue}[?]${C.reset} ${question} ${suffix} `, (answer) => {
      rl.close();
      const normalized = String(answer).trim().toLowerCase();
      resolve(normalized === "" ? defaultYes : normalized === "y" || normalized === "yes");
    });
  });
}

/**
 * Decide whether to enable SSL. Precedence: --no-ssl / --ssl flag, then the
 * SPANEL_SSL env var, then an interactive prompt (only on a TTY), else off.
 */
async function resolveSslChoice() {
  if (flags["no-ssl"] === true || parseBool(flags["no-ssl"])) return false;
  if (flags.ssl === true || parseBool(flags.ssl)) return true;
  const envChoice = parseBool(process.env.SPANEL_SSL);
  if (envChoice !== undefined) return envChoice;
  if (process.stdin.isTTY) return askYesNo("Enable SSL (HTTPS) for this daemon?", false);
  return false;
}

/** Let's Encrypt registration email: explicit if valid, else admin@<apex>. */
function acmeEmail(explicit, host) {
  if (explicit && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(explicit)) return explicit;
  const parts = host.split(".");
  return parts.length >= 2 ? `admin@${parts.slice(-2).join(".")}` : "";
}

/**
 * Obtain a TLS certificate for the node FQDN with certbot's standalone plugin
 * (the daemon terminates TLS itself; there is no reverse proxy for the API).
 * Returns true only when the certificate is present on disk afterwards.
 */
function obtainDaemonCertificate(host) {
  if (!has("certbot")) {
    warn("certbot is not installed; cannot obtain a TLS certificate. Install it and re-run, or use --no-ssl.");
    return false;
  }
  const email = acmeEmail(sslEmailFlag, host);
  const emailArg = email ? `-m ${email}` : "--register-unsafely-without-email";
  // certbot --standalone binds port 80; stop nginx for the issuance if it holds
  // it, then bring it back so the daemon's vhost proxy keeps working.
  const nginxActive = quiet("systemctl is-active --quiet nginx");
  if (nginxActive) sh("systemctl stop nginx", true);
  say(`Obtaining a Let's Encrypt certificate for ${host} (certbot --standalone)…`);
  sh(`certbot certonly --standalone -d ${host} --agree-tos ${emailArg} --non-interactive --keep-until-expiring`, true);
  if (nginxActive) sh("systemctl start nginx", true);

  const certFile = `/etc/letsencrypt/live/${host}/fullchain.pem`;
  if (fs.existsSync(certFile)) {
    ok(`Certificate ready at /etc/letsencrypt/live/${host}/.`);
    return true;
  }
  warn(`certbot did not produce ${certFile}. Port 80 may be in use (stop nginx) or DNS for ${host} may not point here yet.`);
  return false;
}

/**
 * Force the api.ssl block in a config.yml string to point at the node's
 * Let's Encrypt certificate. Only the ssl: child lines are touched, so
 * proxy.enabled and other keys are left alone.
 */
function enableSslInConfig(text, host) {
  const certDir = `/etc/letsencrypt/live/${host}`;
  const lines = text.split("\n");
  let sslIndent = -1;
  const out = [];
  for (const line of lines) {
    const header = line.match(/^(\s*)ssl:\s*$/);
    if (header) {
      sslIndent = header[1].length;
      out.push(line);
      continue;
    }
    if (sslIndent >= 0) {
      const indent = (line.match(/^(\s*)/) ?? ["", ""])[1].length;
      if (line.trim() !== "" && indent > sslIndent) {
        const pad = " ".repeat(sslIndent + 2);
        if (/^\s*enabled:/.test(line)) { out.push(`${pad}enabled: true`); continue; }
        if (/^\s*cert:/.test(line)) { out.push(`${pad}cert: ${certDir}/fullchain.pem`); continue; }
        if (/^\s*key:/.test(line)) { out.push(`${pad}key: ${certDir}/privkey.pem`); continue; }
        out.push(line);
        continue;
      }
      sslIndent = -1; // dedented out of the ssl block
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Read config.yml, enable HTTPS in it, and restart the daemon if it changed. */
function applySslToConfigFile(configPath, host) {
  if (!fs.existsSync(configPath)) {
    warn(`${configPath} not found; cannot enable HTTPS in the daemon config.`);
    return;
  }
  const original = fs.readFileSync(configPath, "utf8");
  const patched = enableSslInConfig(original, host);
  if (patched === original) {
    ok("Daemon config already set for HTTPS.");
    return;
  }
  fs.writeFileSync(configPath, patched, { mode: 0o640 });
  sh(`chgrp spanel ${configPath} 2>/dev/null || true`, true);
  ok("Enabled HTTPS in the daemon config.");
  if (has("systemctl")) {
    sh(`systemctl restart ${SERVICE}`, true);
    ok(`${SERVICE} restarted with HTTPS.`);
  }
}

// ---------------------------------------------------------------------- ssl?
// Ask once, up front — before the long package/clone/build steps — so the
// operator isn't surprised by a prompt after a multi-minute wait. The actual
// certificate is issued at the very end, once certbot is installed and the
// daemon config exists. When run through a pipe (curl … | node) stdin is not a
// TTY, so the prompt is skipped; use --ssl/--no-ssl or SPANEL_SSL in that case.
const nodeFqdn =
  typeof flags.fqdn === "string" && flags.fqdn.trim()
    ? flags.fqdn.trim()
    : capture("hostname -f") || capture("hostname") || "";
const wantSsl = await resolveSslChoice();
const sslDomainOk = isHostname(nodeFqdn) && !isIpv4(nodeFqdn) && nodeFqdn.includes(".");
if (wantSsl && !sslDomainOk) {
  warn(
    `SSL was requested but "${nodeFqdn || "this host"}" is not a domain name. Pass ` +
      "--fqdn <domain> pointing at this node. Continuing over plain HTTP.",
  );
}
const enableSsl = wantSsl && sslDomainOk;
if (enableSsl) say(`SSL enabled — a Let's Encrypt certificate for ${nodeFqdn} will be issued after setup.`);

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

// ------------------------------------------------------------------- tls (ssl)
if (enableSsl) {
  if (obtainDaemonCertificate(nodeFqdn)) {
    applySslToConfigFile(CONFIG_PATH, nodeFqdn);
    note(`This node now serves HTTPS. In the panel set its scheme to https, FQDN to ${nodeFqdn}, behind-proxy OFF.`);
  } else {
    warn("Continuing without HTTPS; fix the issue above and re-run with --ssl once a certificate can be issued.");
  }
}

say("Done.");
note(`Open TCP ${daemonPort} plus your game/web ports in the firewall.`);
note(`Diagnostics: node ${cli} doctor`);
note(`Logs: journalctl -u ${SERVICE} -n 80 --no-pager`);

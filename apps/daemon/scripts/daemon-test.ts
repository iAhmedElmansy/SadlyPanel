/**
 * SPanel daemon unit test.
 *
 * Covers the security-critical, Docker-independent parts: path sandboxing,
 * panel↔daemon HMAC authentication, console token verification, resource limit
 * translation, nginx vhost generation, the reverse (daemon→panel) client and
 * the CLI's argument/config handling.
 *
 * Usage (from apps/daemon):  tsx scripts/daemon-test.ts
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { SignJWT } from "jose";
import type { IncomingMessage } from "node:http";

import { SafePath, PathError, assertSafeName, matchesDenylist, directorySize, mimeFor, modeString } from "../src/fs-safe.js";
import { AuthError, verifyPanelRequest, verifyWsToken } from "../src/auth.js";
import { buildHostConfig, environmentArray, containerName } from "../src/docker.js";
import { ProxyService } from "../src/proxy-service.js";
import { FileService } from "../src/file-service.js";
import { PanelClient } from "../src/panel-client.js";
import { parseArgs, readConfigSummary, renderLocalConfig } from "../src/cli.js";
import type { DaemonConfig } from "../src/config.js";
import type { ServerSpec } from "../src/types.js";

let failures = 0;
let total = 0;

function check(name: string, ok: boolean, detail = ""): void {
  total += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function expectThrow(name: string, fn: () => unknown | Promise<unknown>, needle?: string): Promise<void> {
  try {
    await fn();
    check(name, false, "expected an error but none was thrown");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(name, needle ? message.includes(needle) : true, message.slice(0, 100));
  }
}

const NODE_TOKEN = "node-token-abcdefghijklmnopqrstuvwxyz";
const TOKEN_ID = "abcd1234";

function fakeRequest(body: string, options: { auth?: string; signature?: string } = {}): IncomingMessage {
  return {
    headers: {
      authorization: options.auth ?? `Bearer ${TOKEN_ID}.${NODE_TOKEN}`,
      "x-spanel-signature": options.signature ?? createHmac("sha256", NODE_TOKEN).update(body).digest("hex"),
    },
  } as unknown as IncomingMessage;
}

function testConfig(root: string): DaemonConfig {
  return {
    debug: false,
    api: { host: "0.0.0.0", port: 8080, ssl: { enabled: false, cert: "", key: "" }, uploadLimit: 256 },
    system: {
      data: root,
      archiveDirectory: path.join(root, ".archives"),
      backupDirectory: path.join(root, ".backups"),
      tmpDirectory: path.join(root, ".tmp"),
      timezone: "UTC",
      sftp: { bindPort: 2022 },
    },
    docker: {
      network: { name: "spanel0", driver: "bridge", interface: "172.19.0.1", dns: ["1.1.1.1"] },
      installLimit: 5,
    },
    proxy: {
      enabled: true,
      httpPort: 80,
      httpsPort: 443,
      acmeEmail: "admin@example.com",
      configDirectory: path.join(root, "vhosts"),
      reloadCommand: "spanel-noop-reload",
    },
    remote: "https://panel.example.com",
    tokenId: TOKEN_ID,
    token: NODE_TOKEN,
    skipDocker: false,
  };
}

function baseSpec(overrides: Partial<ServerSpec> = {}): ServerSpec {
  return {
    uuid: "11111111-2222-3333-4444-555555555555",
    name: "test",
    serviceKind: "game",
    suspended: false,
    invocation: "java -Xmx2048M -jar server.jar",
    image: "ghcr.io/pterodactyl/yolks:java_21",
    stopSignal: "^C",
    environment: { SERVER_JARFILE: "server.jar" },
    limits: { memory: 2048, swap: 0, disk: 5120, io: 500, cpu: 200, threads: null, oomKiller: false },
    allocations: [{ ip: "0.0.0.0", port: 25565, isPrimary: true }],
    egg: {
      uuid: "egg-uuid",
      features: ["eula"],
      fileDenylist: ["secret.env", "private/**"],
      configFiles: {},
      configStartup: {},
      configLogs: {},
      scriptContainer: "installer",
      scriptEntry: "ash",
      scriptInstall: "#!/bin/ash\necho hi",
    },
    ...overrides,
  };
}

async function main(): Promise<void> {
  console.log("SPanel daemon unit test\n");

  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "spanel-daemon-test-"));
  const volume = path.join(root, "volume");
  await fsp.mkdir(volume, { recursive: true });

  // ------------------------------------------------------------ path safety
  const safe = new SafePath(volume);
  check("resolves a plain relative path", safe.resolve("config.yml") === path.join(volume, "config.yml"));
  check("strips leading slashes", safe.resolve("/plugins/a.jar") === path.join(volume, "plugins", "a.jar"));
  check("normalises inner traversal", safe.resolve("plugins/../config.yml") === path.join(volume, "config.yml"));

  await expectThrow("rejects parent traversal", () => safe.resolve("../../etc/passwd"), "escapes");
  await expectThrow("rejects deep traversal", () => safe.resolve("a/b/../../../../etc/shadow"), "escapes");
  await expectThrow("rejects absolute escape", () => safe.resolve("/../root/.ssh/id_rsa"), "escapes");
  check("relative() reports a volume-rooted path", safe.relative(path.join(volume, "logs", "x.log")) === "/logs/x.log");

  // symlink escape
  const outside = path.join(root, "outside-secret.txt");
  await fsp.writeFile(outside, "top secret", "utf8");
  let symlinkSupported = true;
  try {
    await fsp.symlink(outside, path.join(volume, "escape-link"));
  } catch {
    symlinkSupported = false;
  }
  if (symlinkSupported) {
    await expectThrow("rejects symlinks pointing outside the volume", () => safe.resolveReal("escape-link"), "Symlink escapes");
  } else {
    console.log("\x1b[38;5;244mSKIP\x1b[0m symlink escape check (no symlink permission on this host)");
  }

  check(
    "assertSafeName rejects slashes",
    (() => {
      try {
        assertSafeName("a/b");
        return false;
      } catch {
        return true;
      }
    })(),
  );
  check(
    "assertSafeName rejects dotdot",
    (() => {
      try {
        assertSafeName("..");
        return false;
      } catch {
        return true;
      }
    })(),
  );
  check(
    "assertSafeName accepts a normal name",
    (() => {
      try {
        assertSafeName("server.properties");
        return true;
      } catch {
        return false;
      }
    })(),
  );

  check("denylist matches an exact path", matchesDenylist("secret.env", ["secret.env"]));
  check("denylist matches a recursive glob", matchesDenylist("private/keys/a.pem", ["private/**"]));
  check("denylist matches a single-segment glob", matchesDenylist("dump.sql", ["*.sql"]));
  check("denylist does not over-match", !matchesDenylist("public/index.html", ["private/**"]));

  check("mime type resolved for known extension", mimeFor("server.properties") === "text/plain");
  check("mime type falls back to octet-stream", mimeFor("blob.unknownext") === "application/octet-stream");
  check("mode string renders directories", modeString(0o755, true) === "d755");
  check("mode string renders files", modeString(0o644, false) === "-644");

  // ------------------------------------------------------------ file service
  const files = new FileService(safe, ["secret.env", "private/**"]);
  await files.write("config.yml", "key: value\n");
  check("write creates the file", fs.existsSync(path.join(volume, "config.yml")));
  check("read returns the contents", (await files.read("config.yml")) === "key: value\n");

  await files.createDirectory("/", "plugins");
  check("createDirectory works", fs.existsSync(path.join(volume, "plugins")));

  const listing = await files.list("/");
  check("list includes created entries", listing.some((e) => e.name === "config.yml") && listing.some((e) => e.name === "plugins"));
  check("list marks directories", listing.find((e) => e.name === "plugins")?.isFile === false);

  await files.rename("/", [{ from: "config.yml", to: "config.renamed.yml" }]);
  check("rename moves the file", fs.existsSync(path.join(volume, "config.renamed.yml")));

  // Seed a denylisted file through an unrestricted service so the guard below
  // is testing the denylist and not the setup.
  await new FileService(safe, []).write("private/keys.pem", "x");
  await expectThrow("denylisted read is blocked", () => files.read("private/keys.pem"), "restricted");
  await expectThrow("denylisted write is blocked", () => files.write("secret.env", "x"), "restricted");
  await expectThrow("traversal write is blocked", () => files.write("../escaped.txt", "x"), "escapes");
  await expectThrow("deleting the volume root is refused", () => files.delete("/", ["."]), "Refusing to delete the server root");

  await files.delete("/", ["config.renamed.yml"]);
  check("delete removes the file", !fs.existsSync(path.join(volume, "config.renamed.yml")));

  await files.write("size-a.bin", "0123456789");
  await files.write("nested/size-b.bin", "0123456789");
  const measured = await directorySize(volume);
  check("directorySize walks recursively", measured >= 20, `measured=${measured}`);

  await expectThrow("chmod rejects an invalid mode", () => files.chmod("/", [{ file: "size-a.bin", mode: "999" }]), "Invalid mode");
  await expectThrow("pull rejects non-http protocols", () => files.pull("/", "file:///etc/passwd"), "http(s)");

  // ------------------------------------------------------------------- auth
  const body = JSON.stringify({ spec: { uuid: "abc" } });
  check(
    "valid panel request accepted",
    (() => {
      try {
        verifyPanelRequest(fakeRequest(body), body, { tokenId: TOKEN_ID, token: NODE_TOKEN });
        return true;
      } catch {
        return false;
      }
    })(),
  );

  await expectThrow(
    "wrong node token rejected",
    () => verifyPanelRequest(fakeRequest(body, { auth: `Bearer ${TOKEN_ID}.wrong-token-value-aaaaaaaaaaaaaaaa` }), body, {
      tokenId: TOKEN_ID,
      token: NODE_TOKEN,
    }),
    "Invalid node credentials",
  );
  await expectThrow(
    "missing bearer header rejected",
    () => verifyPanelRequest({ headers: {} } as IncomingMessage, body, { tokenId: TOKEN_ID, token: NODE_TOKEN }),
    "Missing bearer token",
  );
  await expectThrow(
    "tampered body rejected by the signature",
    () => verifyPanelRequest(fakeRequest(body), `${body} tampered`, { tokenId: TOKEN_ID, token: NODE_TOKEN }),
    "signature mismatch",
  );
  await expectThrow(
    "missing signature rejected",
    () =>
      verifyPanelRequest(
        { headers: { authorization: `Bearer ${TOKEN_ID}.${NODE_TOKEN}` } } as IncomingMessage,
        body,
        { tokenId: TOKEN_ID, token: NODE_TOKEN },
      ),
    "Missing request signature",
  );
  check("AuthError carries a status", new AuthError("x", 403).status === 403);

  // console tokens
  const key = new TextEncoder().encode(NODE_TOKEN);
  const goodToken = await new SignJWT({ serverUuid: "srv-1", userId: 7, username: "u", permissions: ["control.console"] })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("spanel-panel")
    .setAudience("spanel-daemon")
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(key);
  const claims = await verifyWsToken(goodToken, NODE_TOKEN);
  check("valid console token verified", claims.serverUuid === "srv-1" && claims.permissions.includes("control.console"));

  await expectThrow("console token signed with another key is rejected", () => verifyWsToken(goodToken, "different-secret"));

  const expired = await new SignJWT({ serverUuid: "srv-1", userId: 7 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("spanel-panel")
    .setAudience("spanel-daemon")
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(key);
  await expectThrow("expired console token is rejected", () => verifyWsToken(expired, NODE_TOKEN));

  const wrongAudience = await new SignJWT({ serverUuid: "srv-1", userId: 7 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("spanel-panel")
    .setAudience("something-else")
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(key);
  await expectThrow("console token with the wrong audience is rejected", () => verifyWsToken(wrongAudience, NODE_TOKEN));

  // -------------------------------------------------------- docker limits
  const config = testConfig(root);
  const hostConfig = buildHostConfig(baseSpec(), config, volume);
  check("memory limit converted to bytes", hostConfig.Memory === 2048 * 1024 * 1024);
  check("memory reservation set below the limit", hostConfig.MemoryReservation === Math.floor(2048 * 1024 * 1024 * 0.75));
  check("cpu quota encodes 200% as 2 cores", hostConfig.CpuQuota === 200_000 && hostConfig.CpuPeriod === 100_000);
  check("block io weight applied", hostConfig.BlkioWeight === 500);
  check("volume bound to /home/container", hostConfig.Binds?.[0] === `${volume}:/home/container:rw`);
  check("tcp and udp ports published", Boolean(hostConfig.PortBindings?.["25565/tcp"] && hostConfig.PortBindings?.["25565/udp"]));
  check("port bound to the allocation ip", hostConfig.PortBindings?.["25565/tcp"]?.[0]?.HostIp === "0.0.0.0");
  check("dangerous capabilities dropped", (hostConfig.CapDrop ?? []).includes("net_raw"));
  check("no-new-privileges enforced", (hostConfig.SecurityOpt ?? []).includes("no-new-privileges"));
  check("pids limited", hostConfig.PidsLimit === 512);
  check("oom killer disabled by default", hostConfig.OomKillDisable === true);
  check("no restart policy (panel controls power)", hostConfig.RestartPolicy?.Name === "no");
  check("attached to the spanel network", hostConfig.NetworkMode === "spanel0");

  const oomOn = buildHostConfig(baseSpec({ limits: { ...baseSpec().limits, oomKiller: true } }), config, volume);
  check("oom killer can be enabled", oomOn.OomKillDisable === false);

  const unlimited = buildHostConfig(
    baseSpec({ limits: { memory: 0, swap: 0, disk: 5120, io: 500, cpu: 0, threads: null, oomKiller: false } }),
    config,
    volume,
  );
  check("zero memory means unlimited", unlimited.Memory === 0);
  check("zero cpu leaves the quota unset", unlimited.CpuQuota === undefined);

  const pinned = buildHostConfig(
    baseSpec({ limits: { ...baseSpec().limits, threads: "0-2" } }),
    config,
    volume,
  );
  check("cpu pinning passed through", pinned.CpusetCpus === "0-2");

  const swapped = buildHostConfig(
    baseSpec({ limits: { ...baseSpec().limits, swap: 512 } }),
    config,
    volume,
  );
  check("swap adds to the memory limit", swapped.MemorySwap === (2048 + 512) * 1024 * 1024);

  const unlimitedSwap = buildHostConfig(
    baseSpec({ limits: { ...baseSpec().limits, swap: -1 } }),
    config,
    volume,
  );
  check("swap of -1 means unlimited", unlimitedSwap.MemorySwap === -1);

  const env = environmentArray(baseSpec(), config);
  check("environment includes STARTUP", env.some((entry) => entry.startsWith("STARTUP=java -Xmx2048M")));
  check("environment includes SERVER_PORT", env.includes("SERVER_PORT=25565"));
  check("environment includes SERVER_MEMORY", env.includes("SERVER_MEMORY=2048"));
  check("environment includes the timezone", env.includes("TZ=UTC"));
  check("container name is prefixed", containerName("abc") === "spanel-abc");

  // --------------------------------------------------------------- proxy
  const proxy = new ProxyService(config, (uuid) => path.join(root, uuid));
  const uuidA = "aaaaaaaa-1111-2222-3333-444444444444";

  const staticResult = await proxy.sync({
    serverUuid: uuidA,
    hostnames: [{ hostname: "site.example.com", kind: "http", httpsMode: "auto", forceHttps: true, targetPort: 8080 }],
    upstream: { ip: "127.0.0.1", port: 8080 },
    web: { runtime: "html", phpVersion: null, documentRoot: "/public" },
  });
  check("proxy sync reports applied", staticResult.applied === true);

  const staticVhost = await fsp.readFile(path.join(config.proxy.configDirectory, `${uuidA}.conf`), "utf8");
  check("static vhost sets server_name", staticVhost.includes("server_name site.example.com;"));
  check("static vhost listens on 443 with ssl", staticVhost.includes("listen 443 ssl;"));
  check("static vhost redirects http to https", staticVhost.includes("return 301 https://$host$request_uri;"));
  check("static vhost serves from the document root", staticVhost.includes(path.posix.join(path.join(root, uuidA), "/public")));
  check("static vhost has try_files", staticVhost.includes("try_files $uri $uri/ =404;"));
  check("static vhost keeps the acme challenge path", staticVhost.includes("/.well-known/acme-challenge/"));
  check("static vhost adds security headers", staticVhost.includes("X-Content-Type-Options nosniff"));

  const uuidB = "bbbbbbbb-1111-2222-3333-444444444444";
  await proxy.sync({
    serverUuid: uuidB,
    hostnames: [{ hostname: "php.example.com", kind: "http", httpsMode: "auto", forceHttps: true, targetPort: 9000 }],
    upstream: { ip: "127.0.0.1", port: 9000 },
    web: { runtime: "php", phpVersion: "8.3", documentRoot: "/public" },
  });
  const phpVhost = await fsp.readFile(path.join(config.proxy.configDirectory, `${uuidB}.conf`), "utf8");
  check("php vhost wires fastcgi", phpVhost.includes("fastcgi_pass 127.0.0.1:9000;"));
  check("php vhost routes through index.php", phpVhost.includes("try_files $uri $uri/ /index.php?$query_string;"));
  check("php vhost blocks dotfiles", phpVhost.includes("location ~ /\\.(?!well-known).* { deny all; }"));

  const uuidC = "cccccccc-1111-2222-3333-444444444444";
  await proxy.sync({
    serverUuid: uuidC,
    hostnames: [{ hostname: "app.example.com", kind: "http", httpsMode: "off", forceHttps: false, targetPort: 3110 }],
    upstream: { ip: "127.0.0.1", port: 3110 },
  });
  const appVhost = await fsp.readFile(path.join(config.proxy.configDirectory, `${uuidC}.conf`), "utf8");
  check("application vhost reverse proxies", appVhost.includes("proxy_pass http://127.0.0.1:3110;"));
  check("application vhost supports websockets", appVhost.includes('proxy_set_header Upgrade $http_upgrade;'));
  check("https off listens on 80 only", appVhost.includes("listen 80;") && !appVhost.includes("listen 443 ssl;"));
  check("https off omits the redirect block", !appVhost.includes("return 301 https://"));

  const uuidD = "dddddddd-1111-2222-3333-444444444444";
  await proxy.sync({
    serverUuid: uuidD,
    hostnames: [{ hostname: "play.example.com", kind: "minecraft", httpsMode: "off", forceHttps: false, targetPort: 25565 }],
    upstream: { ip: "203.0.113.10", port: 25565 },
  });
  check("minecraft hostname writes no http vhost", !fs.existsSync(path.join(config.proxy.configDirectory, `${uuidD}.conf`)));
  const srv = JSON.parse(await fsp.readFile(path.join(config.proxy.configDirectory, `${uuidD}.srv.json`), "utf8")) as {
    hostname: string;
    srv: string;
    port: number;
    target: string;
  }[];
  check("minecraft SRV record recorded", srv[0]?.srv === "_minecraft._tcp.play.example.com");
  check("minecraft SRV port recorded", srv[0]?.port === 25565 && srv[0]?.target === "203.0.113.10");

  await proxy.remove(uuidA);
  check("proxy remove deletes the vhost", !fs.existsSync(path.join(config.proxy.configDirectory, `${uuidA}.conf`)));

  const disabled = new ProxyService({ ...config, proxy: { ...config.proxy, enabled: false } }, (uuid) => uuid);
  const disabledResult = await disabled.sync({ serverUuid: "x", hostnames: [], upstream: null });
  check("disabled proxy reports not applied", disabledResult.applied === false);

  // ------------------------------------------------------------- panel client
  // A local stub panel records what the daemon sends so the request shape and
  // signature can be verified end to end.
  interface Captured {
    method: string;
    url: string;
    auth: string;
    signature: string;
    body: string;
  }
  const captured: Captured[] = [];
  let stubStatus = 200;

  const stub = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      captured.push({
        method: request.method ?? "",
        url: request.url ?? "",
        auth: String(request.headers.authorization ?? ""),
        signature: String(request.headers["x-spanel-signature"] ?? ""),
        body,
      });
      response.writeHead(stubStatus, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          status: "online",
          intervalMs: 15_000,
          node: { id: 1, name: "stub", maintenanceMode: false },
          servers: [{ uuid: "srv-1", suspended: false }],
        }),
      );
    });
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  const stubPort = (stub.address() as { port: number }).port;

  const panel = new PanelClient({ ...config, remote: `http://127.0.0.1:${stubPort}` });
  check("panel client reports configured", panel.configured === true);

  const heartbeatBody = {
    daemonVersion: "1.0.0",
    system: {
      os: "Linux",
      arch: "x64",
      kernel: "6.1",
      cpuModel: "cpu",
      cpuCores: 4,
      memoryTotal: 8192,
      diskTotal: 51200,
      dockerVersion: "27.0",
    },
    usage: {
      memoryUsed: 2048,
      memoryTotal: 8192,
      diskUsed: 10240,
      diskTotal: 51200,
      cpuPercent: 5,
      loadAverage: 0.1,
      runningServers: 1,
      totalServers: 2,
      uptimeSeconds: 60,
    },
    latencyMs: 12,
  };

  const reply = await panel.heartbeat(heartbeatBody);
  check("heartbeat reaches the panel", reply?.status === "online" && reply.intervalMs === 15_000);
  const beatRequest = captured.at(-1)!;
  check("heartbeat posts to the remote endpoint", beatRequest.method === "POST" && beatRequest.url === "/api/remote/nodes/heartbeat");
  check("heartbeat presents the node credentials", beatRequest.auth === `Bearer ${TOKEN_ID}.${NODE_TOKEN}`);
  check(
    "heartbeat signs the exact body it sends",
    beatRequest.signature === createHmac("sha256", NODE_TOKEN).update(beatRequest.body).digest("hex"),
  );
  check("heartbeat body carries the telemetry", JSON.parse(beatRequest.body).usage.memoryUsed === 2048);

  await panel.reportServerState("srv-1", "running");
  const stateRequest = captured.at(-1)!;
  check("state reports hit the server status endpoint", stateRequest.url === "/api/remote/servers/srv-1/status");
  check("state reports carry the state", JSON.parse(stateRequest.body).state === "running");

  await panel.reportInstall("srv-1", false, "script failed", true);
  const installRequest = captured.at(-1)!;
  check("install reports hit the install endpoint", installRequest.url === "/api/remote/servers/srv-1/install");
  const installPayload = JSON.parse(installRequest.body) as { successful: boolean; note: string; reinstall: boolean };
  check(
    "install reports carry the outcome",
    installPayload.successful === false && installPayload.note === "script failed" && installPayload.reinstall === true,
  );

  await panel.reportBackup("backup-1", { successful: true, bytes: 4096, checksum: "abc" });
  const backupRequest = captured.at(-1)!;
  check("backup reports hit the backup endpoint", backupRequest.url === "/api/remote/backups/backup-1");
  check("backup reports carry the size", JSON.parse(backupRequest.body).bytes === 4096);

  // Panel errors must be swallowed, never thrown into container lifecycles.
  stubStatus = 500;
  check("a failing panel returns null instead of throwing", (await panel.heartbeat(heartbeatBody)) === null);
  stubStatus = 200;

  const unconfigured = new PanelClient({ ...config, remote: "" });
  check("an unconfigured panel client is inert", unconfigured.configured === false);
  check("an unconfigured panel client returns null", (await unconfigured.heartbeat(heartbeatBody)) === null);

  const unreachable = new PanelClient({ ...config, remote: "http://127.0.0.1:1" });
  check("an unreachable panel returns null", (await unreachable.heartbeat(heartbeatBody)) === null);

  await new Promise<void>((resolve) => stub.close(() => resolve()));

  // --------------------------------------------------------------------- cli
  const parsed = parseArgs(["install", "--panel", "https://panel.test", "--token-id", "abc", "--skip-docker"]);
  check("cli parses the command", parsed.command === "install");
  check("cli parses valued flags", parsed.flags.panel === "https://panel.test" && parsed.flags["token-id"] === "abc");
  check("cli parses boolean flags", parsed.flags["skip-docker"] === true);

  const subcommand = parseArgs(["service", "restart"]);
  check("cli parses a subcommand", subcommand.command === "service" && subcommand.sub === "restart");
  check("cli defaults to help", parseArgs([]).command === "help");
  check(
    "cli treats a trailing flag as boolean",
    parseArgs(["doctor", "--verbose"]).flags.verbose === true,
  );

  const localConfig = renderLocalConfig({
    panel: "https://panel.test/",
    tokenId: "tid",
    token: "tok",
    port: 9090,
    data: "/srv/data",
  });
  check("cli config strips the trailing slash from the panel url", localConfig.includes("remote: https://panel.test\n"));
  check("cli config writes the port", localConfig.includes("port: 9090"));
  check("cli config writes the data directory", localConfig.includes("data: /srv/data"));

  const summary = readConfigSummary(localConfig);
  check("config summary reads the remote", summary.remote === "https://panel.test");
  check("config summary reads the credentials", summary.tokenId === "tid" && summary.token === "tok");
  check("config summary reads the port", summary.port === 9090);
  check("config summary reads the data directory", summary.data === "/srv/data");
  check(
    "config summary tolerates quoted values",
    readConfigSummary('remote: "https://q.test"\ntoken_id: \'qid\'\ntoken: qtok\n').remote === "https://q.test",
  );
  check("config summary falls back to defaults", readConfigSummary("debug: false").port === 8080);

  await fsp.rm(root, { recursive: true, force: true });

  console.log(`\n${total - failures}/${total} checks passed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Daemon test crashed:", error);
  process.exitCode = 1;
});

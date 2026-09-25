/* eslint-disable no-console */
/**
 * SPanel integration test.
 *
 * Exercises the real service layer against the configured database: node
 * capacity accounting, port allocation, server provisioning, environment
 * materialisation, hostname binding, RBAC and teardown.
 *
 * The node daemon is intentionally pointed at a closed port so provisioning
 * must still commit panel state and report the daemon failure instead of
 * losing the record.
 *
 * Usage (from apps/panel):  tsx scripts/integration-test.ts
 */

import { prisma } from "../src/lib/db";
import { encrypt, decrypt, randomHex, randomToken, uuid } from "../src/lib/crypto";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { generateToken, verifyToken, generateSecret, base32Decode } from "../src/lib/auth/totp";
import {
  expandPortSpec,
  eggSchema,
  eggVariableSchema,
  nestSchema,
  nodeSchema,
  serverCreateSchema,
  buildPasswordSchema,
} from "../src/lib/validation";
import { issueAuthToken, consumeAuthToken } from "../src/lib/auth/tokens";
import { getPasswordPolicy } from "../src/lib/auth/password-policy";
import { assertNodeHasCapacity, getNodeCapacity } from "../src/lib/services/capacity";
import { provisionServer, deleteServer } from "../src/lib/services/provision";
import { buildServerSpec, renderStartup } from "../src/lib/daemon/spec";
import { resolveServerAccess, can } from "../src/lib/auth/rbac";
import { connectionAddress } from "../src/lib/services/network";
import { setSetting, getSetting, getSmtpSettings } from "../src/lib/settings";
import { SETTING_KEYS } from "../src/lib/constants";
import { buildDatabaseName, buildDatabaseUsername } from "../src/lib/databases";
import {
  healthOf,
  heartbeatSeries,
  nodeHealthSummary,
  recordHeartbeat,
  refreshNodeHealth,
  SAMPLE_RETENTION,
  trimHeartbeats,
} from "../src/lib/services/heartbeat";
import { databaseHostStatus } from "../src/lib/services/db-health";
import { nextRun, describe as describeCron, validateCron } from "../src/lib/services/cron";
import { renderDaemonConfig, renderInstallCommand } from "../src/lib/services/node-config";
import { exportFileName, missingStartupVariables, parseEggFile, serialiseEgg } from "../src/lib/services/egg-io";
import type { AuthUser } from "../src/lib/auth/session";

let failures = 0;
let total = 0;

function check(name: string, ok: boolean, detail = ""): void {
  total += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function expectThrow(name: string, fn: () => Promise<unknown>, needle?: string): Promise<void> {
  try {
    await fn();
    check(name, false, "expected an error but none was thrown");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(name, needle ? message.includes(needle) : true, message.slice(0, 120));
  }
}

const TEST_PREFIX = "itest";

async function cleanup(): Promise<void> {
  const servers = await prisma.server.findMany({
    where: { name: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  for (const server of servers) {
    await prisma.allocation.updateMany({ where: { serverId: server.id }, data: { serverId: null, isPrimary: false } });
    await prisma.server.delete({ where: { id: server.id } }).catch(() => undefined);
  }
  await prisma.domainBinding.deleteMany({ where: { hostname: { contains: `${TEST_PREFIX}.` } } });
  await prisma.domain.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.node.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.databaseHost.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: TEST_PREFIX } } });
  await prisma.egg.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.nest.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
}

async function main(): Promise<void> {
  console.log("SPanel integration test\n");
  await cleanup();

  // ---------------------------------------------------------------- crypto
  const secret = "s3cret-node-token-value";
  const sealed = encrypt(secret);
  check("encrypt produces a versioned envelope", sealed.startsWith("spv1:") && sealed !== secret);
  check("decrypt round-trips", decrypt(sealed) === secret);
  check("decrypt passes through plaintext", decrypt("not-encrypted") === "not-encrypted");
  check("decrypt of empty input is empty", decrypt("") === "" && decrypt(null) === "");

  const hash = await hashPassword("SPanelAdmin123");
  check("bcrypt hash verifies", await verifyPassword("SPanelAdmin123", hash));
  check("bcrypt rejects wrong password", !(await verifyPassword("wrong", hash)));

  // ---------------------------------------------------- auth token lifecycle
  const tokenUser = await prisma.user.create({
    data: {
      uuid: uuid(),
      email: `${TEST_PREFIX}-tokens@example.com`,
      username: `${TEST_PREFIX}_tokens`,
      firstName: "Token",
      lastName: "Tester",
      password: hash,
      role: "user",
    },
  });
  const rawVerify = await issueAuthToken(tokenUser.id, "email_verify");
  const stored = await prisma.authToken.findFirst({ where: { userId: tokenUser.id, kind: "email_verify" } });
  check("auth token stores only a hash, never the raw value", !!stored && stored.tokenHash !== rawVerify);
  check("wrong-kind consumption is rejected", (await consumeAuthToken(rawVerify, "password_reset")) === null);
  check("valid token consumption returns the user id", (await consumeAuthToken(rawVerify, "email_verify")) === tokenUser.id);
  check("tokens are single-use", (await consumeAuthToken(rawVerify, "email_verify")) === null);
  check("garbage tokens are rejected", (await consumeAuthToken("not-a-real-token", "email_verify")) === null);
  await prisma.user.delete({ where: { id: tokenUser.id } });

  // ------------------------------------------------------- password policy
  const policy = await getPasswordPolicy();
  check("password policy has a sane minimum length", policy.minLength >= 1 && policy.minLength <= 128);
  const strict = buildPasswordSchema({ minLength: 10, requireUpper: true, requireNumber: true, requireSymbol: true });
  check("policy schema rejects a weak password", !strict.safeParse("short").success);
  check("policy schema accepts a compliant password", strict.safeParse("Str0ng!Passw0rd").success);

  // -------------------------------------------------------------------- totp
  // RFC 6238 test vector: secret "12345678901234567890" (SHA-1, 30s step).
  // At T=59s the counter is 1 and the 6-digit code is 287082.
  const rfcSecret = base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"); // "12345678901234567890"
  check("base32 decodes the RFC 6238 key", rfcSecret.toString("ascii") === "12345678901234567890");
  check(
    "TOTP matches RFC 6238 vector at T=59",
    generateToken("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000) === "287082",
  );
  const totpSecret = generateSecret();
  check("verifyToken accepts a freshly generated code", verifyToken(totpSecret, generateToken(totpSecret)));
  check("verifyToken rejects a wrong code", !verifyToken(totpSecret, "000000"));
  check("verifyToken rejects non-numeric input", !verifyToken(totpSecret, "abcdef"));

  // ------------------------------------------------------------ validation
  check("port range expands inclusively", JSON.stringify(expandPortSpec("25565-25567")) === "[25565,25566,25567]");
  check(
    "mixed port spec expands and sorts",
    JSON.stringify(expandPortSpec("25580, 25565-25566")) === "[25565,25566,25580]",
  );
  check(
    "port spec rejects out-of-range",
    (() => {
      try {
        expandPortSpec("70000");
        return false;
      } catch {
        return true;
      }
    })(),
  );
  check("node schema rejects an empty fqdn", !nodeSchema.safeParse({ name: "x", fqdn: "", scheme: "https" }).success);

  // -------------------------------------------------------------------- cron
  const cron = (minute: string, hour: string, dayMonth: string, month: string, dayWeek: string) => ({
    minute,
    hour,
    dayMonth,
    month,
    dayWeek,
  });
  check(
    "cron */5 advances to the next 5-minute mark",
    nextRun(cron("*/5", "*", "*", "*", "*"), new Date("2024-01-01T00:02:00Z"))?.toISOString() === "2024-01-01T00:05:00.000Z",
  );
  check(
    "cron 0 3 * * * runs the next day at 03:00",
    nextRun(cron("0", "3", "*", "*", "*"), new Date("2024-01-01T04:00:00Z"))?.toISOString() === "2024-01-02T03:00:00.000Z",
  );
  check(
    "cron 0 0 * * 0 runs the next Sunday at midnight",
    nextRun(cron("0", "0", "*", "*", "0"), new Date("2024-01-01T00:00:00Z"))?.toISOString() === "2024-01-07T00:00:00.000Z",
  );
  check(
    "cron ranges/lists resolve (weekdays 9-17)",
    nextRun(cron("0,30", "9-17", "*", "*", "1-5"), new Date("2024-01-06T12:00:00Z"))?.toISOString() ===
      "2024-01-08T09:00:00.000Z",
  );
  check("cron rejects an impossible date (Feb 30)", nextRun(cron("0", "0", "30", "2", "*"), new Date("2024-01-01T00:00:00Z")) === null);
  check("cron describe renders 5-minute steps", describeCron(cron("*/5", "*", "*", "*", "*")) === "Every 5 minutes");
  check("cron describe renders a daily time", describeCron(cron("0", "3", "*", "*", "*")) === "At 03:00, every day");
  check("cron describe renders a weekly time", describeCron(cron("0", "0", "*", "*", "0")) === "At 00:00, on Sunday");
  check("cron validation rejects an out-of-range minute", validateCron(cron("99", "*", "*", "*", "*")).ok === false);
  check("cron validation accepts a valid expression", validateCron(cron("*/5", "*", "*", "*", "*")).ok === true);
  check(
    "server schema requires a subdomain label when mode=subdomain",
    !serverCreateSchema.safeParse({
      name: "x",
      nodeId: 1,
      eggId: 1,
      dockerImage: "img",
      allocationId: 1,
      memory: 1024,
      disk: 2048,
      cpu: 100,
      hostnameMode: "subdomain",
      domainId: 1,
    }).success,
  );

  // ---------------------------------------------------------------- settings
  await setSetting(SETTING_KEYS.smtpPass, "smtp-plaintext-secret");
  const storedSmtp = await prisma.setting.findUnique({ where: { key: SETTING_KEYS.smtpPass } });
  check("smtp password is encrypted at rest", storedSmtp?.encrypted === true && !storedSmtp.value.includes("plaintext"));
  check("smtp password decrypts for use", (await getSmtpSettings()).password === "smtp-plaintext-secret");
  await setSetting(SETTING_KEYS.siteName, "SadlyStudios Panel");
  check("settings read back", (await getSetting(SETTING_KEYS.siteName)) === "SadlyStudios Panel");

  // -------------------------------------------------------------- fixtures
  const owner = await prisma.user.create({
    data: {
      uuid: uuid(),
      email: `${TEST_PREFIX}-owner@example.com`,
      username: `${TEST_PREFIX}owner`,
      firstName: "Owner",
      lastName: "User",
      password: hash,
      role: "user",
    },
  });
  const admin = await prisma.user.create({
    data: {
      uuid: uuid(),
      email: `${TEST_PREFIX}-admin@example.com`,
      username: `${TEST_PREFIX}admin`,
      firstName: "Admin",
      lastName: "User",
      password: hash,
      role: "admin",
      rootAdmin: true,
    },
  });
  const stranger = await prisma.user.create({
    data: {
      uuid: uuid(),
      email: `${TEST_PREFIX}-stranger@example.com`,
      username: `${TEST_PREFIX}stranger`,
      firstName: "Stranger",
      lastName: "User",
      password: hash,
      role: "user",
    },
  });

  // Daemon points at a closed local port so calls fail fast and deterministically.
  const node = await prisma.node.create({
    data: {
      uuid: uuid(),
      name: `${TEST_PREFIX}-node`,
      fqdn: "127.0.0.1",
      scheme: "http",
      daemonPort: 8099,
      daemonTokenId: randomHex(8),
      daemonToken: encrypt(randomToken(32)),
      memory: 4096,
      disk: 20480,
      cpu: 400,
    },
  });
  check("node token stored encrypted", node.daemonToken.startsWith("spv1:"));

  const ports = expandPortSpec("25565-25567");
  await prisma.allocation.createMany({
    data: ports.map((port) => ({ nodeId: node.id, ip: "127.0.0.1", port, ipAlias: "node.test" })),
  });
  const allocations = await prisma.allocation.findMany({ where: { nodeId: node.id }, orderBy: { port: "asc" } });
  check("allocations created", allocations.length === 3);

  const domain = await prisma.domain.create({
    data: { name: `${TEST_PREFIX}.example`, targetIp: "127.0.0.1", isPublic: true, wildcardDns: true },
  });

  const dbHost = await prisma.databaseHost.create({
    data: {
      name: `${TEST_PREFIX}-mysql`,
      host: "127.0.0.1",
      port: 33061,
      username: "spanel",
      password: encrypt("db-secret"),
      nodeId: node.id,
    },
  });
  check("database host password encrypted", dbHost.password.startsWith("spv1:"));
  check("database name is namespaced", buildDatabaseName(42, "Main DB!") === "s42_main_db_");
  check("database user is namespaced", buildDatabaseUsername(42, "abcdefghij").startsWith("u42_"));

  // -------------------------------------------------------------- capacity
  const beforeCapacity = await getNodeCapacity(node.id);
  check(
    "empty node reports zero usage",
    beforeCapacity.memory.used === 0 && beforeCapacity.allocations.free === 3,
    `free ports=${beforeCapacity.allocations.free}`,
  );

  await expectThrow(
    "capacity check rejects over-allocation of memory",
    () => assertNodeHasCapacity(node.id, { memory: 999_999, disk: 1024, cpu: 50 }),
    "memory left",
  );
  await expectThrow(
    "capacity check rejects over-allocation of disk",
    () => assertNodeHasCapacity(node.id, { memory: 512, disk: 999_999, cpu: 50 }),
    "disk left",
  );
  await expectThrow(
    "capacity check rejects over-allocation of cpu",
    () => assertNodeHasCapacity(node.id, { memory: 512, disk: 1024, cpu: 5000 }),
    "CPU left",
  );

  await prisma.node.update({ where: { id: node.id }, data: { maintenanceMode: true } });
  await expectThrow(
    "maintenance mode blocks deployment",
    () => assertNodeHasCapacity(node.id, { memory: 512, disk: 1024, cpu: 50 }),
    "maintenance mode",
  );
  await prisma.node.update({ where: { id: node.id }, data: { maintenanceMode: false } });

  // ------------------------------------------------------------ provisioning
  const egg = await prisma.egg.findFirstOrThrow({ where: { name: "Paper" }, include: { variables: true } });
  const images = JSON.parse(egg.dockerImages) as Record<string, string>;
  const image = Object.values(images)[0]!;

  const provisioned = await provisionServer({
    name: `${TEST_PREFIX}-mc`,
    description: "integration test server",
    nodeId: node.id,
    eggId: egg.id,
    dockerImage: image,
    allocationId: allocations[0]!.id,
    additionalAllocationIds: [allocations[1]!.id],
    memory: 2048,
    swap: 0,
    disk: 5120,
    cpu: 200,
    io: 500,
    threads: undefined,
    oomKiller: false,
    databaseLimit: 2,
    allocationLimit: 2,
    backupLimit: 3,
    startOnCompletion: false,
    skipScripts: false,
    documentRoot: "/",
    hostnameMode: "subdomain",
    domainId: domain.id,
    subdomainLabel: "play",
    environment: { MINECRAFT_VERSION: "1.21.1", MAX_PLAYERS: "40" },
    actingUserId: owner.id,
    ownerIdResolved: owner.id,
    ip: "127.0.0.1",
  });

  check("provisioning returns a uuid pair", provisioned.uuid.length === 36 && provisioned.uuidShort.length === 8);
  check("provisioning wired the hostname", provisioned.hostname === `play.${TEST_PREFIX}.example`);
  check(
    "unreachable daemon is reported, not swallowed",
    provisioned.daemonQueued === false && Boolean(provisioned.daemonError),
    provisioned.daemonError?.slice(0, 80),
  );

  const server = await prisma.server.findUniqueOrThrow({
    where: { id: provisioned.serverId },
    include: { allocations: true, variables: { include: { variable: true } }, bindings: true, subdomains: true },
  });

  check("server row survives daemon failure", server.status === "install_failed" && server.installStatus === "failed");
  check("two allocations reserved", server.allocations.length === 2);
  check("exactly one primary allocation", server.allocations.filter((a) => a.isPrimary).length === 1);
  check(
    "primary allocation is the requested one",
    server.allocations.find((a) => a.isPrimary)?.id === allocations[0]!.id,
  );
  check("third port remains free", (await prisma.allocation.count({ where: { nodeId: node.id, serverId: null } })) === 1);

  const variableMap = new Map(server.variables.map((v) => [v.variable.envVariable, v.value]));
  check("egg variables materialised", variableMap.size === egg.variables.length);
  check("submitted variable overrides the default", variableMap.get("MINECRAFT_VERSION") === "1.21.1");
  check("second submitted variable applied", variableMap.get("MAX_PLAYERS") === "40");
  check("untouched variable keeps its default", variableMap.get("SERVER_JARFILE") === "server.jar");

  check("subdomain record created", server.subdomains.length === 1 && server.subdomains[0]!.label === "play");
  check("minecraft subdomain uses an SRV record", server.subdomains[0]!.recordType === "SRV");
  const binding = server.bindings[0]!;
  check("binding created and primary", server.bindings.length === 1 && binding.isPrimary);
  check("binding kind derived from the egg", binding.kind === "minecraft");
  check("binding targets the primary port", binding.targetPort === allocations[0]!.port);
  check(
    "connection address prefers the hostname",
    connectionAddress(
      server.bindings.map((b) => ({ hostname: b.hostname, isPrimary: b.isPrimary, kind: b.kind })),
      server.allocations.find((a) => a.isPrimary)!,
    ) === `play.${TEST_PREFIX}.example`,
  );

  // -------------------------------------------------------- capacity after
  const afterCapacity = await getNodeCapacity(node.id);
  check(
    "node usage reflects the new server",
    afterCapacity.memory.used === 2048 && afterCapacity.disk.used === 5120 && afterCapacity.cpu.used === 200,
    `mem=${afterCapacity.memory.used} disk=${afterCapacity.disk.used} cpu=${afterCapacity.cpu.used}`,
  );
  check("allocation accounting updated", afterCapacity.allocations.assigned === 2 && afterCapacity.allocations.free === 1);

  await expectThrow(
    "remaining capacity is enforced for the next server",
    () => assertNodeHasCapacity(node.id, { memory: 3072, disk: 1024, cpu: 50 }),
    "memory left",
  );
  check(
    "editing the same server excludes its own usage",
    await assertNodeHasCapacity(node.id, { memory: 4096, disk: 20480, cpu: 400, excludeServerId: server.id })
      .then(() => true)
      .catch(() => false),
  );

  // ------------------------------------------------------------- duplicates
  await expectThrow(
    "taken ports cannot be reused",
    () =>
      provisionServer({
        name: `${TEST_PREFIX}-clash`,
        nodeId: node.id,
        eggId: egg.id,
        dockerImage: image,
        allocationId: allocations[0]!.id,
        additionalAllocationIds: [],
        memory: 256,
        swap: 0,
        disk: 512,
        cpu: 25,
        io: 500,
        oomKiller: false,
        databaseLimit: 0,
        allocationLimit: 0,
        backupLimit: 0,
        startOnCompletion: false,
        skipScripts: false,
        documentRoot: "/",
        hostnameMode: "none",
        environment: {},
        actingUserId: owner.id,
        ownerIdResolved: owner.id,
      }),
    "already assigned",
  );

  await expectThrow(
    "taken subdomains are rejected",
    () =>
      provisionServer({
        name: `${TEST_PREFIX}-clash2`,
        nodeId: node.id,
        eggId: egg.id,
        dockerImage: image,
        allocationId: allocations[2]!.id,
        additionalAllocationIds: [],
        memory: 256,
        swap: 0,
        disk: 512,
        cpu: 25,
        io: 500,
        oomKiller: false,
        databaseLimit: 0,
        allocationLimit: 0,
        backupLimit: 0,
        startOnCompletion: false,
        skipScripts: false,
        documentRoot: "/",
        hostnameMode: "subdomain",
        domainId: domain.id,
        subdomainLabel: "play",
        environment: {},
        actingUserId: owner.id,
        ownerIdResolved: owner.id,
      }),
    "already taken",
  );

  await expectThrow(
    "an image outside the egg allowlist is rejected",
    () =>
      provisionServer({
        name: `${TEST_PREFIX}-badimage`,
        nodeId: node.id,
        eggId: egg.id,
        dockerImage: "evil/backdoor:latest",
        allocationId: allocations[2]!.id,
        additionalAllocationIds: [],
        memory: 256,
        swap: 0,
        disk: 512,
        cpu: 25,
        io: 500,
        oomKiller: false,
        databaseLimit: 0,
        allocationLimit: 0,
        backupLimit: 0,
        startOnCompletion: false,
        skipScripts: false,
        documentRoot: "/",
        hostnameMode: "none",
        environment: {},
        actingUserId: owner.id,
        ownerIdResolved: owner.id,
      }),
    "not allowed",
  );

  // ------------------------------------------------------------- daemon spec
  const spec = await buildServerSpec(server.id);
  check("spec limits mirror the database", spec.limits.memory === 2048 && spec.limits.disk === 5120 && spec.limits.cpu === 200);
  check("spec includes both allocations", spec.allocations.length === 2);
  check("spec injects SERVER_MEMORY", spec.environment.SERVER_MEMORY === "2048");
  check("spec injects the primary port", spec.environment.SERVER_PORT === String(allocations[0]!.port));
  check("spec resolves the startup placeholders", spec.invocation.includes("-Xmx2048M") && !spec.invocation.includes("{{"));
  check("spec carries the egg install script", spec.egg.scriptInstall.includes("papermc.io"));
  check("spec parses egg features", Array.isArray(spec.egg.features) && spec.egg.features.includes("eula"));
  check("non-web servers omit the web block", spec.web === undefined);
  check(
    "startup renderer substitutes and blanks unknown tokens",
    renderStartup("run {{A}} {{MISSING}}", { A: "1" }) === "run 1 ",
  );

  // ------------------------------------------------------------------- RBAC
  const asUser = (user: { id: number; role: string; username: string; email: string }): AuthUser => ({
    id: user.id,
    uuid: "x",
    email: user.email,
    username: user.username,
    firstName: "T",
    lastName: "U",
    avatarUrl: null,
    role: user.role,
    rootAdmin: false,
    isActive: true,
  });

  const ownerAccess = await resolveServerAccess(asUser(owner), server.uuidShort);
  check("owner resolves by short uuid", ownerAccess?.isOwner === true);
  check("owner has every permission", can(ownerAccess, "file.delete") && can(ownerAccess, "settings.reinstall"));

  const adminAccess = await resolveServerAccess(asUser(admin), server.uuid);
  check("admin resolves by full uuid", adminAccess?.isAdmin === true && adminAccess.isOwner === false);
  check("admin has every permission", can(adminAccess, "backup.restore"));

  check("stranger has no access", (await resolveServerAccess(asUser(stranger), server.uuidShort)) === null);

  await prisma.subuser.create({
    data: {
      serverId: server.id,
      userId: stranger.id,
      permissions: JSON.stringify(["control.console", "file.read"]),
    },
  });
  const subuserAccess = await resolveServerAccess(asUser(stranger), server.uuidShort);
  check("subuser gains scoped access", subuserAccess !== null && !subuserAccess.isOwner);
  check("subuser granted permission allowed", can(subuserAccess, "control.console"));
  check("subuser ungranted permission denied", !can(subuserAccess, "file.delete"));
  check("unknown server resolves to null", (await resolveServerAccess(asUser(admin), "deadbeef")) === null);

  // ---------------------------------------------------------------- webhost
  const webEgg = await prisma.egg.findFirstOrThrow({ where: { name: "PHP Website" } });
  const webImages = JSON.parse(webEgg.dockerImages) as Record<string, string>;
  const webProvisioned = await provisionServer({
    name: `${TEST_PREFIX}-site`,
    nodeId: node.id,
    eggId: webEgg.id,
    dockerImage: Object.values(webImages)[0]!,
    allocationId: allocations[2]!.id,
    additionalAllocationIds: [],
    memory: 512,
    swap: 0,
    disk: 2048,
    cpu: 100,
    io: 500,
    oomKiller: false,
    databaseLimit: 1,
    allocationLimit: 1,
    backupLimit: 1,
    startOnCompletion: false,
    skipScripts: false,
    webRuntime: "php",
    phpVersion: "8.3",
    documentRoot: "/public",
    hostnameMode: "custom",
    customHostname: `www.${TEST_PREFIX}.example`,
    environment: {},
    actingUserId: admin.id,
    ownerIdResolved: owner.id,
  });
  check("webhost server provisioned", webProvisioned.serverId > 0);

  const webServer = await prisma.server.findUniqueOrThrow({
    where: { id: webProvisioned.serverId },
    include: { bindings: true },
  });
  check("webhost runtime persisted", webServer.serviceKind === "webhost" && webServer.webRuntime === "php");
  check("php version persisted", webServer.phpVersion === "8.3");
  check("document root persisted", webServer.documentRoot === "/public");
  check("custom hostname bound as http", webServer.bindings[0]?.kind === "http");
  check("https enabled automatically for websites", webServer.bindings[0]?.httpsMode === "auto");
  check("custom hostname linked to the known domain", webServer.bindings[0]?.domainId === domain.id);

  const webSpec = await buildServerSpec(webServer.id);
  check("web spec includes the web block", webSpec.web?.runtime === "php" && webSpec.web.documentRoot === "/public");
  check("web spec carries the hostname", webSpec.web?.hostnames[0]?.hostname === `www.${TEST_PREFIX}.example`);
  check("web spec injects DOCUMENT_ROOT", webSpec.environment.DOCUMENT_ROOT === "/public");

  // -------------------------------------------------------------- heartbeats
  const freshNode = await prisma.node.findUniqueOrThrow({ where: { id: node.id } });
  check("a node starts with unknown health", healthOf(freshNode.lastHeartbeatAt) === "unknown");
  check("health is online right after a beat", healthOf(new Date()) === "online");
  check("health degrades after 40s", healthOf(new Date(Date.now() - 40_000)) === "degraded");
  check("health is offline after 90s", healthOf(new Date(Date.now() - 90_000)) === "offline");

  const beat = await recordHeartbeat(freshNode, {
    daemonVersion: "1.0.0",
    system: {
      os: "Linux 6.1.0",
      arch: "x64",
      kernel: "6.1.0",
      cpuModel: "Test CPU",
      cpuCores: 8,
      memoryTotal: 16384,
      diskTotal: 102400,
      dockerVersion: "27.3.1",
    },
    usage: {
      memoryUsed: 4096,
      memoryTotal: 16384,
      diskUsed: 20480,
      diskTotal: 102400,
      cpuPercent: 12.5,
      loadAverage: 0.75,
      runningServers: 1,
      totalServers: 2,
      uptimeSeconds: 3600,
    },
    latencyMs: 42,
  });
  check("heartbeat is accepted", beat.status === "online" && beat.intervalMs >= 5000);
  check("heartbeat returns the node's servers", beat.servers.length === (await prisma.server.count({ where: { nodeId: node.id } })));

  const beatenNode = await prisma.node.findUniqueOrThrow({ where: { id: node.id } });
  check("heartbeat stamps the node", beatenNode.lastHeartbeatAt !== null && beatenNode.heartbeatStatus === "online");
  check("heartbeat records the daemon version", beatenNode.daemonVersion === "1.0.0");
  check("heartbeat records hardware", beatenNode.systemCpuCores === 8 && beatenNode.systemMemoryTotal === 16384);
  check("heartbeat records docker", beatenNode.dockerVersion === "27.3.1");
  check("heartbeat resets the failure counter", beatenNode.heartbeatFailures === 0);

  const series = await heartbeatSeries(node.id, 10);
  check("heartbeat series returns the sample", series.length === 1);
  check("series computes memory percent", series[0]?.memoryPercent === 25, `got=${series[0]?.memoryPercent}`);
  check("series computes disk percent", series[0]?.diskPercent === 20, `got=${series[0]?.diskPercent}`);
  check("series carries latency", series[0]?.latencyMs === 42);

  // Negative/garbage telemetry must be clamped, never stored raw.
  await recordHeartbeat(beatenNode, {
    usage: { memoryUsed: -50, cpuPercent: Number.NaN, diskUsed: 1.7, runningServers: -3 },
    latencyMs: -1,
  });
  const clamped = await prisma.nodeHeartbeat.findFirstOrThrow({ where: { nodeId: node.id }, orderBy: { id: "desc" } });
  check(
    "invalid telemetry is clamped",
    clamped.memoryUsed === 0 && clamped.cpuPercent === 0 && clamped.diskUsed === 2 && clamped.runningServers === 0,
    `mem=${clamped.memoryUsed} cpu=${clamped.cpuPercent} disk=${clamped.diskUsed}`,
  );

  // Retention: push past the cap and confirm trimming.
  await prisma.nodeHeartbeat.createMany({
    data: Array.from({ length: SAMPLE_RETENTION + 20 }, () => ({ nodeId: node.id, memoryUsed: 1, memoryTotal: 2 })),
  });
  const trimmed = await trimHeartbeats(node.id);
  const retained = await prisma.nodeHeartbeat.count({ where: { nodeId: node.id } });
  check("heartbeat history is trimmed to the cap", retained === SAMPLE_RETENTION, `retained=${retained} trimmed=${trimmed}`);

  // A stale beat must flip the stored status back to offline.
  await prisma.node.update({
    where: { id: node.id },
    data: { lastHeartbeatAt: new Date(Date.now() - 300_000), heartbeatStatus: "online" },
  });
  await refreshNodeHealth();
  const stale = await prisma.node.findUniqueOrThrow({ where: { id: node.id } });
  check("stale nodes are marked offline", stale.heartbeatStatus === "offline");
  check("offline transitions increment the failure counter", stale.heartbeatFailures === 1);

  const summary = await nodeHealthSummary();
  check("health summary counts every node", summary.total === (await prisma.node.count()));
  check("health summary counts the offline node", summary.offline >= 1);

  // ------------------------------------------------------ database host health
  check(
    "unchecked database hosts report unknown",
    databaseHostStatus({ reachable: null, lastCheckedAt: null }) === "unknown",
  );
  check(
    "recently reachable hosts report reachable",
    databaseHostStatus({ reachable: true, lastCheckedAt: new Date() }) === "reachable",
  );
  check(
    "recently failed hosts report unreachable",
    databaseHostStatus({ reachable: false, lastCheckedAt: new Date() }) === "unreachable",
  );
  check(
    "very old probes report stale",
    databaseHostStatus({ reachable: true, lastCheckedAt: new Date(Date.now() - 60 * 60 * 1000) }) === "stale",
  );

  // ------------------------------------------------------------- node config
  const configNode = await prisma.node.findUniqueOrThrow({ where: { id: node.id } });
  const renderedConfig = renderDaemonConfig(configNode, { panelUrl: "https://panel.test", token: "plain-token" });
  check("config carries the remote url", renderedConfig.includes("remote: https://panel.test"));
  check("config carries the token id", renderedConfig.includes(`token_id: ${configNode.daemonTokenId}`));
  check("config carries the token", renderedConfig.includes("token: plain-token"));
  check("config carries the data directory", renderedConfig.includes(`data: ${configNode.daemonBase}`));
  check("http nodes do not enable daemon tls", renderedConfig.includes("enabled: false"));
  check(
    "config can be rendered with the token hidden",
    !renderDaemonConfig(configNode, { panelUrl: "https://panel.test", token: "plain-token", redactToken: true }).includes(
      "plain-token",
    ),
  );
  const installCommand = renderInstallCommand(configNode, { panelUrl: "https://panel.test", token: "plain-token" });
  check(
    "install command targets the installer and passes credentials",
    installCommand.includes("/install/daemon.sh") &&
      installCommand.includes(`--token-id ${configNode.daemonTokenId}`) &&
      installCommand.includes("--token plain-token"),
  );

  // --------------------------------------------------------------- egg import
  const v2Egg = JSON.stringify({
    _comment: "generated by pterodactyl",
    meta: { version: "PTDL_v2" },
    name: `${TEST_PREFIX} Imported Paper`,
    author: "eggs@example.com",
    description: "Imported test egg",
    features: ["eula", "java_version"],
    docker_images: { "Java 21": "ghcr.io/pterodactyl/yolks:java_21" },
    file_denylist: ["secret.env"],
    startup: "java -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}} nogui",
    config: {
      files: '{"server.properties":{"parser":"properties"}}',
      startup: '{"done":")! For help, type "}',
      logs: "{}",
      stop: "stop",
    },
    scripts: { installation: { script: "#!/bin/ash\necho install", container: "alpine:3.20", entrypoint: "ash" } },
    variables: [
      {
        name: "Jar file",
        description: "Jar to run",
        env_variable: "SERVER_JARFILE",
        default_value: "server.jar",
        user_viewable: 1,
        user_editable: 1,
        rules: "required|string|max:40",
      },
      {
        name: "Token",
        description: "Secret",
        env_variable: "api_token",
        default_value: "",
        user_viewable: false,
        user_editable: 0,
        rules: "nullable|string",
      },
    ],
  });

  const parsedV2 = parseEggFile(v2Egg);
  check("PTDL_v2 egg parses", parsedV2.ok);
  if (parsedV2.ok) {
    const imported = parsedV2.egg;
    check("import keeps the name", imported.name === `${TEST_PREFIX} Imported Paper`);
    check("import maps docker images", imported.dockerImages["Java 21"] === "ghcr.io/pterodactyl/yolks:java_21");
    check("import parses stringified config json", imported.configFiles.includes("server.properties"));
    check("import keeps the stop command", imported.configStop === "stop");
    check("import reads the install script", imported.scriptInstall.includes("echo install"));
    check("import reads the installer container", imported.scriptContainer === "alpine:3.20");
    check("import normalises variable names to uppercase", imported.variables[1]?.envVariable === "API_TOKEN");
    check("import preserves numeric booleans", imported.variables[0]?.userViewable === true);
    check("import preserves false flags", imported.variables[1]?.userEditable === false);
    check("import detects a game egg", imported.kind === "game");
    check("import carries the denylist", imported.fileDenylist[0] === "secret.env");
  }

  const v1Egg = JSON.stringify({
    meta: { version: "PTDL_v1" },
    name: `${TEST_PREFIX} Legacy Node`,
    author: "old@example.com",
    description: "A node.js application egg",
    docker_images: ["ghcr.io/parkervcp/yolks:nodejs_20"],
    startup: "npm start",
    config: { files: {}, startup: { done: "" }, logs: {}, stop: "^C" },
    scripts: { installation: { script: "#!/bin/bash\necho hi", container: "debian:12", entrypoint: "bash" } },
    variables: [],
  });
  const parsedV1 = parseEggFile(v1Egg);
  check("PTDL_v1 egg parses", parsedV1.ok);
  if (parsedV1.ok) {
    check(
      "v1 image arrays become a labelled map",
      parsedV1.egg.dockerImages["nodejs_20"] === "ghcr.io/parkervcp/yolks:nodejs_20",
      JSON.stringify(parsedV1.egg.dockerImages),
    );
    check("v1 application eggs are detected", parsedV1.egg.kind === "application");
  }

  const webEggFile = JSON.stringify({
    meta: { version: "PTDL_v2" },
    name: `${TEST_PREFIX} Site`,
    startup: "nginx -g 'daemon off;'",
    docker_images: { nginx: "nginx:alpine" },
    config: {},
    variables: [],
  });
  const parsedWeb = parseEggFile(webEggFile);
  check("nginx eggs are detected as webhost", parsedWeb.ok && parsedWeb.egg.kind === "webhost");

  const invalidJson = parseEggFile("{ not json");
  check("invalid JSON is reported", !invalidJson.ok && invalidJson.error.includes("not valid JSON"));
  const missingName = parseEggFile(JSON.stringify({ startup: "run" }));
  check("a missing name is reported", !missingName.ok);
  const missingStartup = parseEggFile(JSON.stringify({ name: "x" }));
  check("a missing startup command is reported", !missingStartup.ok);

  const badConfig = parseEggFile(
    JSON.stringify({ name: "x", startup: "run", config: { files: "{not json" }, variables: [] }),
  );
  check(
    "unparseable config blocks are reset with a warning",
    badConfig.ok && badConfig.egg.configFiles === "{}" && badConfig.egg.warnings.some((w) => w.includes("config.files")),
  );

  const dupes = parseEggFile(
    JSON.stringify({
      name: "x",
      startup: "run",
      config: {},
      variables: [
        { name: "A", env_variable: "SAME", default_value: "1" },
        { name: "B", env_variable: "same", default_value: "2" },
      ],
    }),
  );
  check(
    "duplicate variables are skipped with a warning",
    dupes.ok && dupes.egg.variables.length === 1 && dupes.egg.warnings.some((w) => w.includes("Duplicate")),
  );

  // Round-trip: export a seeded egg and re-import it.
  const paperEgg = await prisma.egg.findFirstOrThrow({
    where: { name: "Paper" },
    include: { variables: true, nest: { select: { name: true } } },
  });
  const exported = serialiseEgg(paperEgg);
  const roundTripped = parseEggFile(exported);
  check("exported eggs are valid JSON documents", roundTripped.ok);
  if (roundTripped.ok) {
    check("round-trip keeps the name", roundTripped.egg.name === paperEgg.name);
    check("round-trip keeps the startup", roundTripped.egg.startup === paperEgg.startup);
    check("round-trip keeps the service kind", roundTripped.egg.kind === paperEgg.kind);
    check("round-trip keeps every variable", roundTripped.egg.variables.length === paperEgg.variables.length);
    check("round-trip preserves the uuid", roundTripped.egg.uuid === paperEgg.uuid);
    check("round-trip names the nest", roundTripped.egg.suggestedNest === paperEgg.nest?.name);
  }
  const exportedDocument = JSON.parse(exported) as { meta: { version: string }; _comment: string };
  check("export declares PTDL_v2", exportedDocument.meta.version === "PTDL_v2");
  check("export includes the do-not-edit comment", exportedDocument._comment.includes("SPANEL"));
  check("export file name is slugified", exportFileName({ name: "PHP Website" }) === "egg-php-website.json");

  check(
    "undefined startup variables are reported",
    JSON.stringify(missingStartupVariables("run {{FOO}} {{SERVER_MEMORY}}", [])) === '["FOO"]',
  );
  check(
    "defined variables are not reported",
    missingStartupVariables("run {{FOO}}", [{ envVariable: "FOO" }]).length === 0,
  );

  // -------------------------------------------------------- egg/nest schemas
  check(
    "egg schema rejects an empty docker image map",
    !eggSchema.safeParse({
      nestId: 1,
      name: "x",
      kind: "game",
      dockerImages: "{}",
      startup: "run",
      scriptContainer: "alpine",
      scriptEntry: "ash",
    }).success,
  );
  check(
    "egg schema rejects malformed JSON images",
    !eggSchema.safeParse({
      nestId: 1,
      name: "x",
      kind: "game",
      dockerImages: "{oops",
      startup: "run",
      scriptContainer: "alpine",
      scriptEntry: "ash",
    }).success,
  );
  check(
    "egg schema accepts a valid definition",
    eggSchema.safeParse({
      nestId: 1,
      name: "x",
      kind: "game",
      dockerImages: '{"a":"img"}',
      startup: "run",
      scriptContainer: "alpine",
      scriptEntry: "ash",
    }).success,
  );
  check(
    "egg schema rejects a features value that is not an array",
    !eggSchema.safeParse({
      nestId: 1,
      name: "x",
      kind: "game",
      dockerImages: '{"a":"img"}',
      startup: "run",
      scriptContainer: "alpine",
      scriptEntry: "ash",
      features: '{"a":1}',
    }).success,
  );
  check(
    "variable schema uppercases the env name",
    eggVariableSchema.safeParse({ name: "x", envVariable: "my_var" }).success &&
      eggVariableSchema.parse({ name: "x", envVariable: "my_var" }).envVariable === "MY_VAR",
  );
  check(
    "variable schema rejects invalid env names",
    !eggVariableSchema.safeParse({ name: "x", envVariable: "1bad-name" }).success,
  );
  check("nest schema requires a name", !nestSchema.safeParse({ name: "" }).success);

  // --------------------------------------------------------------- teardown
  const removal = await deleteServer(webServer.id, admin.id);
  check("deleting a server reports the daemon failure", Boolean(removal.daemonError));
  check("deleted server row is gone", (await prisma.server.findUnique({ where: { id: webServer.id } })) === null);
  check(
    "deleting frees its port",
    (await prisma.allocation.findUniqueOrThrow({ where: { id: allocations[2]!.id } })).serverId === null,
  );
  check(
    "deleting cascades bindings",
    (await prisma.domainBinding.count({ where: { serverId: webServer.id } })) === 0,
  );

  const finalCapacity = await getNodeCapacity(node.id);
  check(
    "capacity released after deletion",
    finalCapacity.memory.used === 2048 && finalCapacity.allocations.free === 1,
    `mem=${finalCapacity.memory.used} free=${finalCapacity.allocations.free}`,
  );

  await deleteServer(server.id, admin.id).catch(() => undefined);
  check("all test allocations released", (await prisma.allocation.count({ where: { nodeId: node.id, serverId: { not: null } } })) === 0);

  await cleanup();
  await setSetting(SETTING_KEYS.smtpPass, "");
  await prisma.setting.deleteMany({ where: { key: SETTING_KEYS.smtpPass } });

  console.log(`\n${total - failures}/${total} checks passed.`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch(async (error) => {
    console.error("Integration test crashed:", error);
    await cleanup().catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

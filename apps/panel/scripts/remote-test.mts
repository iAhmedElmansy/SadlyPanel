/**
 * SPanel remote API test.
 *
 * Exercises the daemon → panel endpoints against a *running* panel: creates a
 * throwaway node in the configured database, sends a signed heartbeat, pulls its
 * own config, then checks that bad signatures, tampered bodies, foreign servers
 * and unknown servers are all rejected. The node is deleted afterwards.
 *
 * Usage (from apps/panel):  tsx scripts/remote-test.mts [baseUrl]
 * The DATABASE_URL must be the same database the running panel is using.
 */
import { createHmac } from "node:crypto";
import { prisma } from "../src/lib/db";
import { encrypt, randomHex, randomToken, uuid } from "../src/lib/crypto";
import { healthOf } from "../src/lib/services/heartbeat";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3111").replace(/\/+$/, "");
let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function call(method: string, path: string, token: string, tokenId: string, body?: unknown) {
  const serialised = body === undefined ? "" : JSON.stringify(body);
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenId}.${token}`,
      "X-Spanel-Signature": createHmac("sha256", token).update(serialised).digest("hex"),
    },
    body: body === undefined ? undefined : serialised,
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

const token = randomToken(32);
const tokenId = randomHex(8);

const node = await prisma.node.create({
  data: {
    uuid: uuid(),
    name: "e2e-remote-node",
    fqdn: "127.0.0.1",
    scheme: "http",
    daemonPort: 8099,
    daemonTokenId: tokenId,
    daemonToken: encrypt(token),
  },
});

try {
  const beat = await call("POST", "/api/remote/nodes/heartbeat", token, tokenId, {
    daemonVersion: "1.0.0",
    system: { os: "Linux 6.1", arch: "x64", kernel: "6.1", cpuModel: "E2E CPU", cpuCores: 4, memoryTotal: 8192, diskTotal: 51200, dockerVersion: "27.0" },
    usage: { memoryUsed: 1024, memoryTotal: 8192, diskUsed: 5120, diskTotal: 51200, cpuPercent: 7, loadAverage: 0.2, runningServers: 0, totalServers: 0, uptimeSeconds: 30 },
    latencyMs: 9,
  });
  check("signed heartbeat is accepted", beat.status === 200 && beat.body.status === "online", `status=${beat.status}`);

  const stored = await prisma.node.findUniqueOrThrow({ where: { id: node.id } });
  check("node health becomes online", healthOf(stored.lastHeartbeatAt) === "online");
  check("daemon version persisted", stored.daemonVersion === "1.0.0");
  check("cpu model persisted", stored.systemCpuModel === "E2E CPU");
  check("sample stored", (await prisma.nodeHeartbeat.count({ where: { nodeId: node.id } })) === 1);

  const config = await call("GET", "/api/remote/nodes/config", token, tokenId);
  check(
    "config endpoint returns this node's config",
    config.status === 200 && String(config.body.config).includes(`token_id: ${tokenId}`),
    `status=${config.status}`,
  );

  const wrongSig = await fetch(`${BASE}/api/remote/nodes/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenId}.${token}`, "X-Spanel-Signature": "0".repeat(64) },
    body: JSON.stringify({ usage: {} }),
  });
  check("a bad signature is rejected", wrongSig.status === 403, `status=${wrongSig.status}`);

  const tampered = await fetch(`${BASE}/api/remote/nodes/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenId}.${token}`,
      "X-Spanel-Signature": createHmac("sha256", token).update(JSON.stringify({ usage: {} })).digest("hex"),
    },
    body: JSON.stringify({ usage: { memoryUsed: 999 } }),
  });
  check("a tampered body is rejected", tampered.status === 403, `status=${tampered.status}`);

  // Server-scoped endpoints must refuse servers that belong to another node.
  const otherServer = await prisma.server.findFirst({ where: { nodeId: { not: node.id } }, select: { uuid: true } });
  if (otherServer) {
    const foreign = await call("POST", `/api/remote/servers/${otherServer.uuid}/status`, token, tokenId, { state: "running" });
    check("a foreign server is refused", foreign.status === 403, `status=${foreign.status}`);
  } else {
    console.log("\x1b[38;5;244mSKIP\x1b[0m foreign server check (no server on another node)");
  }

  const unknown = await call("POST", "/api/remote/servers/does-not-exist/install", token, tokenId, { successful: true });
  check("an unknown server is a 404", unknown.status === 404, `status=${unknown.status}`);

  const badState = await call("POST", "/api/remote/servers/does-not-exist/status", token, tokenId, { state: "nonsense" });
  check("an unknown server is rejected before the state check", badState.status === 404, `status=${badState.status}`);
} finally {
  await prisma.node.delete({ where: { id: node.id } }).catch(() => undefined);
  await prisma.$disconnect();
}

console.log(failures === 0 ? "\nAll remote API checks passed." : `\n${failures} check(s) failed.`);
if (failures > 0) process.exitCode = 1;

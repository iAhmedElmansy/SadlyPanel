import net from "node:net";
import type { StatusComponent } from "@prisma/client";
import { prisma } from "../db";

/**
 * Status monitoring.
 *
 * Real, ping-based uptime monitoring for the public status page. A background
 * worker (src/scripts/worker.ts, via the scheduler tick) probes every component
 * whose `monitorEnabled` is set and whose interval has elapsed, records a
 * `StatusCheck`, updates the denormalised `lastStatus`/`lastLatencyMs`, and rolls
 * the result into the per-day `StatusDaily` bucket that powers the 90-day bars.
 *
 * Probes (no external dependency — Node stdlib only):
 *   - http : GET the URL, ok on a 2xx/3xx response (redirects count as up).
 *   - tcp  : open a socket to host:port, ok on connect.
 *   - ping : TCP-connect reachability (ICMP needs root/raw sockets, unavailable
 *            in a container) — connect to host:port, or host:443/80 for a bare host.
 *
 * Everything is wrapped so one unreachable target logs `ok:false` and the loop
 * continues, mirroring the scheduler's node-tolerant design.
 */

export type MonitorType = "http" | "tcp" | "ping";
export type ComponentState = "up" | "down" | "degraded";

/** A probe exceeding this is still "up" but flagged degraded on the latest read. */
export const DEGRADED_LATENCY_MS = 1500;
/** Hard ceiling for any single probe. */
export const PROBE_TIMEOUT_MS = 10_000;
/** Rolling raw-check history kept per component (~ 2 days at 60s). */
export const CHECK_RETENTION = 2880;
/** Days of daily rollup surfaced on the public page. */
export const UPTIME_DAYS = 90;

export interface ProbeResult {
  ok: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
}

function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Splits "host:port" (or a bare host) into parts, with a default port. */
function hostPort(target: string, defaultPort: number): { host: string; port: number } {
  const trimmed = target.trim().replace(/^\w+:\/\//, "").replace(/\/.*$/, "");
  const idx = trimmed.lastIndexOf(":");
  if (idx > 0) {
    const host = trimmed.slice(0, idx);
    const port = Number(trimmed.slice(idx + 1));
    if (Number.isInteger(port) && port > 0 && port < 65536) return { host, port };
  }
  return { host: trimmed, port: defaultPort };
}

async function probeHttp(url: string): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const res = await fetch(target, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": "SPanel-StatusMonitor/1.0" },
    });
    const latencyMs = Date.now() - startedAt;
    // 2xx and 3xx are healthy (a redirect still means the endpoint responded).
    const ok = res.status >= 200 && res.status < 400;
    return { ok, latencyMs, statusCode: res.status, error: ok ? null : `HTTP ${res.status}` };
  } catch (error) {
    return {
      ok: false,
      latencyMs: null,
      statusCode: null,
      error: error instanceof Error ? error.name === "AbortError" ? "Timed out" : error.message : "Request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

function probeTcp(host: string, port: number): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const done = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once("connect", () => done({ ok: true, latencyMs: Date.now() - startedAt, statusCode: null, error: null }));
    socket.once("timeout", () => done({ ok: false, latencyMs: null, statusCode: null, error: "Timed out" }));
    socket.once("error", (err) => done({ ok: false, latencyMs: null, statusCode: null, error: err.message }));
    socket.connect(port, host);
  });
}

/** Runs the appropriate probe for a component's monitor configuration. */
export async function probeComponent(
  component: Pick<StatusComponent, "monitorType" | "monitorTarget">,
): Promise<ProbeResult> {
  const target = component.monitorTarget.trim();
  if (!target) return { ok: false, latencyMs: null, statusCode: null, error: "No monitor target set" };

  switch (component.monitorType) {
    case "http":
      return probeHttp(target);
    case "tcp": {
      const { host, port } = hostPort(target, 80);
      return probeTcp(host, port);
    }
    case "ping":
    default: {
      // ICMP requires elevated privileges in containers; use a TCP reachability
      // check to 443 (falling back to whatever port is specified).
      const { host, port } = hostPort(target, 443);
      return probeTcp(host, port);
    }
  }
}

/** Records one probe: appends a StatusCheck, rolls into StatusDaily, updates latest. */
export async function recordCheck(componentId: number, result: ProbeResult, at: Date = new Date()): Promise<void> {
  const day = utcDay(at);
  const lastStatus: ComponentState = !result.ok
    ? "down"
    : result.latencyMs !== null && result.latencyMs > DEGRADED_LATENCY_MS
      ? "degraded"
      : "up";

  await prisma.$transaction([
    prisma.statusCheck.create({
      data: {
        componentId,
        at,
        ok: result.ok,
        latencyMs: result.latencyMs,
        statusCode: result.statusCode,
        error: result.error,
      },
    }),
    prisma.statusDaily.upsert({
      where: { componentId_day: { componentId, day } },
      create: {
        componentId,
        day,
        upSamples: result.ok ? 1 : 0,
        downSamples: result.ok ? 0 : 1,
      },
      update: result.ok ? { upSamples: { increment: 1 } } : { downSamples: { increment: 1 } },
    }),
    prisma.statusComponent.update({
      where: { id: componentId },
      data: { lastStatus, lastCheckedAt: at, lastLatencyMs: result.latencyMs },
    }),
  ]);
}

/** Keeps at most CHECK_RETENTION raw checks per component. */
export async function trimChecks(componentId: number): Promise<number> {
  const total = await prisma.statusCheck.count({ where: { componentId } });
  if (total <= CHECK_RETENTION) return 0;
  const stale = await prisma.statusCheck.findMany({
    where: { componentId },
    orderBy: { id: "desc" },
    skip: CHECK_RETENTION,
    select: { id: true },
  });
  if (stale.length === 0) return 0;
  const { count } = await prisma.statusCheck.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
  return count;
}

/**
 * Probes every due, enabled component once. A component is due when it has never
 * been checked or `intervalSeconds` has elapsed since its last check. Isolated
 * per component: one failure logs and the loop continues.
 */
export async function runDueChecks(now: Date = new Date()): Promise<{ checked: number; failed: number }> {
  const components = await prisma.statusComponent.findMany({
    where: { monitorEnabled: true },
    select: { id: true, monitorType: true, monitorTarget: true, intervalSeconds: true, lastCheckedAt: true },
  });

  let checked = 0;
  let failed = 0;

  for (const component of components) {
    const dueAt = component.lastCheckedAt
      ? component.lastCheckedAt.getTime() + component.intervalSeconds * 1000
      : 0;
    if (dueAt > now.getTime()) continue;

    try {
      const result = await probeComponent(component);
      await recordCheck(component.id, result, now);
      await trimChecks(component.id).catch(() => undefined);
      checked += 1;
    } catch (error) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.error(
        `[status] component ${component.id} probe failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return { checked, failed };
}

export interface UptimeDay {
  day: string;
  /** up | down | partial | none (no samples recorded that day). */
  state: "up" | "down" | "partial" | "none";
  uptime: number | null;
}

/** Builds the trailing `days`-long uptime series for the bar chart, oldest first. */
export function buildUptimeSeries(
  rows: { day: string; upSamples: number; downSamples: number }[],
  days = UPTIME_DAYS,
  now: Date = new Date(),
): UptimeDay[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const series: UptimeDay[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = byDay.get(key);
    if (!row || row.upSamples + row.downSamples === 0) {
      series.push({ day: key, state: "none", uptime: null });
      continue;
    }
    const total = row.upSamples + row.downSamples;
    const uptime = Math.round((row.upSamples / total) * 100);
    const state = row.downSamples === 0 ? "up" : row.upSamples === 0 ? "down" : "partial";
    series.push({ day: key, state, uptime });
  }
  return series;
}

export interface PublicComponent {
  id: number;
  name: string;
  kind: string;
  monitorEnabled: boolean;
  state: ComponentState | "unknown";
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  uptime90: number | null;
  days: UptimeDay[];
}

export interface PublicCategory {
  id: number | null;
  name: string | null;
  components: PublicComponent[];
}

/**
 * The full public status read model: visible components grouped by category
 * (uncategorised last), each with its 90-day uptime series and current state.
 */
export async function getPublicStatus(now: Date = new Date()): Promise<PublicCategory[]> {
  const [categories, components, daily] = await Promise.all([
    prisma.statusCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.statusComponent.findMany({
      where: { visible: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.statusDaily.findMany({
      select: { componentId: true, day: true, upSamples: true, downSamples: true },
    }),
  ]);

  const dailyByComponent = new Map<number, { day: string; upSamples: number; downSamples: number }[]>();
  for (const row of daily) {
    const list = dailyByComponent.get(row.componentId) ?? [];
    list.push(row);
    dailyByComponent.set(row.componentId, list);
  }

  const toPublic = (c: (typeof components)[number]): PublicComponent => {
    const days = buildUptimeSeries(dailyByComponent.get(c.id) ?? [], UPTIME_DAYS, now);
    const measured = days.filter((d) => d.uptime !== null);
    const uptime90 = measured.length
      ? Math.round(measured.reduce((sum, d) => sum + (d.uptime ?? 0), 0) / measured.length)
      : null;
    const state: ComponentState | "unknown" = c.monitorEnabled
      ? ((c.lastStatus as ComponentState | null) ?? "unknown")
      : "unknown";
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      monitorEnabled: c.monitorEnabled,
      state,
      lastCheckedAt: c.lastCheckedAt ? c.lastCheckedAt.toISOString() : null,
      lastLatencyMs: c.lastLatencyMs,
      uptime90,
      days,
    };
  };

  const result: PublicCategory[] = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    components: components.filter((c) => c.categoryId === cat.id).map(toPublic),
  }));

  const uncategorised = components.filter((c) => c.categoryId === null);
  if (uncategorised.length) {
    result.push({ id: null, name: null, components: uncategorised.map(toPublic) });
  }

  // Drop empty categories so the page only renders groups with components.
  return result.filter((group) => group.components.length > 0);
}

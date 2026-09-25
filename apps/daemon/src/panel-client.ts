import { createHmac } from "node:crypto";
import type { DaemonConfig } from "./config.js";
import { createLogger } from "./logger.js";

const log = createLogger("panel");

/**
 * Client for the reverse direction: daemon → panel.
 *
 * Uses the same credentials as inbound panel requests
 * (`Authorization: Bearer <tokenId>.<token>` + `X-Spanel-Signature` HMAC over
 * the raw body), so no extra secret has to be provisioned on the node.
 *
 * Every call is best-effort: the panel being unreachable must never stop a
 * container from running, so callers get `null` instead of an exception.
 */

export interface HeartbeatBody {
  daemonVersion: string;
  system: {
    os: string;
    arch: string;
    kernel: string;
    cpuModel: string;
    cpuCores: number;
    memoryTotal: number;
    diskTotal: number;
    dockerVersion: string;
  };
  usage: {
    memoryUsed: number;
    memoryTotal: number;
    diskUsed: number;
    diskTotal: number;
    cpuPercent: number;
    loadAverage: number;
    runningServers: number;
    totalServers: number;
    uptimeSeconds: number;
  };
  latencyMs: number;
}

export interface HeartbeatReply {
  status: string;
  intervalMs: number;
  node: { id: number; name: string; maintenanceMode: boolean };
  servers: { uuid: string; suspended: boolean }[];
}

export class PanelClient {
  private readonly base: string;
  private readonly token: string;
  private warned = false;

  constructor(private readonly config: DaemonConfig) {
    this.base = config.remote.replace(/\/+$/, "");
    this.token = `${config.tokenId}.${config.token}`;
  }

  get configured(): boolean {
    return this.base.length > 0;
  }

  private sign(body: string): string {
    return createHmac("sha256", this.config.token).update(body).digest("hex");
  }

  private async request<T>(method: string, path: string, body?: unknown, timeoutMs = 10_000): Promise<T | null> {
    if (!this.configured) {
      if (!this.warned) {
        log.warn("`remote` is not set in the daemon config; the panel will not receive heartbeats.");
        this.warned = true;
      }
      return null;
    }

    const serialised = body === undefined ? "" : JSON.stringify(body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.base}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
          "X-Spanel-Signature": this.sign(serialised),
        },
        body: body === undefined ? undefined : serialised,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        log.debug(`${method} ${path} -> ${response.status} ${detail.slice(0, 200)}`);
        return null;
      }

      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (error) {
      log.debug(`${method} ${path} failed: ${error instanceof Error ? error.message : error}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  heartbeat(body: HeartbeatBody): Promise<HeartbeatReply | null> {
    return this.request<HeartbeatReply>("POST", "/api/remote/nodes/heartbeat", body);
  }

  reportServerState(uuid: string, state: string) {
    return this.request<{ acknowledged: boolean }>("POST", `/api/remote/servers/${uuid}/status`, { state });
  }

  reportInstall(uuid: string, successful: boolean, note?: string, reinstall = false) {
    return this.request<{ acknowledged: boolean }>("POST", `/api/remote/servers/${uuid}/install`, {
      successful,
      note,
      reinstall,
    });
  }

  reportBackup(backupUuid: string, payload: { successful: boolean; bytes?: number; checksum?: string; error?: string }) {
    return this.request<{ acknowledged: boolean }>("POST", `/api/remote/backups/${backupUuid}`, payload, 20_000);
  }

  fetchSpec(uuid: string) {
    return this.request<{ spec: unknown }>("GET", `/api/remote/servers/${uuid}`);
  }
}

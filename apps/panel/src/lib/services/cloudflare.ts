/**
 * Minimal Cloudflare DNS API v4 client (fetch-based, no SDK).
 *
 * Used when a Domain has `dnsProvider = "cloudflare"` with a stored (encrypted)
 * API token and zone id. Supports the record types the panel actually needs:
 * A / CNAME for subdomains and web hostnames, and SRV for Minecraft.
 *
 * Design notes:
 * - Never throws raw secrets into error messages or logs. The token only ever
 *   appears in the Authorization header.
 * - Upserts by (type,name[,service]) so re-running the subdomain flow is
 *   idempotent rather than piling up duplicate records.
 */

const API_BASE = "https://api.cloudflare.com/client/v4";

export class CloudflareError extends Error {}

interface CfResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

export type DnsRecordType = "A" | "CNAME" | "SRV";

interface CfRecord {
  id: string;
  type: string;
  name: string;
}

async function cf<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    // Swallow the underlying cause; it may embed request details.
    throw new CloudflareError("Could not reach the Cloudflare API.");
  }

  let payload: CfResponse<T>;
  try {
    payload = (await response.json()) as CfResponse<T>;
  } catch {
    throw new CloudflareError(`Cloudflare API returned ${response.status}.`);
  }

  if (!payload.success) {
    const message = payload.errors?.map((e) => e.message).join("; ") || `Cloudflare API error (${response.status}).`;
    throw new CloudflareError(message);
  }
  return payload.result;
}

/** Verifies a token + zone id are valid. Returns the zone name on success. */
export async function verifyCredentials(token: string, zoneId: string): Promise<{ ok: boolean; zoneName?: string; error?: string }> {
  try {
    const zone = await cf<{ name: string }>(token, `/zones/${encodeURIComponent(zoneId)}`);
    return { ok: true, zoneName: zone.name };
  } catch (error) {
    return { ok: false, error: error instanceof CloudflareError ? error.message : "Verification failed." };
  }
}

export interface SrvData {
  service: string; // e.g. "_minecraft"
  proto: string; // e.g. "_tcp"
  name: string; // subdomain label or "@"
  priority: number;
  weight: number;
  port: number;
  target: string; // hostname the SRV points at
}

export interface UpsertInput {
  type: DnsRecordType;
  /** Fully-qualified record name, e.g. "play.example.com". */
  name: string;
  /** A/CNAME record content (ip or hostname). Ignored for SRV. */
  content?: string;
  ttl?: number;
  proxied?: boolean;
  srv?: SrvData;
}

async function findRecord(token: string, zoneId: string, type: string, name: string): Promise<CfRecord | null> {
  const params = new URLSearchParams({ type, name });
  const records = await cf<CfRecord[]>(token, `/zones/${encodeURIComponent(zoneId)}/dns_records?${params.toString()}`);
  return records[0] ?? null;
}

/** Creates or updates a DNS record, keyed by (type, name). Idempotent. */
export async function upsertRecord(token: string, zoneId: string, input: UpsertInput): Promise<void> {
  const body: Record<string, unknown> =
    input.type === "SRV"
      ? { type: "SRV", name: input.name, ttl: input.ttl ?? 1, data: input.srv }
      : {
          type: input.type,
          name: input.name,
          content: input.content,
          ttl: input.ttl ?? 1,
          proxied: input.proxied ?? false,
        };

  const existing = await findRecord(token, zoneId, input.type, input.name);
  if (existing) {
    await cf(token, `/zones/${encodeURIComponent(zoneId)}/dns_records/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  } else {
    await cf(token, `/zones/${encodeURIComponent(zoneId)}/dns_records`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
}

/** Deletes a record by (type, name) if it exists. No-op when absent. */
export async function deleteRecord(token: string, zoneId: string, type: DnsRecordType, name: string): Promise<void> {
  const existing = await findRecord(token, zoneId, type, name);
  if (!existing) return;
  await cf(token, `/zones/${encodeURIComponent(zoneId)}/dns_records/${existing.id}`, { method: "DELETE" });
}

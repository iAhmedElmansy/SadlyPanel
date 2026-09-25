import type { Domain } from "@prisma/client";
import { prisma } from "../db";
import { syncServerProxy } from "../daemon";
import { decrypt } from "../crypto";
import { upsertRecord, deleteRecord, type DnsRecordType } from "./cloudflare";

export class NetworkError extends Error {}

/**
 * Best-effort Cloudflare DNS sync for a managed subdomain. When the domain uses
 * `dnsProvider = "cloudflare"` with valid credentials, an A record (or a
 * Minecraft SRV record) is created/updated. Manual domains only record intent,
 * exactly as before. Failures are returned as a warning and never throw, so a
 * DNS hiccup cannot corrupt panel state (mirrors daemon-sync tolerance).
 */
export async function syncSubdomainDns(
  domain: Domain,
  label: string,
  recordType: string,
  target: string | null,
  port: number | null,
): Promise<{ warning?: string }> {
  if (domain.dnsProvider !== "cloudflare") return {};
  const token = decrypt(domain.dnsApiToken);
  if (!token || !domain.dnsZoneId) return { warning: "Cloudflare credentials are not configured for this domain." };
  if (!target) return { warning: "No target address available for the DNS record." };

  const hostname = `${label}.${domain.name}`;
  try {
    if (recordType === "SRV") {
      // Minecraft SRV: _minecraft._tcp.<host> → host:port. Also ensure an A
      // record exists for the hostname the SRV target points at.
      await upsertRecord(token, domain.dnsZoneId, {
        type: "A",
        name: hostname,
        content: target,
      });
      await upsertRecord(token, domain.dnsZoneId, {
        type: "SRV",
        name: hostname,
        srv: {
          service: "_minecraft",
          proto: "_tcp",
          name: label,
          priority: 0,
          weight: 5,
          port: port ?? 25565,
          target: hostname,
        },
      });
    } else {
      const type: DnsRecordType = recordType === "CNAME" ? "CNAME" : "A";
      await upsertRecord(token, domain.dnsZoneId, { type, name: hostname, content: target });
    }
    return {};
  } catch (error) {
    return { warning: error instanceof Error ? error.message : "Cloudflare DNS update failed." };
  }
}

/** Best-effort removal of a subdomain's Cloudflare records. Never throws. */
export async function removeSubdomainDns(domain: Domain, label: string, recordType: string): Promise<void> {
  if (domain.dnsProvider !== "cloudflare") return;
  const token = decrypt(domain.dnsApiToken);
  if (!token || !domain.dnsZoneId) return;
  const hostname = `${label}.${domain.name}`;
  try {
    if (recordType === "SRV") await deleteRecord(token, domain.dnsZoneId, "SRV", hostname);
    await deleteRecord(token, domain.dnsZoneId, "A", hostname).catch(() => undefined);
    await deleteRecord(token, domain.dnsZoneId, "CNAME", hostname).catch(() => undefined);
  } catch {
    // Best-effort: leaving a stale record is preferable to blocking teardown.
  }
}

const HOSTNAME_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function normaliseHostname(value: string): string {
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  if (!HOSTNAME_RE.test(host)) throw new NetworkError(`"${value}" is not a valid hostname.`);
  return host;
}

export interface AttachHostnameInput {
  serverId: number;
  mode: "subdomain" | "custom";
  domainId?: number;
  label?: string;
  hostname?: string;
  kind: string;
  httpsMode: string;
  forceHttps: boolean;
  targetPort?: number | null;
  isPrimary: boolean;
}

/** Binds a hostname (subdomain of a managed domain, or a custom domain) to a server. */
export async function attachHostname(input: AttachHostnameInput) {
  const server = await prisma.server.findUnique({
    where: { id: input.serverId },
    include: { allocations: true },
  });
  if (!server) throw new NetworkError("Server not found.");

  const primary = server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];
  const targetPort = input.targetPort ?? primary?.port ?? null;

  let hostname: string;
  let domainId: number | null = null;
  let subdomainId: number | null = null;
  let dnsWarning: string | undefined;

  if (input.mode === "subdomain") {
    if (!input.domainId || !input.label) throw new NetworkError("Domain and label are required.");
    const domain = await prisma.domain.findUnique({ where: { id: input.domainId } });
    if (!domain) throw new NetworkError("Domain not found.");
    if (!domain.isPublic) throw new NetworkError("This domain is not available for subdomains.");
    const label = input.label.trim().toLowerCase();
    if (!/^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label)) throw new NetworkError("Invalid subdomain label.");

    hostname = `${label}.${domain.name}`;
    domainId = domain.id;

    const existing = await prisma.subdomain.findUnique({
      where: { domainId_label: { domainId: domain.id, label } },
    });
    if (existing && existing.serverId !== input.serverId) throw new NetworkError(`${hostname} is already taken.`);

    const sub =
      existing ??
      (await prisma.subdomain.create({
        data: {
          domainId: domain.id,
          label,
          serverId: input.serverId,
          recordType: input.kind === "minecraft" ? "SRV" : "A",
          target: primary?.ip ?? domain.targetIp ?? null,
        },
      }));
    subdomainId = sub.id;

    // Cloudflare-managed domains get a real DNS record; manual domains do not.
    const dns = await syncSubdomainDns(domain, label, sub.recordType, sub.target, targetPort);
    dnsWarning = dns.warning;
  } else {
    if (!input.hostname) throw new NetworkError("Hostname is required.");
    hostname = normaliseHostname(input.hostname);
    const rootDomain = hostname.split(".").slice(-2).join(".");
    const domain = await prisma.domain.findUnique({ where: { name: rootDomain } });
    domainId = domain?.id ?? null;
  }

  const clash = await prisma.domainBinding.findUnique({ where: { hostname } });
  if (clash && clash.serverId !== input.serverId) throw new NetworkError(`${hostname} is bound to another server.`);

  if (input.isPrimary) {
    await prisma.domainBinding.updateMany({ where: { serverId: input.serverId }, data: { isPrimary: false } });
  }

  const binding = await prisma.domainBinding.upsert({
    where: { hostname },
    create: {
      serverId: input.serverId,
      domainId,
      subdomainId,
      hostname,
      kind: input.kind,
      httpsMode: input.httpsMode,
      forceHttps: input.forceHttps,
      targetPort,
      isPrimary: input.isPrimary,
      status: "pending",
    },
    update: {
      domainId,
      subdomainId,
      kind: input.kind,
      httpsMode: input.httpsMode,
      forceHttps: input.forceHttps,
      targetPort,
      isPrimary: input.isPrimary,
      status: "pending",
      statusNote: null,
    },
  });

  await applyProxy(input.serverId);
  // Surface any DNS warning without failing the binding it decorates.
  return dnsWarning ? Object.assign(binding, { dnsWarning }) : binding;
}

export async function detachHostname(serverId: number, bindingId: number) {
  const binding = await prisma.domainBinding.findFirst({ where: { id: bindingId, serverId } });
  if (!binding) throw new NetworkError("Hostname binding not found.");

  // Best-effort Cloudflare cleanup for a managed subdomain before we drop rows.
  if (binding.subdomainId) {
    const subdomain = await prisma.subdomain.findUnique({
      where: { id: binding.subdomainId },
      include: { domain: true },
    });
    if (subdomain?.domain) await removeSubdomainDns(subdomain.domain, subdomain.label, subdomain.recordType);
  }

  await prisma.$transaction(async (tx) => {
    await tx.domainBinding.delete({ where: { id: binding.id } });
    if (binding.subdomainId) await tx.subdomain.delete({ where: { id: binding.subdomainId } }).catch(() => undefined);
  });

  await applyProxy(serverId);
}

/** Re-applies proxy configuration and records the outcome on each binding. */
export async function applyProxy(serverId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await syncServerProxy(serverId);
    await prisma.domainBinding.updateMany({
      where: { serverId },
      data: { status: "active", statusNote: null },
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown proxy error.";
    await prisma.domainBinding.updateMany({
      where: { serverId },
      data: { status: "error", statusNote: message.slice(0, 200) },
    });
    return { ok: false, error: message };
  }
}

/** Human readable connection address for a server. */
export function connectionAddress(
  bindings: { hostname: string; isPrimary: boolean; kind: string }[],
  allocation: { ip: string; ipAlias: string | null; port: number } | undefined,
): string {
  const primary = bindings.find((b) => b.isPrimary) ?? bindings[0];
  if (primary) {
    if (primary.kind === "http") return `https://${primary.hostname}`;
    return primary.hostname;
  }
  if (!allocation) return "unassigned";
  return `${allocation.ipAlias || allocation.ip}:${allocation.port}`;
}

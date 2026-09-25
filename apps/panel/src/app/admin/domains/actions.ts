"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { encrypt } from "@/lib/crypto";
import { domainSchema, subdomainSchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { applyProxy, syncSubdomainDns, removeSubdomainDns } from "@/lib/services/network";

export interface DomainState {
  error?: string;
  success?: string;
}

export async function createDomainAction(_prev: DomainState, formData: FormData): Promise<DomainState> {
  const admin = await requireAdmin();

  const parsed = domainSchema.safeParse({
    name: formData.get("name"),
    nodeId: formData.get("nodeId") ? Number(formData.get("nodeId")) : null,
    isPublic: formData.get("isPublic") !== null,
    wildcardDns: formData.get("wildcardDns") !== null,
    targetIp: formData.get("targetIp") || undefined,
    dnsProvider: formData.get("dnsProvider") ?? "manual",
    dnsZoneId: formData.get("dnsZoneId") || undefined,
    dnsApiToken: formData.get("dnsApiToken") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid domain." };

  const existing = await prisma.domain.findUnique({ where: { name: parsed.data.name } });
  if (existing) return { error: `${parsed.data.name} is already registered.` };

  await prisma.domain.create({
    data: {
      name: parsed.data.name,
      nodeId: parsed.data.nodeId ?? null,
      isPublic: parsed.data.isPublic,
      wildcardDns: parsed.data.wildcardDns,
      targetIp: parsed.data.targetIp ?? null,
      dnsProvider: parsed.data.dnsProvider,
      dnsZoneId: parsed.data.dnsZoneId ?? null,
      dnsApiToken: parsed.data.dnsApiToken ? encrypt(parsed.data.dnsApiToken) : null,
    },
  });

  await logActivity({ event: "admin:domain.create", userId: admin.id, properties: { name: parsed.data.name } });
  revalidatePath("/admin/domains");
  return { success: `${parsed.data.name} added.` };
}

export async function updateDomainAction(_prev: DomainState, formData: FormData): Promise<DomainState> {
  await requireAdmin();
  const domainId = Number(formData.get("domainId"));
  if (!Number.isInteger(domainId)) return { error: "Invalid domain." };

  const parsed = domainSchema.safeParse({
    name: formData.get("name"),
    nodeId: formData.get("nodeId") ? Number(formData.get("nodeId")) : null,
    isPublic: formData.get("isPublic") !== null,
    wildcardDns: formData.get("wildcardDns") !== null,
    targetIp: formData.get("targetIp") || undefined,
    dnsProvider: formData.get("dnsProvider") ?? "manual",
    dnsZoneId: formData.get("dnsZoneId") || undefined,
    dnsApiToken: formData.get("dnsApiToken") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid domain." };

  await prisma.domain.update({
    where: { id: domainId },
    data: {
      name: parsed.data.name,
      nodeId: parsed.data.nodeId ?? null,
      isPublic: parsed.data.isPublic,
      wildcardDns: parsed.data.wildcardDns,
      targetIp: parsed.data.targetIp ?? null,
      dnsProvider: parsed.data.dnsProvider,
      dnsZoneId: parsed.data.dnsZoneId ?? null,
      // Blank token keeps the stored value.
      ...(parsed.data.dnsApiToken ? { dnsApiToken: encrypt(parsed.data.dnsApiToken) } : {}),
    },
  });

  revalidatePath("/admin/domains");
  return { success: "Domain updated." };
}

export async function deleteDomainAction(domainId: number): Promise<DomainState> {
  const admin = await requireAdmin();
  const bindings = await prisma.domainBinding.count({ where: { domainId } });
  if (bindings > 0) return { error: `${bindings} server hostname(s) still use this domain.` };

  const domain = await prisma.domain.findUnique({ where: { id: domainId }, select: { name: true } });
  await prisma.domain.delete({ where: { id: domainId } });

  await logActivity({ event: "admin:domain.delete", userId: admin.id, properties: { name: domain?.name } });
  revalidatePath("/admin/domains");
  return { success: `${domain?.name ?? "Domain"} removed.` };
}

export async function createSubdomainAction(_prev: DomainState, formData: FormData): Promise<DomainState> {
  await requireAdmin();

  const parsed = subdomainSchema.safeParse({
    domainId: formData.get("domainId"),
    label: formData.get("label"),
    serverId: formData.get("serverId") ? Number(formData.get("serverId")) : null,
    recordType: formData.get("recordType") ?? "A",
    target: formData.get("target") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid subdomain." };

  const domain = await prisma.domain.findUnique({ where: { id: parsed.data.domainId } });
  if (!domain) return { error: "Domain not found." };

  const clash = await prisma.subdomain.findUnique({
    where: { domainId_label: { domainId: domain.id, label: parsed.data.label } },
  });
  if (clash) return { error: `${parsed.data.label}.${domain.name} already exists.` };

  const hostname = `${parsed.data.label}.${domain.name}`;

  const subdomain = await prisma.subdomain.create({
    data: {
      domainId: domain.id,
      label: parsed.data.label,
      serverId: parsed.data.serverId ?? null,
      recordType: parsed.data.recordType,
      target: parsed.data.target ?? domain.targetIp ?? null,
    },
  });

  // Cloudflare-managed domains get a real DNS record; manual domains do not.
  const dns = await syncSubdomainDns(domain, subdomain.label, subdomain.recordType, subdomain.target, null);

  // When wired to a server, create the routing binding as well.
  if (parsed.data.serverId) {
    const server = await prisma.server.findUnique({
      where: { id: parsed.data.serverId },
      include: { allocations: true },
    });
    if (server) {
      const primary = server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];
      const kind = server.serviceKind === "webhost" ? "http" : server.serviceKind === "game" ? "minecraft" : "tcp";
      await prisma.domainBinding.upsert({
        where: { hostname },
        create: {
          serverId: server.id,
          domainId: domain.id,
          subdomainId: subdomain.id,
          hostname,
          kind,
          httpsMode: kind === "http" ? "auto" : "off",
          forceHttps: kind === "http",
          targetPort: primary?.port ?? null,
          isPrimary: false,
          status: "pending",
        },
        update: { subdomainId: subdomain.id, status: "pending" },
      });
      await applyProxy(server.id).catch(() => undefined);
    }
  }

  revalidatePath("/admin/domains");
  return { success: dns.warning ? `${hostname} created (DNS warning: ${dns.warning})` : `${hostname} created.` };
}

export async function deleteSubdomainAction(subdomainId: number): Promise<DomainState> {
  await requireAdmin();
  const subdomain = await prisma.subdomain.findUnique({
    where: { id: subdomainId },
    include: { domain: true, bindings: true },
  });
  if (!subdomain) return { error: "Subdomain not found." };

  const serverIds = [...new Set(subdomain.bindings.map((binding) => binding.serverId))];

  await removeSubdomainDns(subdomain.domain, subdomain.label, subdomain.recordType);

  await prisma.$transaction([
    prisma.domainBinding.deleteMany({ where: { subdomainId } }),
    prisma.subdomain.delete({ where: { id: subdomainId } }),
  ]);

  for (const serverId of serverIds) await applyProxy(serverId).catch(() => undefined);

  revalidatePath("/admin/domains");
  return { success: `${subdomain.label}.${subdomain.domain.name} removed.` };
}

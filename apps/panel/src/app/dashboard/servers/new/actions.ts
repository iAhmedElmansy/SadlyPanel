"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { clientIp, requireUser } from "@/lib/auth/session";
import { serverCreateSchema } from "@/lib/validation";
import { provisionServer } from "@/lib/services/provision";
import { assertUserCanUsePackage } from "@/lib/services/entitlements";
import { getSetting } from "@/lib/settings";
import { SETTING_KEYS } from "@/lib/constants";

export interface CreateState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Client-facing server creation. Non-admin users always own the server they
 * create and are bound by the panel-wide server limit.
 */
export async function createServerAction(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const user = await requireUser();

  const environment: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("env__") && typeof value === "string") {
      environment[key.slice(5)] = value;
    }
  }

  const additional = formData
    .getAll("additionalAllocationIds")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  const parsed = serverCreateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    nodeId: formData.get("nodeId"),
    eggId: formData.get("eggId"),
    planId: formData.get("planId") || undefined,
    packageId: formData.get("packageId") || undefined,
    dockerImage: formData.get("dockerImage"),
    allocationId: formData.get("allocationId"),
    additionalAllocationIds: additional,
    memory: formData.get("memory"),
    swap: formData.get("swap") ?? 0,
    disk: formData.get("disk"),
    cpu: formData.get("cpu"),
    io: formData.get("io") ?? 500,
    threads: formData.get("threads") ?? undefined,
    oomKiller: formData.get("oomKiller") === "on",
    databaseLimit: formData.get("databaseLimit") ?? 2,
    allocationLimit: formData.get("allocationLimit") ?? 2,
    backupLimit: formData.get("backupLimit") ?? 3,
    startOnCompletion: formData.get("startOnCompletion") !== null,
    skipScripts: false,
    webRuntime: formData.get("webRuntime") ?? undefined,
    phpVersion: formData.get("phpVersion") ?? undefined,
    documentRoot: formData.get("documentRoot") ?? "/",
    hostnameMode: formData.get("hostnameMode") ?? "none",
    domainId: formData.get("domainId") ?? undefined,
    subdomainLabel: formData.get("subdomainLabel") ?? undefined,
    customHostname: formData.get("customHostname") ?? undefined,
    environment,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Please review the highlighted fields." };
  }

  // Enforce the panel-wide limit for non-admin users.
  if (user.role !== "admin") {
    const limit = Number((await getSetting(SETTING_KEYS.defaultServerLimit)) || 2);
    if (limit > 0) {
      const owned = await prisma.server.count({ where: { ownerId: user.id } });
      if (owned >= limit) {
        return { error: `You have reached your limit of ${limit} server(s). Contact an administrator for more.` };
      }
    }
    const node = await prisma.node.findUnique({ where: { id: parsed.data.nodeId }, select: { public: true } });
    if (!node?.public) return { error: "That node is not available for self-service deployment." };
  }

  // Server-side entitlement gate. When a package is chosen, confirm the user's
  // plan unlocks it before provisioning. Admins always pass; custom (no
  // package) creation is unaffected. The frontend's disabled state is never
  // trusted — this is the authoritative check.
  if (parsed.data.packageId) {
    const check = await assertUserCanUsePackage(user, parsed.data.packageId);
    if (!check.ok) return { error: check.error ?? "This package is not available on your current plan." };
  }

  let uuidShort: string;
  try {
    const result = await provisionServer({
      ...parsed.data,
      actingUserId: user.id,
      ownerIdResolved: user.id,
      ip: await clientIp(),
    });
    uuidShort = result.uuidShort;
    if (result.daemonError) {
      // Server row exists but the node rejected it; surface the reason.
      return {
        error: `Server record created, but the node could not be reached: ${result.daemonError}. An administrator can retry the install.`,
      };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create the server." };
  }

  redirect(`/dashboard/servers/${uuidShort}?created=1`);
}

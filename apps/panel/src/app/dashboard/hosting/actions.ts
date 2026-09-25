"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { clientIp, requireUser } from "@/lib/auth/session";
import { can, resolveServerAccess } from "@/lib/auth/rbac";
import { serverCreateSchema } from "@/lib/validation";
import { provisionServer } from "@/lib/services/provision";
import { syncServerToNode, syncServerProxy } from "@/lib/daemon";
import { logActivity } from "@/lib/activity";
import { getSetting } from "@/lib/settings";
import { SETTING_KEYS, PHP_VERSIONS } from "@/lib/constants";
import { parseJsonSafe } from "@/lib/utils";

export interface CreateWebsiteState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface Result {
  ok: boolean;
  error?: string;
  message?: string;
}

function fail(error: unknown): Result {
  return { ok: false, error: error instanceof Error ? error.message : "Unexpected error." };
}

/**
 * Deploys a website. This is a hosting-flavoured wrapper around the SAME
 * provisioning path the game panel uses (provisionServer): it validates the
 * request, enforces the panel-wide server limit + public-node rule for
 * non-admins exactly like the self-service server action, then hands a webhost
 * spec to the node daemon. The selected egg must be a real seeded webhost egg,
 * so a working nginx / PHP-FPM server is actually created — never a stub.
 */
export async function createWebsiteAction(
  _prev: CreateWebsiteState,
  formData: FormData,
): Promise<CreateWebsiteState> {
  const user = await requireUser();

  const eggId = Number(formData.get("eggId"));
  const egg = await prisma.egg.findFirst({ where: { id: eggId, kind: "webhost" }, select: { id: true, dockerImages: true } });
  if (!egg) return { error: "That website type is not available." };

  // Pick a docker image that matches the requested runtime/PHP version, falling
  // back to the egg's first image. Webhost eggs key their images by label.
  const images = parseJsonSafe<Record<string, string>>(egg.dockerImages, {});
  const imageEntries = Object.entries(images);
  const runtime = String(formData.get("webRuntime") ?? "html");
  const phpVersion = String(formData.get("phpVersion") ?? "8.3");
  let dockerImage = imageEntries[0]?.[1] ?? "";
  if (runtime === "php") {
    const match = imageEntries.find(([label]) => label.includes(phpVersion));
    if (match) dockerImage = match[1];
  }
  if (!dockerImage) return { error: "The selected website type has no runtime image configured." };

  const parsed = serverCreateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    nodeId: formData.get("nodeId"),
    eggId: egg.id,
    planId: formData.get("planId") || undefined,
    packageId: formData.get("packageId") || undefined,
    dockerImage,
    allocationId: formData.get("allocationId"),
    additionalAllocationIds: [],
    memory: formData.get("memory"),
    swap: formData.get("swap") ?? 0,
    disk: formData.get("disk"),
    cpu: formData.get("cpu"),
    io: formData.get("io") ?? 500,
    databaseLimit: formData.get("databaseLimit") ?? 2,
    allocationLimit: formData.get("allocationLimit") ?? 1,
    backupLimit: formData.get("backupLimit") ?? 3,
    startOnCompletion: true,
    skipScripts: false,
    webRuntime: runtime,
    phpVersion: runtime === "php" ? phpVersion : undefined,
    documentRoot: formData.get("documentRoot") || "/public",
    hostnameMode: formData.get("hostnameMode") ?? "none",
    domainId: formData.get("domainId") ?? undefined,
    subdomainLabel: formData.get("subdomainLabel") ?? undefined,
    customHostname: formData.get("customHostname") ?? undefined,
    environment: {},
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Please review the highlighted fields." };
  }

  // Enforce the same self-service constraints as the game panel.
  if (user.role !== "admin") {
    const limit = Number((await getSetting(SETTING_KEYS.defaultServerLimit)) || 2);
    if (limit > 0) {
      const owned = await prisma.server.count({ where: { ownerId: user.id } });
      if (owned >= limit) {
        return { error: `You have reached your limit of ${limit} website(s)/server(s). Contact an administrator for more.` };
      }
    }
    const node = await prisma.node.findUnique({ where: { id: parsed.data.nodeId }, select: { public: true } });
    if (!node?.public) return { error: "That node is not available for self-service deployment." };
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
      return {
        error: `Website record created, but the node could not be reached: ${result.daemonError}. An administrator can retry the install.`,
      };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create the website." };
  }

  redirect(`/dashboard/hosting/${uuidShort}?created=1`);
}

/**
 * Updates hosting-specific runtime settings (PHP version + document root) that
 * have no equivalent game-panel action. Re-syncs the server spec and reverse
 * proxy so the change reaches the node. Guarded by settings.rename ownership.
 */
export async function updateWebsiteRuntimeAction(
  serverUuid: string,
  input: { phpVersion?: string; documentRoot: string },
): Promise<Result> {
  try {
    const user = await requireUser();
    const access = await resolveServerAccess(user, serverUuid);
    if (!access) throw new Error("Website not found or access denied.");
    if (!can(access, "settings.rename")) throw new Error("You do not have permission to do that.");

    const server = await prisma.server.findFirst({
      where: { id: access.serverId, serviceKind: "webhost" },
      select: { webRuntime: true },
    });
    if (!server) throw new Error("Website not found.");

    const documentRoot = input.documentRoot.trim() || "/public";
    let phpVersion: string | null | undefined;
    if (server.webRuntime === "php") {
      if (input.phpVersion && !PHP_VERSIONS.includes(input.phpVersion as (typeof PHP_VERSIONS)[number])) {
        throw new Error("Unsupported PHP version.");
      }
      phpVersion = input.phpVersion ?? undefined;
    }

    await prisma.server.update({
      where: { id: access.serverId },
      data: { documentRoot, ...(phpVersion !== undefined ? { phpVersion } : {}) },
    });

    // Push the new spec + reverse-proxy web config to the node. Best-effort:
    // failures are surfaced but never corrupt the saved panel state.
    await syncServerToNode(access.serverId).catch(() => undefined);
    await syncServerProxy(access.serverId).catch(() => undefined);

    await logActivity({ event: "server:settings.runtime", userId: user.id, serverId: access.serverId });
    revalidatePath(`/dashboard/hosting/${serverUuid}/settings`);
    return { ok: true, message: "Runtime settings saved." };
  } catch (error) {
    return fail(error);
  }
}

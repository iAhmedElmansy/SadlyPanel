"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { uuid } from "@/lib/crypto";
import { eggSchema, eggVariableSchema, nestSchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import {
  exportFileName,
  missingStartupVariables,
  parseEggFile,
  serialiseEgg,
} from "@/lib/services/egg-io";

export interface EggState {
  error?: string;
  success?: string;
  warnings?: string[];
  fieldErrors?: Record<string, string>;
  /** Set after a successful import/create so the UI can jump to the egg. */
  eggId?: number;
}

function fieldErrorsOf(issues: { path: (string | number | symbol)[]; message: string }[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) !== null;
}

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// ---------------------------------------------------------------------------
// Nests
// ---------------------------------------------------------------------------

export async function createNestAction(_prev: EggState, formData: FormData): Promise<EggState> {
  const admin = await requireAdmin();
  const parsed = nestSchema.safeParse({
    name: formData.get("name"),
    description: text(formData, "description"),
    icon: text(formData, "icon"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const clash = await prisma.nest.findFirst({ where: { name: parsed.data.name } });
  if (clash) return { error: `A nest named "${parsed.data.name}" already exists.` };

  const nest = await prisma.nest.create({
    data: {
      uuid: uuid(),
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      icon: parsed.data.icon ?? null,
    },
  });

  await logActivity({ event: "admin:nest.create", userId: admin.id, properties: { name: nest.name } });
  revalidatePath("/admin/eggs");
  return { success: `Nest ${nest.name} created.` };
}

export async function updateNestAction(_prev: EggState, formData: FormData): Promise<EggState> {
  const admin = await requireAdmin();
  const nestId = Number(formData.get("nestId"));
  if (!Number.isInteger(nestId)) return { error: "Invalid nest." };

  const parsed = nestSchema.safeParse({
    name: formData.get("name"),
    description: text(formData, "description"),
    icon: text(formData, "icon"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const clash = await prisma.nest.findFirst({ where: { name: parsed.data.name, id: { not: nestId } } });
  if (clash) return { error: `A nest named "${parsed.data.name}" already exists.` };

  await prisma.nest.update({
    where: { id: nestId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      icon: parsed.data.icon ?? null,
    },
  });

  await logActivity({ event: "admin:nest.update", userId: admin.id, properties: { nestId } });
  revalidatePath("/admin/eggs");
  return { success: "Nest updated." };
}

export async function deleteNestAction(nestId: number): Promise<EggState> {
  const admin = await requireAdmin();
  const eggs = await prisma.egg.count({ where: { nestId } });
  if (eggs > 0) return { error: `This nest still contains ${eggs} service(s). Move or delete them first.` };

  const nest = await prisma.nest.findUnique({ where: { id: nestId }, select: { name: true } });
  await prisma.nest.delete({ where: { id: nestId } });

  await logActivity({ event: "admin:nest.delete", userId: admin.id, properties: { name: nest?.name } });
  revalidatePath("/admin/eggs");
  return { success: `Nest ${nest?.name ?? nestId} deleted.` };
}

// ---------------------------------------------------------------------------
// Eggs
// ---------------------------------------------------------------------------

function parseEggForm(formData: FormData) {
  return eggSchema.safeParse({
    nestId: formData.get("nestId"),
    name: formData.get("name"),
    description: text(formData, "description"),
    kind: formData.get("kind") ?? "game",
    author: text(formData, "author"),
    dockerImages: formData.get("dockerImages") ?? "{}",
    startup: formData.get("startup"),
    configFiles: formData.get("configFiles") ?? "{}",
    configStartup: formData.get("configStartup") ?? "{}",
    configLogs: formData.get("configLogs") ?? "{}",
    configStop: formData.get("configStop") ?? "^C",
    scriptContainer: formData.get("scriptContainer") ?? "ghcr.io/pterodactyl/installers:alpine",
    scriptEntry: formData.get("scriptEntry") ?? "ash",
    scriptInstall: formData.get("scriptInstall") ?? "",
    features: formData.get("features") ?? "[]",
    fileDenylist: formData.get("fileDenylist") ?? "[]",
    forceOutgoingIp: bool(formData, "forceOutgoingIp"),
    sortOrder: formData.get("sortOrder") ?? 0,
  });
}

export async function createEggAction(_prev: EggState, formData: FormData): Promise<EggState> {
  const admin = await requireAdmin();
  const parsed = parseEggForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const nest = await prisma.nest.findUnique({ where: { id: parsed.data.nestId } });
  if (!nest) return { error: "That nest no longer exists." };

  const clash = await prisma.egg.findFirst({ where: { nestId: nest.id, name: parsed.data.name } });
  if (clash) return { error: `"${parsed.data.name}" already exists in ${nest.name}.` };

  const egg = await prisma.egg.create({
    data: {
      uuid: uuid(),
      nestId: nest.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      kind: parsed.data.kind,
      author: parsed.data.author ?? "spanel@sadlystudios.bond",
      dockerImages: parsed.data.dockerImages,
      startup: parsed.data.startup,
      configFiles: parsed.data.configFiles,
      configStartup: parsed.data.configStartup,
      configLogs: parsed.data.configLogs,
      configStop: parsed.data.configStop,
      scriptContainer: parsed.data.scriptContainer,
      scriptEntry: parsed.data.scriptEntry,
      scriptInstall: parsed.data.scriptInstall,
      features: parsed.data.features,
      fileDenylist: parsed.data.fileDenylist,
      forceOutgoingIp: parsed.data.forceOutgoingIp,
      sortOrder: parsed.data.sortOrder,
    },
  });

  await logActivity({ event: "admin:egg.create", userId: admin.id, properties: { name: egg.name, nest: nest.name } });
  revalidatePath("/admin/eggs");

  const missing = missingStartupVariables(egg.startup, []);
  return {
    success: `${egg.name} created. Add its variables next.`,
    eggId: egg.id,
    warnings: missing.length > 0 ? [`The startup command references ${missing.join(", ")} — add matching variables.`] : undefined,
  };
}

export async function updateEggAction(_prev: EggState, formData: FormData): Promise<EggState> {
  const admin = await requireAdmin();
  const eggId = Number(formData.get("eggId"));
  if (!Number.isInteger(eggId)) return { error: "Invalid service." };

  const parsed = parseEggForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const existing = await prisma.egg.findUnique({ where: { id: eggId }, include: { variables: true } });
  if (!existing) return { error: "That service no longer exists." };

  const clash = await prisma.egg.findFirst({
    where: { nestId: parsed.data.nestId, name: parsed.data.name, id: { not: eggId } },
  });
  if (clash) return { error: `Another service in that nest is already called "${parsed.data.name}".` };

  const egg = await prisma.egg.update({
    where: { id: eggId },
    data: {
      nestId: parsed.data.nestId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      kind: parsed.data.kind,
      author: parsed.data.author ?? existing.author,
      dockerImages: parsed.data.dockerImages,
      startup: parsed.data.startup,
      configFiles: parsed.data.configFiles,
      configStartup: parsed.data.configStartup,
      configLogs: parsed.data.configLogs,
      configStop: parsed.data.configStop,
      scriptContainer: parsed.data.scriptContainer,
      scriptEntry: parsed.data.scriptEntry,
      scriptInstall: parsed.data.scriptInstall,
      features: parsed.data.features,
      fileDenylist: parsed.data.fileDenylist,
      forceOutgoingIp: parsed.data.forceOutgoingIp,
      sortOrder: parsed.data.sortOrder,
    },
  });

  const warnings: string[] = [];
  const missing = missingStartupVariables(egg.startup, existing.variables);
  if (missing.length > 0) warnings.push(`The startup command references undefined variable(s): ${missing.join(", ")}.`);

  const servers = await prisma.server.count({ where: { eggId } });
  if (servers > 0) {
    warnings.push(
      `${servers} existing server(s) use this service. Changes apply on their next sync; reinstall to re-run the install script.`,
    );
  }

  await logActivity({ event: "admin:egg.update", userId: admin.id, properties: { eggId, name: egg.name } });
  revalidatePath("/admin/eggs");
  return { success: `${egg.name} saved.`, warnings: warnings.length > 0 ? warnings : undefined, eggId: egg.id };
}

/** Renames an egg without touching anything else (quick inline edit). */
export async function renameEggAction(eggId: number, name: string): Promise<EggState> {
  const admin = await requireAdmin();
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return { error: "Enter a name between 1 and 80 characters." };

  const egg = await prisma.egg.findUnique({ where: { id: eggId }, select: { nestId: true } });
  if (!egg) return { error: "That service no longer exists." };

  const clash = await prisma.egg.findFirst({ where: { nestId: egg.nestId, name: trimmed, id: { not: eggId } } });
  if (clash) return { error: `Another service in that nest is already called "${trimmed}".` };

  await prisma.egg.update({ where: { id: eggId }, data: { name: trimmed } });
  await logActivity({ event: "admin:egg.rename", userId: admin.id, properties: { eggId, name: trimmed } });
  revalidatePath("/admin/eggs");
  return { success: `Renamed to ${trimmed}.` };
}

export async function deleteEggAction(eggId: number): Promise<EggState> {
  const admin = await requireAdmin();
  const servers = await prisma.server.count({ where: { eggId } });
  if (servers > 0) return { error: `${servers} server(s) still use this service. Delete or migrate them first.` };

  const egg = await prisma.egg.findUnique({ where: { id: eggId }, select: { name: true } });
  await prisma.egg.delete({ where: { id: eggId } });

  await logActivity({ event: "admin:egg.delete", userId: admin.id, properties: { name: egg?.name } });
  revalidatePath("/admin/eggs");
  return { success: `${egg?.name ?? "Service"} deleted.` };
}

/** Copies an egg (and its variables) into the same nest. */
export async function duplicateEggAction(eggId: number): Promise<EggState> {
  const admin = await requireAdmin();
  const source = await prisma.egg.findUnique({ where: { id: eggId }, include: { variables: true } });
  if (!source) return { error: "That service no longer exists." };

  let name = `${source.name} (copy)`;
  for (let attempt = 2; attempt < 50; attempt += 1) {
    const clash = await prisma.egg.findFirst({ where: { nestId: source.nestId, name } });
    if (!clash) break;
    name = `${source.name} (copy ${attempt})`;
  }

  const created = await prisma.egg.create({
    data: {
      uuid: uuid(),
      nestId: source.nestId,
      name,
      description: source.description,
      kind: source.kind,
      author: source.author,
      dockerImages: source.dockerImages,
      startup: source.startup,
      configFiles: source.configFiles,
      configStartup: source.configStartup,
      configLogs: source.configLogs,
      configStop: source.configStop,
      scriptContainer: source.scriptContainer,
      scriptEntry: source.scriptEntry,
      scriptInstall: source.scriptInstall,
      features: source.features,
      fileDenylist: source.fileDenylist,
      forceOutgoingIp: source.forceOutgoingIp,
      sortOrder: source.sortOrder,
      variables: {
        create: source.variables.map((variable) => ({
          name: variable.name,
          description: variable.description,
          envVariable: variable.envVariable,
          defaultValue: variable.defaultValue,
          userViewable: variable.userViewable,
          userEditable: variable.userEditable,
          rules: variable.rules,
          sortOrder: variable.sortOrder,
        })),
      },
    },
  });

  await logActivity({ event: "admin:egg.duplicate", userId: admin.id, properties: { from: source.name, to: created.name } });
  revalidatePath("/admin/eggs");
  return { success: `Copied to ${created.name}.`, eggId: created.id };
}

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

function parseVariableForm(formData: FormData) {
  return eggVariableSchema.safeParse({
    name: formData.get("name"),
    description: text(formData, "description"),
    envVariable: formData.get("envVariable"),
    defaultValue: formData.get("defaultValue") ?? "",
    userViewable: bool(formData, "userViewable"),
    userEditable: bool(formData, "userEditable"),
    rules: formData.get("rules") || "nullable|string",
    sortOrder: formData.get("sortOrder") ?? 0,
  });
}

export async function createEggVariableAction(_prev: EggState, formData: FormData): Promise<EggState> {
  const admin = await requireAdmin();
  const eggId = Number(formData.get("eggId"));
  if (!Number.isInteger(eggId)) return { error: "Invalid service." };

  const parsed = parseVariableForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const clash = await prisma.eggVariable.findUnique({
    where: { eggId_envVariable: { eggId, envVariable: parsed.data.envVariable } },
  });
  if (clash) return { error: `${parsed.data.envVariable} is already defined for this service.` };

  const count = await prisma.eggVariable.count({ where: { eggId } });
  await prisma.eggVariable.create({
    data: {
      eggId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      envVariable: parsed.data.envVariable,
      defaultValue: parsed.data.defaultValue,
      userViewable: parsed.data.userViewable,
      userEditable: parsed.data.userEditable,
      rules: parsed.data.rules,
      sortOrder: parsed.data.sortOrder || count,
    },
  });

  await logActivity({
    event: "admin:egg.variable.create",
    userId: admin.id,
    properties: { eggId, envVariable: parsed.data.envVariable },
  });
  revalidatePath("/admin/eggs");
  return { success: `${parsed.data.envVariable} added.`, eggId };
}

export async function updateEggVariableAction(_prev: EggState, formData: FormData): Promise<EggState> {
  await requireAdmin();
  const variableId = Number(formData.get("variableId"));
  if (!Number.isInteger(variableId)) return { error: "Invalid variable." };

  const parsed = parseVariableForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const existing = await prisma.eggVariable.findUnique({ where: { id: variableId } });
  if (!existing) return { error: "That variable no longer exists." };

  if (parsed.data.envVariable !== existing.envVariable) {
    const clash = await prisma.eggVariable.findUnique({
      where: { eggId_envVariable: { eggId: existing.eggId, envVariable: parsed.data.envVariable } },
    });
    if (clash) return { error: `${parsed.data.envVariable} is already defined for this service.` };
  }

  await prisma.eggVariable.update({
    where: { id: variableId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      envVariable: parsed.data.envVariable,
      defaultValue: parsed.data.defaultValue,
      userViewable: parsed.data.userViewable,
      userEditable: parsed.data.userEditable,
      rules: parsed.data.rules,
      sortOrder: parsed.data.sortOrder,
    },
  });

  revalidatePath("/admin/eggs");
  return { success: `${parsed.data.envVariable} saved.`, eggId: existing.eggId };
}

export async function deleteEggVariableAction(variableId: number): Promise<EggState> {
  await requireAdmin();
  const variable = await prisma.eggVariable.findUnique({ where: { id: variableId } });
  if (!variable) return { error: "That variable no longer exists." };

  const inUse = await prisma.serverVariable.count({ where: { variableId } });
  await prisma.eggVariable.delete({ where: { id: variableId } });

  revalidatePath("/admin/eggs");
  return {
    success: `${variable.envVariable} removed.`,
    warnings: inUse > 0 ? [`${inUse} server value(s) were removed with it.`] : undefined,
    eggId: variable.eggId,
  };
}

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

export async function importEggAction(_prev: EggState, formData: FormData): Promise<EggState> {
  const admin = await requireAdmin();

  const nestIdRaw = formData.get("nestId");
  const newNestName = text(formData, "newNestName");
  const overwrite = bool(formData, "overwrite");

  // The JSON may arrive as an uploaded file or pasted into a textarea.
  let raw = "";
  const upload = formData.get("file");
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > 2 * 1024 * 1024) return { error: "Egg files are limited to 2 MiB." };
    raw = await upload.text();
  } else {
    raw = String(formData.get("json") ?? "");
  }
  if (!raw.trim()) return { error: "Upload an egg JSON file or paste its contents." };

  const parsed = parseEggFile(raw);
  if (!parsed.ok) return { error: parsed.error };
  const imported = parsed.egg;

  // Resolve the destination nest.
  let nestId = Number(nestIdRaw);
  if (!Number.isInteger(nestId) || nestId <= 0) {
    const wanted = newNestName ?? imported.suggestedNest ?? "Imported";
    const existing = await prisma.nest.findFirst({ where: { name: wanted } });
    nestId = existing
      ? existing.id
      : (
          await prisma.nest.create({
            data: { uuid: uuid(), name: wanted, description: "Created by egg import.", icon: "package" },
          })
        ).id;
  } else if (!(await prisma.nest.findUnique({ where: { id: nestId } }))) {
    return { error: "That nest no longer exists." };
  }

  const warnings = [...imported.warnings];

  const data = {
    nestId,
    name: imported.name,
    description: imported.description,
    kind: imported.kind,
    author: imported.author,
    dockerImages: JSON.stringify(imported.dockerImages),
    startup: imported.startup,
    configFiles: imported.configFiles,
    configStartup: imported.configStartup,
    configLogs: imported.configLogs,
    configStop: imported.configStop,
    scriptContainer: imported.scriptContainer,
    scriptEntry: imported.scriptEntry,
    scriptInstall: imported.scriptInstall,
    features: JSON.stringify(imported.features),
    fileDenylist: JSON.stringify(imported.fileDenylist),
    forceOutgoingIp: imported.forceOutgoingIp,
    sortOrder: imported.sortOrder,
  };

  // Match on the file's uuid first (a re-import of the same egg), then on name.
  const existing =
    (imported.uuid ? await prisma.egg.findUnique({ where: { uuid: imported.uuid } }) : null) ??
    (await prisma.egg.findFirst({ where: { nestId, name: imported.name } }));

  if (existing && !overwrite) {
    return {
      error: `"${imported.name}" already exists in that nest. Enable "overwrite" to update it in place.`,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  const egg = existing
    ? await prisma.egg.update({ where: { id: existing.id }, data })
    : await prisma.egg.create({ data: { ...data, uuid: imported.uuid ?? uuid() } });

  // Variables: upsert by env var, then drop the ones the file no longer defines.
  const keep = new Set<string>();
  for (const variable of imported.variables) {
    keep.add(variable.envVariable);
    await prisma.eggVariable.upsert({
      where: { eggId_envVariable: { eggId: egg.id, envVariable: variable.envVariable } },
      create: {
        eggId: egg.id,
        name: variable.name,
        description: variable.description,
        envVariable: variable.envVariable,
        defaultValue: variable.defaultValue,
        userViewable: variable.userViewable,
        userEditable: variable.userEditable,
        rules: variable.rules,
        sortOrder: variable.sortOrder,
      },
      update: {
        name: variable.name,
        description: variable.description,
        defaultValue: variable.defaultValue,
        userViewable: variable.userViewable,
        userEditable: variable.userEditable,
        rules: variable.rules,
        sortOrder: variable.sortOrder,
      },
    });
  }

  if (existing) {
    const removed = await prisma.eggVariable.deleteMany({
      where: { eggId: egg.id, envVariable: { notIn: [...keep] } },
    });
    if (removed.count > 0) warnings.push(`${removed.count} variable(s) not present in the file were removed.`);

    const servers = await prisma.server.count({ where: { eggId: egg.id } });
    if (servers > 0) warnings.push(`${servers} existing server(s) use this service and will pick up the changes on next sync.`);
  }

  const missing = missingStartupVariables(egg.startup, imported.variables);
  if (missing.length > 0) warnings.push(`Startup references undefined variable(s): ${missing.join(", ")}.`);

  await logActivity({
    event: existing ? "admin:egg.import.update" : "admin:egg.import.create",
    userId: admin.id,
    properties: { name: egg.name, variables: imported.variables.length },
  });

  revalidatePath("/admin/eggs");
  return {
    success: `${egg.name} ${existing ? "updated" : "imported"} with ${imported.variables.length} variable(s).`,
    warnings: warnings.length > 0 ? warnings : undefined,
    eggId: egg.id,
  };
}

export interface EggExport {
  ok: boolean;
  error?: string;
  fileName?: string;
  json?: string;
}

/** Returns the egg as a Pterodactyl-compatible JSON document. */
export async function exportEggAction(eggId: number): Promise<EggExport> {
  await requireAdmin();
  const egg = await prisma.egg.findUnique({
    where: { id: eggId },
    include: { variables: true, nest: { select: { name: true } } },
  });
  if (!egg) return { ok: false, error: "That service no longer exists." };

  return { ok: true, fileName: exportFileName(egg), json: serialiseEgg(egg) };
}

/** Exports every egg in a nest as one JSON array. */
export async function exportNestAction(nestId: number): Promise<EggExport> {
  await requireAdmin();
  const nest = await prisma.nest.findUnique({
    where: { id: nestId },
    include: { eggs: { include: { variables: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
  if (!nest) return { ok: false, error: "That nest no longer exists." };
  if (nest.eggs.length === 0) return { ok: false, error: "That nest has no services to export." };

  const documents = nest.eggs.map((egg) => JSON.parse(serialiseEgg({ ...egg, nest: { name: nest.name } })) as unknown);
  const slug = nest.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  return { ok: true, fileName: `nest-${slug || "services"}.json`, json: JSON.stringify(documents, null, 2) };
}

import type { Egg, EggVariable, Nest } from "@prisma/client";
import { z } from "zod";
import { SERVICE_KINDS } from "../constants";
import { parseJsonSafe } from "../utils";

/**
 * Pterodactyl-compatible egg import/export.
 *
 * Export produces the familiar `_comment` + `meta.version: PTDL_v2` envelope so
 * files can be dropped straight into a Pterodactyl panel. Import accepts both
 * PTDL_v1 (flat `variables`, no `config.extends`) and PTDL_v2, plus SPanel's own
 * export which simply adds a `spanel` block for the fields Pterodactyl lacks
 * (service kind, sort order).
 *
 * Docker images are the one shape difference between versions: v1 used a plain
 * array of image names, v2 uses a `{ label: image }` map. Both are normalised to
 * the map SPanel stores.
 */

export const EXPORT_VERSION = "PTDL_v2";
const EXPORT_COMMENT = "DO NOT EDIT: FILE GENERATED AUTOMATICALLY BY SPANEL";

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Pterodactyl nests the install script under `scripts.installation.script`.
 * Some hand-written eggs use `installation` for that field instead, so both are
 * accepted and the first non-empty one wins.
 */
const scriptSchema = z.object({
  script: z.string().nullish(),
  installation: z.string().nullish(),
  entrypoint: z.string().nullish(),
  container: z.string().nullish(),
});

const variableSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().nullish(),
  env_variable: z
    .string()
    .trim()
    .min(1)
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Environment variable names must be alphanumeric with underscores."),
  default_value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  user_viewable: z.union([z.boolean(), z.number(), z.string()]).optional(),
  user_editable: z.union([z.boolean(), z.number(), z.string()]).optional(),
  rules: z.string().nullish(),
  field_type: z.string().nullish(),
});

const eggFileSchema = z.object({
  _comment: z.string().optional(),
  meta: z.object({ version: z.string().optional(), update_url: z.string().nullish() }).optional(),
  exported_at: z.string().optional(),
  name: z.string().trim().min(1, "The egg needs a name."),
  author: z.string().trim().optional(),
  uuid: z.string().trim().optional(),
  description: z.string().nullish(),
  features: z.union([z.array(z.string()), z.null()]).optional(),
  /** v2: map of label -> image. v1: array of images. */
  docker_images: z.union([z.record(z.string(), z.string()), z.array(z.string())]).optional(),
  /** v1 single image field. */
  image: z.string().optional(),
  file_denylist: z.union([z.array(z.string()), z.null()]).optional(),
  startup: z.string().trim().min(1, "The egg needs a startup command."),
  config: z
    .object({
      files: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
      startup: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
      logs: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
      stop: z.string().optional(),
      extends: z.string().nullish(),
    })
    .default({}),
  scripts: z.object({ installation: scriptSchema.optional() }).optional(),
  variables: z.array(variableSchema).default([]),
  /** SPanel extension: fields Pterodactyl has no concept of. */
  spanel: z
    .object({
      kind: z.enum(SERVICE_KINDS).optional(),
      sortOrder: z.coerce.number().int().optional(),
      forceOutgoingIp: z.boolean().optional(),
      nest: z.string().optional(),
    })
    .optional(),
});

export type EggFile = z.infer<typeof eggFileSchema>;

export interface ImportedVariable {
  name: string;
  description: string | null;
  envVariable: string;
  defaultValue: string;
  userViewable: boolean;
  userEditable: boolean;
  rules: string;
  sortOrder: number;
}

export interface ImportedEgg {
  name: string;
  description: string | null;
  author: string;
  uuid: string | null;
  kind: string;
  dockerImages: Record<string, string>;
  startup: string;
  configFiles: string;
  configStartup: string;
  configLogs: string;
  configStop: string;
  scriptContainer: string;
  scriptEntry: string;
  scriptInstall: string;
  features: string[];
  fileDenylist: string[];
  forceOutgoingIp: boolean;
  sortOrder: number;
  variables: ImportedVariable[];
  /** Nest name suggested by the file (SPanel export or v1 `author`-less files). */
  suggestedNest: string | null;
  /** Non-fatal notes worth surfacing to the admin. */
  warnings: string[];
}

function truthy(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

/** Config blocks may arrive as objects or as JSON-encoded strings. */
function normaliseConfigBlock(value: unknown, warnings: string[], label: string): string {
  if (value === undefined || value === null) return "{}";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "{}";
    try {
      return JSON.stringify(JSON.parse(trimmed));
    } catch {
      warnings.push(`config.${label} was not valid JSON and has been reset to {}.`);
      return "{}";
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    warnings.push(`config.${label} could not be serialised and has been reset to {}.`);
    return "{}";
  }
}

function normaliseImages(file: EggFile, warnings: string[]): Record<string, string> {
  const images: Record<string, string> = {};

  if (Array.isArray(file.docker_images)) {
    // PTDL_v1 style: derive a label from the tag.
    for (const image of file.docker_images) {
      const label = image.includes(":") ? image.slice(image.lastIndexOf(":") + 1) : image;
      images[label] = image;
    }
  } else if (file.docker_images && typeof file.docker_images === "object") {
    for (const [label, image] of Object.entries(file.docker_images)) {
      if (typeof image === "string" && image.trim()) images[label.trim() || image] = image.trim();
    }
  }

  if (Object.keys(images).length === 0 && file.image) {
    images[file.image.includes(":") ? file.image.slice(file.image.lastIndexOf(":") + 1) : "default"] = file.image;
  }

  if (Object.keys(images).length === 0) {
    warnings.push("No docker images were listed; add at least one before deploying servers with this egg.");
  }

  return images;
}

/** Guesses the service kind so webhost/application eggs land in the right flow. */
function inferKind(file: EggFile, features: string[]): string {
  if (file.spanel?.kind) return file.spanel.kind;
  if (features.includes("webhost")) return "webhost";

  const haystack = `${file.name} ${file.description ?? ""} ${file.startup}`.toLowerCase();
  if (/nginx|php-fpm|apache|httpd|wordpress/.test(haystack)) return "webhost";
  if (/node|python|bot|discord|npm |yarn |pnpm |dotnet|java -jar app/.test(haystack) && !/minecraft|spigot|paper|bukkit/.test(haystack)) {
    return "application";
  }
  return "game";
}

export interface ImportResult {
  ok: true;
  egg: ImportedEgg;
}

export interface ImportFailure {
  ok: false;
  error: string;
}

/** Parses a Pterodactyl/SPanel egg JSON document. */
export function parseEggFile(raw: string): ImportResult | ImportFailure {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `The file is not valid JSON: ${error instanceof Error ? error.message : "parse error"}` };
  }

  const parsed = eggFileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".");
    return { ok: false, error: `${path ? `${path}: ` : ""}${issue?.message ?? "The egg file is not in a supported format."}` };
  }

  const file = parsed.data;
  const warnings: string[] = [];

  const version = file.meta?.version ?? "unknown";
  if (version !== "PTDL_v1" && version !== "PTDL_v2" && version !== "unknown") {
    warnings.push(`Unrecognised egg format "${version}"; imported on a best-effort basis.`);
  }
  if (file.config.extends) {
    warnings.push(
      `This egg extends "${file.config.extends}". SPanel does not inherit configuration, so review the config blocks.`,
    );
  }

  const features = Array.isArray(file.features) ? file.features.filter((f) => typeof f === "string") : [];
  const denylist = Array.isArray(file.file_denylist) ? file.file_denylist.filter((f) => typeof f === "string") : [];

  const seen = new Set<string>();
  const variables: ImportedVariable[] = [];
  file.variables.forEach((variable, index) => {
    const envVariable = variable.env_variable.trim().toUpperCase();
    if (seen.has(envVariable)) {
      warnings.push(`Duplicate variable ${envVariable} was skipped.`);
      return;
    }
    seen.add(envVariable);
    variables.push({
      name: variable.name.trim(),
      description: variable.description?.trim() || null,
      envVariable,
      defaultValue: variable.default_value === null || variable.default_value === undefined ? "" : String(variable.default_value),
      userViewable: truthy(variable.user_viewable),
      userEditable: truthy(variable.user_editable),
      rules: variable.rules?.trim() || "nullable|string",
      sortOrder: index,
    });
  });

  const script = file.scripts?.installation ?? {};

  return {
    ok: true,
    egg: {
      name: file.name.trim(),
      description: file.description?.trim() || null,
      author: file.author?.trim() || "spanel@sadlystudios.bond",
      uuid: file.uuid?.trim() || null,
      kind: inferKind(file, features),
      dockerImages: normaliseImages(file, warnings),
      startup: file.startup.trim(),
      configFiles: normaliseConfigBlock(file.config.files, warnings, "files"),
      configStartup: normaliseConfigBlock(file.config.startup, warnings, "startup"),
      configLogs: normaliseConfigBlock(file.config.logs, warnings, "logs"),
      configStop: file.config.stop?.trim() || "^C",
      scriptContainer: script.container?.trim() || "ghcr.io/pterodactyl/installers:alpine",
      scriptEntry: script.entrypoint?.trim() || "ash",
      scriptInstall: script.script ?? script.installation ?? "",
      features,
      fileDenylist: denylist,
      forceOutgoingIp: file.spanel?.forceOutgoingIp ?? false,
      sortOrder: file.spanel?.sortOrder ?? 0,
      variables,
      suggestedNest: file.spanel?.nest?.trim() || null,
      warnings,
    },
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type ExportableEgg = Egg & { variables: EggVariable[]; nest?: Pick<Nest, "name"> | null };

/** Serialises an egg into a Pterodactyl-compatible JSON document. */
export function serialiseEgg(egg: ExportableEgg): string {
  const document = {
    _comment: EXPORT_COMMENT,
    meta: { version: EXPORT_VERSION, update_url: null },
    exported_at: new Date().toISOString(),
    name: egg.name,
    author: egg.author,
    uuid: egg.uuid,
    description: egg.description,
    features: parseJsonSafe<string[]>(egg.features, []),
    docker_images: parseJsonSafe<Record<string, string>>(egg.dockerImages, {}),
    file_denylist: parseJsonSafe<string[]>(egg.fileDenylist, []),
    startup: egg.startup,
    config: {
      files: egg.configFiles || "{}",
      startup: egg.configStartup || "{}",
      logs: egg.configLogs || "{}",
      stop: egg.configStop,
    },
    scripts: {
      installation: {
        script: egg.scriptInstall,
        container: egg.scriptContainer,
        entrypoint: egg.scriptEntry,
      },
    },
    variables: [...egg.variables]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((variable) => ({
        name: variable.name,
        description: variable.description ?? "",
        env_variable: variable.envVariable,
        default_value: variable.defaultValue,
        user_viewable: variable.userViewable,
        user_editable: variable.userEditable,
        rules: variable.rules,
        field_type: "text",
      })),
    spanel: {
      kind: egg.kind,
      sortOrder: egg.sortOrder,
      forceOutgoingIp: egg.forceOutgoingIp,
      nest: egg.nest?.name ?? null,
    },
  };

  return JSON.stringify(document, null, 2);
}

/** Filename Pterodactyl uses: egg-<slug>.json */
export function exportFileName(egg: Pick<Egg, "name">): string {
  const slug = egg.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `egg-${slug || "service"}.json`;
}

/**
 * Pterodactyl's install scripts sometimes reference variables SPanel would not
 * otherwise create. Reports env vars used in the startup command that have no
 * matching variable, so the admin can add them.
 */
export function missingStartupVariables(startup: string, variables: { envVariable: string }[]): string[] {
  const provided = new Set(variables.map((variable) => variable.envVariable.toUpperCase()));
  const builtins = new Set([
    "SERVER_MEMORY",
    "SERVER_DISK",
    "SERVER_IP",
    "SERVER_PORT",
    "SERVER_UUID",
    "P_SERVER_UUID",
    "P_SERVER_ALLOCATION_LIMIT",
    "DOCUMENT_ROOT",
    "WEB_RUNTIME",
    "PHP_VERSION",
    "TZ",
    "STARTUP",
  ]);

  const missing = new Set<string>();
  for (const match of startup.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    const name = match[1]!.toUpperCase();
    if (!provided.has(name) && !builtins.has(name)) missing.add(name);
  }
  return [...missing];
}

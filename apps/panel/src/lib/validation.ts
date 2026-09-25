import { z } from "zod";
import {
  BINDING_KINDS,
  HTTPS_MODES,
  PHP_VERSIONS,
  POWER_ACTIONS,
  SERVICE_KINDS,
  USER_ROLES,
  WEB_RUNTIMES,
} from "./constants";

export const identifierSchema = z
  .string()
  .min(3, "At least 3 characters.")
  .max(32, "At most 32 characters.")
  .regex(/^[a-z0-9._-]+$/i, "Only letters, numbers, dots, dashes and underscores.");

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters.")
  .max(128)
  .regex(/[a-z]/, "Needs a lowercase letter.")
  .regex(/[A-Z]/, "Needs an uppercase letter.")
  .regex(/[0-9]/, "Needs a number.");

/** Configurable password policy, sourced from the security.* settings. */
export interface PasswordPolicy {
  minLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUpper: true,
  requireLower: true,
  requireNumber: true,
  requireSymbol: false,
};

/**
 * Builds a Zod string schema from a password policy so auth flows can enforce
 * configurable requirements. The fixed `passwordSchema` above is kept for the
 * existing forms; new flows should call this with the current settings.
 */
export function buildPasswordSchema(policy: Partial<PasswordPolicy> = {}): z.ZodString {
  const merged = { ...DEFAULT_PASSWORD_POLICY, ...policy };
  const min = Math.min(Math.max(Math.trunc(merged.minLength) || 1, 1), 128);
  let schema = z.string().min(min, `At least ${min} characters.`).max(128);
  if (merged.requireLower) schema = schema.regex(/[a-z]/, "Needs a lowercase letter.");
  if (merged.requireUpper) schema = schema.regex(/[A-Z]/, "Needs an uppercase letter.");
  if (merged.requireNumber) schema = schema.regex(/[0-9]/, "Needs a number.");
  if (merged.requireSymbol) schema = schema.regex(/[^A-Za-z0-9]/, "Needs a symbol.");
  return schema;
}

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60),
  lastName: z.string().trim().min(1, "Last name is required.").max(60),
  username: identifierSchema,
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: passwordSchema,
  passwordConfirm: z.string(),
}).refine((data) => data.password === data.passwordConfirm, {
  message: "Passwords do not match.",
  path: ["passwordConfirm"],
});

/**
 * Registration schema built against a configurable password policy. The static
 * `registerSchema` above is kept for existing callers/tests; new flows call this
 * with the current security.* settings so the password rules stay in sync.
 */
export function buildRegisterSchema(passwordPolicySchema: z.ZodString) {
  return z
    .object({
      firstName: z.string().trim().min(1, "First name is required.").max(60),
      lastName: z.string().trim().min(1, "Last name is required.").max(60),
      username: identifierSchema,
      email: z.string().trim().toLowerCase().email("Enter a valid email address."),
      password: passwordPolicySchema,
      passwordConfirm: z.string(),
    })
    .refine((data) => data.password === data.passwordConfirm, {
      message: "Passwords do not match.",
      path: ["passwordConfirm"],
    });
}

export const loginSchema = z.object({
  identity: z.string().trim().min(1, "Enter your username or email."),
  password: z.string().min(1, "Enter your password."),
  remember: z.boolean().optional(),
  totp: z.string().trim().optional(),
});

export const userCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  username: identifierSchema,
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  role: z.enum(USER_ROLES),
  isActive: z.boolean().default(true),
});

export const userUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  username: identifierSchema,
  email: z.string().trim().toLowerCase().email(),
  password: z.union([passwordSchema, z.literal("")]).optional(),
  role: z.enum(USER_ROLES),
  isActive: z.boolean().default(true),
});

export const nodeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  locationId: z.coerce.number().int().positive().nullable().optional(),
  fqdn: z
    .string()
    .trim()
    .min(1, "FQDN or IP is required.")
    .regex(/^[a-zA-Z0-9.\-:]+$/, "Enter a hostname or IP address."),
  scheme: z.enum(["http", "https"]),
  behindProxy: z.boolean().default(false),
  public: z.boolean().default(true),
  maintenanceMode: z.boolean().default(false),
  memory: z.coerce.number().int().min(0),
  memoryOverallocate: z.coerce.number().int().min(-1).max(1000),
  disk: z.coerce.number().int().min(0),
  diskOverallocate: z.coerce.number().int().min(-1).max(1000),
  cpu: z.coerce.number().int().min(0),
  cpuOverallocate: z.coerce.number().int().min(-1).max(1000),
  uploadSize: z.coerce.number().int().min(1).max(4096),
  daemonBase: z.string().trim().min(1),
  daemonListenHost: z.string().trim().max(255).default(""),
  daemonPort: z.coerce.number().int().min(1).max(65535),
  daemonSftpPort: z.coerce.number().int().min(1).max(65535),
  proxyEnabled: z.boolean().default(true),
  proxyHttpPort: z.coerce.number().int().min(1).max(65535).default(80),
  proxyHttpsPort: z.coerce.number().int().min(1).max(65535).default(443),
});

export const allocationSchema = z.object({
  nodeId: z.coerce.number().int().positive(),
  ip: z
    .string()
    .trim()
    .min(1)
    .regex(/^[0-9a-fA-F.:]+$/, "Enter a valid IPv4/IPv6 address."),
  ipAlias: z.string().trim().max(120).optional(),
  /** Supports "25565", "25565-25570" and comma separated combinations. */
  ports: z
    .string()
    .trim()
    .min(1, "Enter one or more ports.")
    .regex(/^[0-9,\s-]+$/, "Use numbers, commas and dashes only."),
  notes: z.string().trim().max(255).optional(),
});

export const domainSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter a valid domain, e.g. example.com"),
  nodeId: z.coerce.number().int().positive().nullable().optional(),
  isPublic: z.boolean().default(true),
  wildcardDns: z.boolean().default(false),
  targetIp: z.string().trim().max(60).optional(),
  dnsProvider: z.enum(["manual", "cloudflare"]).default("manual"),
  dnsZoneId: z.string().trim().max(120).optional(),
  dnsApiToken: z.string().trim().max(400).optional(),
});

export const subdomainSchema = z.object({
  domainId: z.coerce.number().int().positive(),
  label: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(63)
    .regex(/^(?!-)[a-z0-9-]+(?<!-)$/, "Use letters, numbers and dashes."),
  serverId: z.coerce.number().int().positive().nullable().optional(),
  recordType: z.enum(["A", "CNAME", "SRV"]).default("A"),
  target: z.string().trim().max(255).optional(),
});

export const bindingSchema = z.object({
  serverId: z.coerce.number().int().positive(),
  mode: z.enum(["subdomain", "custom"]),
  domainId: z.coerce.number().int().positive().optional(),
  label: z.string().trim().toLowerCase().max(63).optional(),
  hostname: z.string().trim().toLowerCase().max(255).optional(),
  kind: z.enum(BINDING_KINDS).default("http"),
  httpsMode: z.enum(HTTPS_MODES).default("auto"),
  forceHttps: z.boolean().default(true),
  targetPort: z.coerce.number().int().min(1).max(65535).nullable().optional(),
  isPrimary: z.boolean().default(false),
});

export const databaseHostSchema = z.object({
  name: z.string().trim().min(1).max(80),
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(3306),
  username: z.string().trim().min(1).max(80),
  password: z.string().max(255).optional(),
  maxDatabases: z.coerce.number().int().min(0).default(0),
  phpMyAdminUrl: z.string().trim().max(255).optional(),
  nodeId: z.coerce.number().int().positive().nullable().optional(),
});

export const smtpSchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().trim().max(255),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().trim().max(255),
  password: z.string().max(255).optional(),
  encryption: z.enum(["none", "tls", "ssl"]),
  fromAddress: z.union([z.string().trim().toLowerCase().email(), z.literal("")]),
  fromName: z.string().trim().max(120),
});

export const brandingSchema = z.object({
  siteName: z.string().trim().min(1).max(60),
  siteUrl: z.string().trim().max(255),
  siteDescription: z.string().trim().max(255),
  siteAccent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #f5f5f3"),
  registrationOpen: z.boolean().default(false),
  defaultServerLimit: z.coerce.number().int().min(0).max(1000).default(2),
});

export const serverCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Server name is required.").max(80),
    description: z.string().trim().max(500).optional(),
    ownerId: z.coerce.number().int().positive().optional(),
    nodeId: z.coerce.number().int().positive(),
    eggId: z.coerce.number().int().positive(),
    // Optional catalogue references. Limits are still submitted explicitly
    // below (copied from the plan in the wizard, editable before deploy).
    planId: z.coerce.number().int().positive().optional(),
    packageId: z.coerce.number().int().positive().optional(),
    dockerImage: z.string().trim().min(1),
    allocationId: z.coerce.number().int().positive(),
    additionalAllocationIds: z.array(z.coerce.number().int().positive()).default([]),
    memory: z.coerce.number().int().min(0).max(1_048_576),
    swap: z.coerce.number().int().min(-1).max(1_048_576).default(0),
    disk: z.coerce.number().int().min(64).max(10_485_760),
    cpu: z.coerce.number().int().min(0).max(6400),
    io: z.coerce.number().int().min(10).max(1000).default(500),
    threads: z.string().trim().max(60).optional(),
    oomKiller: z.boolean().default(false),
    databaseLimit: z.coerce.number().int().min(0).max(100).default(2),
    allocationLimit: z.coerce.number().int().min(0).max(100).default(2),
    backupLimit: z.coerce.number().int().min(0).max(100).default(3),
    startOnCompletion: z.boolean().default(true),
    skipScripts: z.boolean().default(false),
    // webhost specific
    webRuntime: z.enum(WEB_RUNTIMES).optional(),
    phpVersion: z.enum(PHP_VERSIONS).optional(),
    documentRoot: z.string().trim().max(160).default("/"),
    // hostname wiring
    hostnameMode: z.enum(["none", "subdomain", "custom"]).default("none"),
    domainId: z.coerce.number().int().positive().optional(),
    subdomainLabel: z.string().trim().toLowerCase().max(63).optional(),
    customHostname: z.string().trim().toLowerCase().max(255).optional(),
    environment: z.record(z.string(), z.string()).default({}),
  })
  .superRefine((data, ctx) => {
    if (data.hostnameMode === "subdomain") {
      if (!data.domainId) ctx.addIssue({ code: "custom", path: ["domainId"], message: "Pick a domain." });
      if (!data.subdomainLabel)
        ctx.addIssue({ code: "custom", path: ["subdomainLabel"], message: "Enter a subdomain label." });
    }
    if (data.hostnameMode === "custom" && !data.customHostname) {
      ctx.addIssue({ code: "custom", path: ["customHostname"], message: "Enter the hostname." });
    }
  });

export const serverBuildSchema = z.object({
  memory: z.coerce.number().int().min(0).max(1_048_576),
  swap: z.coerce.number().int().min(-1).max(1_048_576),
  disk: z.coerce.number().int().min(64).max(10_485_760),
  cpu: z.coerce.number().int().min(0).max(6400),
  io: z.coerce.number().int().min(10).max(1000),
  threads: z.string().trim().max(60).optional(),
  oomKiller: z.boolean().default(false),
  databaseLimit: z.coerce.number().int().min(0).max(100),
  allocationLimit: z.coerce.number().int().min(0).max(100),
  backupLimit: z.coerce.number().int().min(0).max(100),
});

/** Resource-limit fields shared by Server builds and Plan templates. */
const resourceLimitShape = {
  memory: z.coerce.number().int().min(0).max(1_048_576),
  swap: z.coerce.number().int().min(-1).max(1_048_576).default(0),
  disk: z.coerce.number().int().min(64).max(10_485_760),
  cpu: z.coerce.number().int().min(0).max(6400),
  io: z.coerce.number().int().min(10).max(1000).default(500),
  threads: z.string().trim().max(60).optional(),
  oomKiller: z.boolean().default(false),
  databaseLimit: z.coerce.number().int().min(0).max(100).default(2),
  allocationLimit: z.coerce.number().int().min(0).max(100).default(2),
  backupLimit: z.coerce.number().int().min(0).max(100).default(3),
};

export const planSchema = z.object({
  name: z.string().trim().min(1, "A plan name is required.").max(80),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  ...resourceLimitShape,
});

export const packageSchema = z.object({
  name: z.string().trim().min(1, "A package name is required.").max(80),
  description: z.string().trim().max(500).optional(),
  isPublic: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  planId: z.coerce.number().int().positive({ message: "Pick a plan." }),
  eggId: z.coerce.number().int().positive({ message: "Pick a default service." }),
  nestId: z.coerce.number().int().positive().nullable().optional(),
});

export type PlanInput = z.infer<typeof planSchema>;
export type PackageInput = z.infer<typeof packageSchema>;

/**
 * A host path an admin exposes into a container. Both source (host) and target
 * (container) must be absolute-ish, non-empty paths. Host paths are sensitive,
 * so this is only ever validated behind requireAdmin — clients never set them.
 */
const mountPath = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(500)
    .refine((value) => value.startsWith("/"), { message: `${label} must be an absolute path (start with /).` })
    .refine((value) => !value.includes(".."), { message: `${label} cannot contain "..".` })
    .refine((value) => !value.includes("\0"), { message: `${label} is not a valid path.` });

export const mountSchema = z.object({
  name: z.string().trim().min(1, "A mount name is required.").max(80),
  description: z.string().trim().max(500).optional(),
  source: mountPath("Source path"),
  target: mountPath("Target path"),
  readOnly: z.boolean().default(true),
  userMountable: z.boolean().default(false),
  nodeIds: z.array(z.coerce.number().int().positive()).default([]),
  eggIds: z.array(z.coerce.number().int().positive()).default([]),
});

export type MountInput = z.infer<typeof mountSchema>;

export const powerSchema = z.object({ action: z.enum(POWER_ACTIONS) });

export const commandSchema = z.object({ command: z.string().min(1).max(2000) });

/** A single cron field: star, step, list, range or combination. */
const cronField = z
  .string()
  .trim()
  .min(1, "A cron field cannot be empty.")
  .max(120)
  .regex(/^[0-9*,/-]+$/, "Cron fields use only digits, and the characters * , / -");

export const scheduleSchema = z.object({
  name: z.string().trim().min(1, "A schedule name is required.").max(80),
  cronMinute: cronField.default("*/5"),
  cronHour: cronField.default("*"),
  cronDayMonth: cronField.default("*"),
  cronMonth: cronField.default("*"),
  cronDayWeek: cronField.default("*"),
  isActive: z.boolean().default(true),
  onlyWhenOnline: z.boolean().default(false),
});

export const TASK_ACTIONS = ["command", "power", "backup"] as const;

export const taskSchema = z
  .object({
    action: z.enum(TASK_ACTIONS),
    payload: z.string().trim().max(2000).default(""),
    timeOffset: z.coerce.number().int().min(0).max(900).default(0),
    continueOnFailure: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.action === "command" && !data.payload) {
      ctx.addIssue({ code: "custom", path: ["payload"], message: "Enter the command to run." });
    }
    if (data.action === "power" && !POWER_ACTIONS.includes(data.payload as (typeof POWER_ACTIONS)[number])) {
      ctx.addIssue({ code: "custom", path: ["payload"], message: "Pick a power signal." });
    }
  });

export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type TaskInput = z.infer<typeof taskSchema>;

export const renameSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});

export const nestSchema = z.object({
  name: z.string().trim().min(1, "A nest name is required.").max(80),
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().max(60).optional(),
});

/** JSON object field (docker images, config blocks). */
const jsonObject = (label: string) =>
  z
    .string()
    .trim()
    .default("{}")
    .superRefine((value, ctx) => {
      if (!value) return;
      try {
        const parsed = JSON.parse(value);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          ctx.addIssue({ code: "custom", message: `${label} must be a JSON object.` });
        }
      } catch {
        ctx.addIssue({ code: "custom", message: `${label} is not valid JSON.` });
      }
    });

/** JSON string-array field (features, denylist). */
const jsonStringArray = (label: string) =>
  z
    .string()
    .trim()
    .default("[]")
    .superRefine((value, ctx) => {
      if (!value) return;
      try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
          ctx.addIssue({ code: "custom", message: `${label} must be a JSON array of strings.` });
        }
      } catch {
        ctx.addIssue({ code: "custom", message: `${label} is not valid JSON.` });
      }
    });

export const eggSchema = z.object({
  nestId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "A service name is required.").max(80),
  description: z.string().trim().max(1000).optional(),
  kind: z.enum(SERVICE_KINDS),
  author: z.string().trim().max(120).optional(),
  dockerImages: jsonObject("Docker images").superRefine((value, ctx) => {
    try {
      const parsed = JSON.parse(value || "{}") as Record<string, unknown>;
      if (Object.keys(parsed).length === 0) {
        ctx.addIssue({ code: "custom", message: "Add at least one docker image." });
        return;
      }
      for (const [label, image] of Object.entries(parsed)) {
        if (typeof image !== "string" || !image.trim()) {
          ctx.addIssue({ code: "custom", message: `Image for "${label}" must be a non-empty string.` });
        }
      }
    } catch {
      // The base schema already reports invalid JSON.
    }
  }),
  startup: z.string().trim().min(1, "A startup command is required.").max(4000),
  configFiles: jsonObject("Config files"),
  configStartup: jsonObject("Startup detection"),
  configLogs: jsonObject("Log configuration"),
  configStop: z.string().trim().min(1).max(60).default("^C"),
  scriptContainer: z.string().trim().min(1).max(200),
  scriptEntry: z.string().trim().min(1).max(40),
  scriptInstall: z.string().max(60_000).default(""),
  features: jsonStringArray("Features"),
  fileDenylist: jsonStringArray("File denylist"),
  forceOutgoingIp: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const eggVariableSchema = z.object({
  name: z.string().trim().min(1, "A label is required.").max(80),
  description: z.string().trim().max(500).optional(),
  envVariable: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "An environment variable name is required.")
    .max(60)
    .regex(/^[A-Z_][A-Z0-9_]*$/, "Use uppercase letters, numbers and underscores."),
  defaultValue: z.string().max(2000).default(""),
  userViewable: z.boolean().default(true),
  userEditable: z.boolean().default(true),
  rules: z.string().trim().max(255).default("nullable|string"),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type EggInput = z.infer<typeof eggSchema>;
export type EggVariableInput = z.infer<typeof eggVariableSchema>;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ServerCreateInput = z.infer<typeof serverCreateSchema>;

/** Expands "25565,25570-25572" into [25565, 25570, 25571, 25572]. */
export function expandPortSpec(spec: string): number[] {
  const ports = new Set<number>();
  for (const chunk of spec.split(",")) {
    const piece = chunk.trim();
    if (!piece) continue;
    const range = piece.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 1 || end > 65535 || end < start) throw new Error(`Invalid port range: ${piece}`);
      if (end - start > 2000) throw new Error("Port ranges are limited to 2000 ports at a time.");
      for (let p = start; p <= end; p += 1) ports.add(p);
      continue;
    }
    const single = Number(piece);
    if (!Number.isInteger(single) || single < 1 || single > 65535) throw new Error(`Invalid port: ${piece}`);
    ports.add(single);
  }
  return [...ports].sort((a, b) => a - b);
}

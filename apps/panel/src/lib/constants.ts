/** Shared enum-like constants. SQLite has no enums, so these are the source of truth. */

export const USER_ROLES = ["user", "support", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SERVICE_KINDS = ["game", "application", "webhost"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const SERVER_STATES = [
  "installing",
  "install_failed",
  "offline",
  "starting",
  "running",
  "stopping",
  "suspended",
] as const;
export type ServerState = (typeof SERVER_STATES)[number];

export const POWER_ACTIONS = ["start", "stop", "restart", "kill"] as const;
export type PowerAction = (typeof POWER_ACTIONS)[number];

export const BINDING_KINDS = ["http", "minecraft", "tcp"] as const;
export type BindingKind = (typeof BINDING_KINDS)[number];

export const HTTPS_MODES = ["off", "auto", "manual"] as const;
export type HttpsMode = (typeof HTTPS_MODES)[number];

export const WEB_RUNTIMES = ["html", "php"] as const;
export type WebRuntime = (typeof WEB_RUNTIMES)[number];

export const PHP_VERSIONS = ["8.3", "8.2", "8.1", "7.4"] as const;

export const DNS_PROVIDERS = ["manual", "cloudflare"] as const;

/**
 * Resource-limit fields shared by Server, the server build form and Plan
 * templates. Kept here so the Plan schema, the admin form and the wizard all
 * agree on ranges/labels. Ranges mirror `serverBuildSchema` in validation.ts.
 */
export const RESOURCE_LIMIT_FIELDS = [
  { key: "memory", label: "Memory (MiB)", hint: "0 = unlimited.", min: 0, max: 1_048_576, step: 128, default: 1024 },
  { key: "swap", label: "Swap (MiB)", hint: "-1 = unlimited, 0 = disabled.", min: -1, max: 1_048_576, step: 128, default: 0 },
  { key: "disk", label: "Disk (MiB)", hint: "Minimum 64.", min: 64, max: 10_485_760, step: 64, default: 5120 },
  { key: "cpu", label: "CPU limit (%)", hint: "100% = one core, 0 = unlimited.", min: 0, max: 6400, step: 25, default: 100 },
  { key: "io", label: "Block IO weight", hint: "10–1000.", min: 10, max: 1000, step: 10, default: 500 },
  { key: "databaseLimit", label: "Database limit", hint: "Databases the server may create.", min: 0, max: 100, step: 1, default: 2 },
  { key: "allocationLimit", label: "Extra port limit", hint: "Additional ports the client may claim.", min: 0, max: 100, step: 1, default: 2 },
  { key: "backupLimit", label: "Backup limit", hint: "Backups the server may keep.", min: 0, max: 100, step: 1, default: 3 },
] as const;

export type ResourceLimitKey = (typeof RESOURCE_LIMIT_FIELDS)[number]["key"];

export const SUBUSER_PERMISSIONS = [
  "control.console",
  "control.start",
  "control.stop",
  "control.restart",
  "file.read",
  "file.write",
  "file.delete",
  "file.archive",
  "database.read",
  "database.create",
  "database.delete",
  "database.rotate",
  "network.read",
  "network.update",
  "backup.read",
  "backup.create",
  "backup.delete",
  "backup.restore",
  "schedule.read",
  "schedule.update",
  "settings.rename",
  "settings.reinstall",
  "user.read",
  "user.create",
  "user.delete",
] as const;
export type SubuserPermission = (typeof SUBUSER_PERMISSIONS)[number];

/**
 * Global staff permissions for the "support" role. Admins/rootAdmin implicitly
 * hold all of these; a support user holds exactly the set stored in
 * User.staffPermissions (JSON array). Resolved by staffCan() in auth/rbac.ts.
 */
export const STAFF_PERMISSIONS = [
  "tickets.view",
  "tickets.reply",
  "tickets.manage",
  "users.view",
  "users.manage",
  "servers.view",
  "servers.manage",
  "nodes.view",
  "plans.manage",
] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const STAFF_PERMISSION_LABELS: Record<StaffPermission, string> = {
  "tickets.view": "View support tickets",
  "tickets.reply": "Reply to support tickets",
  "tickets.manage": "Manage tickets (assign, close, priority)",
  "users.view": "View users",
  "users.manage": "Manage users",
  "servers.view": "View all servers",
  "servers.manage": "Manage all servers",
  "nodes.view": "View nodes and infrastructure",
  "plans.manage": "Manage plans and packages",
};

/**
 * Unified permission catalog for the fully-customizable Roles system.
 *
 * Every enforceable capability in the panel is a permission key here, grouped by
 * `area` for the Roles matrix editor. Server-scoped permissions (Server control,
 * Files, Databases, Network, Backups, Schedules, Settings) mirror the
 * SUBUSER_PERMISSIONS naming; the Global area is the superset of STAFF_PERMISSIONS
 * plus new platform-wide capabilities.
 *
 * A Role stores a JSON array of these keys; roleCan() (see auth/rbac.ts) resolves
 * a user's effective set from their assigned Role. STAFF_PERMISSIONS and
 * SUBUSER_PERMISSIONS above are kept intact for back-compat.
 */
export const PERMISSION_AREAS = [
  "server",
  "files",
  "databases",
  "network",
  "backups",
  "schedules",
  "settings",
  "global",
] as const;
export type PermissionArea = (typeof PERMISSION_AREAS)[number];

export const PERMISSION_AREA_LABELS: Record<PermissionArea, string> = {
  server: "Server control",
  files: "Files",
  databases: "Databases",
  network: "Network",
  backups: "Backups",
  schedules: "Schedules",
  settings: "Settings",
  global: "Global (platform-wide)",
};

export interface PermissionDef {
  key: string;
  area: PermissionArea;
  label: string;
}

export const PERMISSIONS: readonly PermissionDef[] = [
  // Server control
  { key: "control.console", area: "server", label: "Access console" },
  { key: "control.start", area: "server", label: "Start server" },
  { key: "control.stop", area: "server", label: "Stop server" },
  { key: "control.restart", area: "server", label: "Restart server" },
  // Files
  { key: "file.read", area: "files", label: "Read files" },
  { key: "file.write", area: "files", label: "Write files" },
  { key: "file.delete", area: "files", label: "Delete files" },
  { key: "file.archive", area: "files", label: "Archive / unarchive files" },
  // Databases
  { key: "database.read", area: "databases", label: "View databases" },
  { key: "database.create", area: "databases", label: "Create databases" },
  { key: "database.delete", area: "databases", label: "Delete databases" },
  { key: "database.rotate", area: "databases", label: "Rotate database passwords" },
  // Network
  { key: "network.read", area: "network", label: "View allocations" },
  { key: "network.update", area: "network", label: "Manage allocations" },
  // Backups
  { key: "backup.read", area: "backups", label: "View backups" },
  { key: "backup.create", area: "backups", label: "Create backups" },
  { key: "backup.delete", area: "backups", label: "Delete backups" },
  { key: "backup.restore", area: "backups", label: "Restore backups" },
  // Schedules
  { key: "schedule.read", area: "schedules", label: "View schedules" },
  { key: "schedule.update", area: "schedules", label: "Manage schedules" },
  // Settings
  { key: "settings.rename", area: "settings", label: "Rename server" },
  { key: "settings.reinstall", area: "settings", label: "Reinstall server" },
  { key: "user.read", area: "settings", label: "View subusers" },
  { key: "user.create", area: "settings", label: "Add subusers" },
  { key: "user.delete", area: "settings", label: "Remove subusers" },
  // Global (platform-wide staff/admin capabilities)
  { key: "users.view", area: "global", label: "View users" },
  { key: "users.manage", area: "global", label: "Manage users" },
  { key: "tickets.view", area: "global", label: "View support tickets" },
  { key: "tickets.reply", area: "global", label: "Reply to support tickets" },
  { key: "tickets.manage", area: "global", label: "Manage tickets (assign, close, priority)" },
  { key: "servers.view", area: "global", label: "View all servers" },
  { key: "servers.manage", area: "global", label: "Manage all servers" },
  { key: "servers.viewOthers", area: "global", label: "Toggle to other users' servers" },
  { key: "nodes.view", area: "global", label: "View nodes and infrastructure" },
  { key: "plans.manage", area: "global", label: "Manage plans and packages" },
  { key: "roles.manage", area: "global", label: "Manage roles and permissions" },
  { key: "status.manage", area: "global", label: "Manage the status page" },
] as const;

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as readonly string[];
export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

/**
 * Global (platform-wide) permission keys — the admin-area catalog. Holding any
 * one of these is what grants a non-admin role access to the /admin shell; the
 * individual pages then gate on their specific key via requirePermission().
 */
export const GLOBAL_PERMISSION_KEYS = PERMISSIONS.filter((p) => p.area === "global").map((p) => p.key) as readonly string[];

/** Permissions grouped by area, preserving catalog order. For the matrix UI. */
export function permissionsByArea(): { area: PermissionArea; label: string; permissions: PermissionDef[] }[] {
  return PERMISSION_AREAS.map((area) => ({
    area,
    label: PERMISSION_AREA_LABELS[area],
    permissions: PERMISSIONS.filter((p) => p.area === area),
  })).filter((group) => group.permissions.length > 0);
}

/** Ticket enum-like fields (validated in the app layer). */
export const TICKET_STATUSES = ["open", "pending", "waiting_user", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  pending: "Pending",
  waiting_user: "Waiting on user",
  resolved: "Resolved",
  closed: "Closed",
};

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const TICKET_CATEGORIES = ["general", "billing", "technical", "abuse", "sales"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  general: "General",
  billing: "Billing",
  technical: "Technical",
  abuse: "Abuse report",
  sales: "Sales",
};

/** Status page enum-like fields. */
export const INCIDENT_STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

export const INCIDENT_IMPACTS = ["minor", "major", "critical"] as const;
export type IncidentImpact = (typeof INCIDENT_IMPACTS)[number];

export const INCIDENT_IMPACT_LABELS: Record<IncidentImpact, string> = {
  minor: "Minor",
  major: "Major",
  critical: "Critical",
};

export const STATUS_COMPONENT_KINDS = ["panel", "api", "node", "game", "web", "database"] as const;
export type StatusComponentKind = (typeof STATUS_COMPONENT_KINDS)[number];

export const STATUS_COMPONENT_KIND_LABELS: Record<StatusComponentKind, string> = {
  panel: "Panel",
  api: "API",
  node: "Node",
  game: "Game hosting",
  web: "Web hosting",
  database: "Database",
};

/** Probe types for real status monitoring (see services/status-monitor.ts). */
export const MONITOR_TYPES = ["http", "tcp", "ping"] as const;
export type MonitorType = (typeof MONITOR_TYPES)[number];

export const MONITOR_TYPE_LABELS: Record<MonitorType, string> = {
  http: "HTTP(S)",
  tcp: "TCP port",
  ping: "Ping (reachability)",
};

/** Allowed probe intervals in seconds, surfaced as a picker in the admin UI. */
export const MONITOR_INTERVALS = [30, 60, 120, 300, 600] as const;
/** Bounds enforced server-side on any custom interval. */
export const MONITOR_INTERVAL_MIN = 30;
export const MONITOR_INTERVAL_MAX = 3600;

/** Kinds accepted on the AuthToken model. */
export const AUTH_TOKEN_KINDS = ["email_verify", "password_reset"] as const;
export type AuthTokenKind = (typeof AUTH_TOKEN_KINDS)[number];

/** Billing cycles accepted on Plan.billingCycle. */
export const BILLING_CYCLES = ["monthly", "yearly", "once", "free"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/**
 * Currencies offered in the plan pricing UI. ISO 4217 codes stored on
 * Plan.currency. Lives here (not in the plans "use server" actions module)
 * because a plain constant exported from a "use server" file is coerced into a
 * server-action reference and is no longer a real array on the client.
 */
export const PLAN_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "BRL", "INR"] as const;
export type PlanCurrency = (typeof PLAN_CURRENCIES)[number];

/**
 * API-key scopes for the client API surface (/api/client/*). Kept small and
 * aligned with the subuser permission naming style. An API key grants a subset
 * of what its owner can already do; scopes gate each endpoint.
 */
export const API_KEY_SCOPES = [
  { key: "account:read", label: "Read account profile" },
  { key: "servers:read", label: "List and read servers" },
  { key: "servers:power", label: "Send power actions (start/stop/restart)" },
  { key: "servers:command", label: "Send console commands" },
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]["key"];
export const API_KEY_SCOPE_KEYS = API_KEY_SCOPES.map((s) => s.key) as readonly string[];

/** Settings keys persisted in the `settings` table. */
export const SETTING_KEYS = {
  siteName: "site.name",
  siteLogo: "site.logo",
  siteFavicon: "site.favicon",
  siteUrl: "site.url",
  siteAccent: "site.accent",
  siteDescription: "site.description",
  registrationOpen: "site.registration_open",
  defaultServerLimit: "site.default_server_limit",
  panelUrl: "panel.url",
  panelPort: "panel.port",
  smtpHost: "mail.host",
  smtpPort: "mail.port",
  smtpUser: "mail.username",
  smtpPass: "mail.password",
  smtpEncryption: "mail.encryption",
  smtpFromAddress: "mail.from_address",
  smtpFromName: "mail.from_name",
  smtpEnabled: "mail.enabled",
  // Auth lifecycle toggles. `registrationOpen` (site.registration_open) above is
  // the existing registration switch; `authRegistrationEnabled` is an alias key
  // kept for the new auth flows — prefer reusing registrationOpen where possible.
  authRegistrationEnabled: "auth.registration_enabled",
  authEmailVerificationRequired: "auth.email_verification_required",
  authPasswordResetEnabled: "auth.password_reset_enabled",
  // Password policy (consumed by buildPasswordSchema in validation.ts).
  passwordMinLength: "security.password_min_length",
  passwordRequireUpper: "security.password_require_upper",
  passwordRequireLower: "security.password_require_lower",
  passwordRequireNumber: "security.password_require_number",
  passwordRequireSymbol: "security.password_require_symbol",
  maintenanceMode: "site.maintenance_mode",
} as const;

export const DEFAULT_SETTINGS: Record<string, string> = {
  [SETTING_KEYS.siteName]: "SPanel",
  [SETTING_KEYS.siteLogo]: "",
  [SETTING_KEYS.siteFavicon]: "",
  [SETTING_KEYS.siteUrl]: "https://spanel.sadlystudios.bond",
  [SETTING_KEYS.siteAccent]: "#f5f5f3",
  [SETTING_KEYS.siteDescription]: "Game, application and web hosting control panel By SadlyStudios.",
  [SETTING_KEYS.registrationOpen]: "false",
  [SETTING_KEYS.defaultServerLimit]: "2",
  [SETTING_KEYS.panelUrl]: "",
  [SETTING_KEYS.panelPort]: "",
  [SETTING_KEYS.smtpHost]: "",
  [SETTING_KEYS.smtpPort]: "587",
  [SETTING_KEYS.smtpUser]: "",
  [SETTING_KEYS.smtpEncryption]: "tls",
  [SETTING_KEYS.smtpFromAddress]: "",
  [SETTING_KEYS.smtpFromName]: "SPanel",
  [SETTING_KEYS.smtpEnabled]: "false",
  [SETTING_KEYS.authRegistrationEnabled]: "false",
  [SETTING_KEYS.authEmailVerificationRequired]: "false",
  [SETTING_KEYS.authPasswordResetEnabled]: "true",
  [SETTING_KEYS.passwordMinLength]: "8",
  [SETTING_KEYS.passwordRequireUpper]: "true",
  [SETTING_KEYS.passwordRequireLower]: "true",
  [SETTING_KEYS.passwordRequireNumber]: "true",
  [SETTING_KEYS.passwordRequireSymbol]: "false",
  [SETTING_KEYS.maintenanceMode]: "false",
};

/** Keys whose values are encrypted before hitting the database. */
export const ENCRYPTED_SETTING_KEYS: string[] = [SETTING_KEYS.smtpPass];

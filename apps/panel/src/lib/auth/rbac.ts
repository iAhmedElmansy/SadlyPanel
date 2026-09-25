import { prisma } from "../db";
import type { AuthUser } from "./session";
import {
  GLOBAL_PERMISSION_KEYS,
  PERMISSION_KEYS,
  STAFF_PERMISSIONS,
  SUBUSER_PERMISSIONS,
  type PermissionKey,
  type StaffPermission,
  type SubuserPermission,
} from "../constants";

/**
 * Server access resolution. An owner (or admin) has every permission; a subuser
 * gets exactly the permissions granted on their subuser record.
 */
export interface ServerAccess {
  serverId: number;
  isOwner: boolean;
  isAdmin: boolean;
  permissions: Set<string>;
}

export function allPermissions(): Set<string> {
  return new Set<string>(SUBUSER_PERMISSIONS);
}

export async function resolveServerAccess(user: AuthUser, serverUuid: string): Promise<ServerAccess | null> {
  const server = await prisma.server.findFirst({
    where: {
      OR: [{ uuid: serverUuid }, { uuidShort: serverUuid }],
    },
    select: { id: true, ownerId: true },
  });
  if (!server) return null;

  if (user.role === "admin") {
    return { serverId: server.id, isOwner: server.ownerId === user.id, isAdmin: true, permissions: allPermissions() };
  }
  if (server.ownerId === user.id) {
    return { serverId: server.id, isOwner: true, isAdmin: false, permissions: allPermissions() };
  }

  const subuser = await prisma.subuser.findUnique({
    where: { serverId_userId: { serverId: server.id, userId: user.id } },
    select: { permissions: true },
  });
  if (!subuser) return null;

  let granted: string[] = [];
  try {
    const parsed = JSON.parse(subuser.permissions);
    if (Array.isArray(parsed)) granted = parsed.filter((p): p is string => typeof p === "string");
  } catch {
    granted = [];
  }
  return { serverId: server.id, isOwner: false, isAdmin: false, permissions: new Set(granted) };
}

export function can(access: ServerAccess | null, permission: SubuserPermission): boolean {
  if (!access) return false;
  return access.isAdmin || access.isOwner || access.permissions.has(permission);
}

/**
 * The set of global staff permissions a user carries. Missing on AuthUser (see
 * session.ts), so callers pass the raw JSON from User.staffPermissions.
 */
function parseStaffPermissions(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((p): p is string => typeof p === "string"));
  } catch {
    /* fall through */
  }
  return new Set();
}

export function allStaffPermissions(): Set<string> {
  return new Set<string>(STAFF_PERMISSIONS);
}

/**
 * Global staff-permission resolver, distinct from per-server `can()`. Admins and
 * rootAdmins hold every staff permission; a "support" user holds exactly the set
 * in their staffPermissions field; everyone else holds none.
 */
export function staffCan(
  user: Pick<AuthUser, "role" | "rootAdmin" | "staffPermissions" | "roleId" | "rolePermissions"> | null | undefined,
  permission: StaffPermission,
): boolean {
  if (!user) return false;
  if (user.rootAdmin || user.role === "admin") return true;
  // New source of truth: a fully-customizable Role, when assigned.
  if (user.roleId != null) return parseStaffPermissions(user.rolePermissions).has(permission);
  // Back-compat: the legacy "support" role reads from staffPermissions.
  if (user.role === "support") return parseStaffPermissions(user.staffPermissions).has(permission);
  return false;
}

// ---------------------------------------------------------------------------
// Unified role-based permission resolution (fully-customizable Roles)
// ---------------------------------------------------------------------------

type RoleAware = Pick<AuthUser, "role" | "rootAdmin" | "staffPermissions" | "roleId" | "rolePermissions">;

/** Every permission in the catalog — admins/rootAdmin hold all of them. */
export function allRolePermissions(): Set<string> {
  return new Set<string>(PERMISSION_KEYS);
}

/**
 * The effective set of global permission keys a user carries. Admins and
 * rootAdmin implicitly hold every catalog permission. Otherwise the set comes
 * from the assigned Role's permissions JSON (new source of truth), falling back
 * to the legacy staffPermissions JSON for users without a roleId.
 */
export function effectivePermissions(user: RoleAware | null | undefined): Set<string> {
  if (!user) return new Set();
  if (user.rootAdmin || user.role === "admin") return allRolePermissions();
  if (user.roleId != null) return parseStaffPermissions(user.rolePermissions);
  return parseStaffPermissions(user.staffPermissions);
}

/**
 * Resolves whether a user holds a given global permission from the unified
 * PERMISSIONS catalog. Admins/rootAdmin implicitly hold all; everyone else is
 * resolved from their Role (or legacy staffPermissions). This is the primary
 * server-side gate for platform-wide capabilities (roles.manage, status.manage,
 * servers.viewOthers, etc.).
 */
export function roleCan(user: RoleAware | null | undefined, permission: PermissionKey | string): boolean {
  if (!user) return false;
  if (user.rootAdmin || user.role === "admin") return true;
  return effectivePermissions(user).has(permission);
}

/**
 * Whether a user may enter the /admin shell at all. True for admins/rootAdmin and
 * the legacy "support" role, or any custom role holding at least one global-area
 * catalog permission. Individual admin pages still gate on their own permission
 * via requirePermission(), so this only opens the door — it never grants a
 * feature the role's permission set doesn't include.
 */
export function canAccessAdminArea(user: RoleAware | null | undefined): boolean {
  if (!user) return false;
  if (user.rootAdmin || user.role === "admin" || user.role === "support") return true;
  const held = effectivePermissions(user);
  return GLOBAL_PERMISSION_KEYS.some((key) => held.has(key));
}

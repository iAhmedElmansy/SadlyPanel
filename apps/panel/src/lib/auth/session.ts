import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { randomToken, sha256 } from "../crypto";
import { SESSION_COOKIE_NAME, signSessionJwt, verifySessionJwt } from "./jwt";
import { roleCan, staffCan } from "./rbac";
import type { PermissionKey, StaffPermission } from "../constants";

export interface AuthUser {
  id: number;
  uuid: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: string;
  rootAdmin: boolean;
  isActive: boolean;
  /** JSON array of STAFF_PERMISSIONS keys; only meaningful for the support role. */
  staffPermissions?: string;
  /** Assigned customizable Role id, when present (new RBAC source of truth). */
  roleId?: number | null;
  /** JSON array of PERMISSIONS keys copied from the assigned Role, when present. */
  rolePermissions?: string;
}

/**
 * Maps a User row to an AuthUser. When the row was loaded with its `customRole`
 * relation, pass it through so role-based permission resolution (roleCan) has
 * the role's permission JSON without an extra query.
 */
export function toAuthUser(user: User & { customRole?: { permissions: string } | null }): AuthUser {
  return {
    id: user.id,
    uuid: user.uuid,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    rootAdmin: user.rootAdmin,
    isActive: user.isActive,
    staffPermissions: user.staffPermissions,
    roleId: user.roleId,
    rolePermissions: user.customRole?.permissions,
  };
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  if (env.trustProxy) {
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    const real = h.get("x-real-ip");
    if (real) return real;
  }
  return null;
}

/** Creates a DB-backed session and sets the signed cookie. */
export async function createSession(userId: number, role: string): Promise<void> {
  const raw = randomToken(48);
  const expiresAt = new Date(Date.now() + env.sessionTtlDays * 24 * 60 * 60 * 1000);
  const h = await headers();

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      expiresAt,
      ip: await clientIp(),
      userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
    },
  });

  const jwt = await signSessionJwt({ sid: session.id, uid: userId, role }, expiresAt);
  const store = await cookies();
  // Only set secure=true when the panel is actually served over HTTPS.
  // In production behind a plain HTTP setup (common during development or
  // when TLS terminates at a load balancer), secure cookies are invisible.
  const isHttps = env.appUrl.startsWith("https://");
  store.set(SESSION_COOKIE_NAME, `${jwt}.${raw}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    expires: expiresAt,
  });
}

function splitCookie(value: string): { jwt: string; raw: string } | null {
  const idx = value.lastIndexOf(".");
  if (idx <= 0) return null;
  return { jwt: value.slice(0, idx), raw: value.slice(idx + 1) };
}

/** Resolves the current user from the session cookie, or null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;

  const parts = splitCookie(cookie);
  if (!parts) return null;

  const claims = await verifySessionJwt(parts.jwt);
  if (!claims) return null;

  const session = await prisma.session.findUnique({
    where: { id: claims.sid },
    include: { user: { include: { customRole: { select: { permissions: true } } } } },
  });
  if (!session || session.userId !== claims.uid) return null;
  if (session.tokenHash !== sha256(parts.raw)) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (!session.user.isActive) return null;

  return toAuthUser(session.user);
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

/**
 * Requires an authenticated staff member: an admin/rootAdmin (full access) or a
 * "support" user. When `permission` is given, support users must additionally
 * hold that staff permission. Does not alter requireAdmin/requireUser.
 */
export async function requireStaff(permission?: StaffPermission): Promise<AuthUser> {
  const user = await requireUser();
  if (permission) {
    if (!staffCan(user, permission)) redirect("/dashboard");
    return user;
  }
  const isStaff = user.rootAdmin || user.role === "admin" || user.role === "support";
  if (!isStaff) redirect("/dashboard");
  return user;
}

/**
 * Requires an authenticated user holding a specific catalog permission (resolved
 * via roleCan). Admins/rootAdmin implicitly pass. Redirects to /dashboard
 * otherwise. Use this to gate pages/actions on the unified PERMISSIONS catalog
 * (e.g. "roles.manage", "status.manage").
 */
export async function requirePermission(permission: PermissionKey | string): Promise<AuthUser> {
  const user = await requireUser();
  if (!roleCan(user, permission)) redirect("/dashboard");
  return user;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) {
    const parts = splitCookie(cookie);
    if (parts) {
      const claims = await verifySessionJwt(parts.jwt);
      if (claims) await prisma.session.delete({ where: { id: claims.sid } }).catch(() => undefined);
    }
  }
  store.delete(SESSION_COOKIE_NAME);
}

export async function revokeAllSessions(userId: number): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** True when no user exists yet — enables the first-run admin registration. */
export async function isFirstRun(): Promise<boolean> {
  return (await prisma.user.count()) === 0;
}

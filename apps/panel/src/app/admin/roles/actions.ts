"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity";
import { PERMISSION_KEYS } from "@/lib/constants";

// A URL/identifier-safe slug used as the unique role key.
const keySchema = z
  .string()
  .trim()
  .min(2, "Key must be at least 2 characters.")
  .max(40, "Key is too long.")
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers and dashes.");

const roleSchema = z.object({
  key: keySchema,
  name: z.string().trim().min(2, "Name is required.").max(60, "Name is too long."),
  description: z.string().trim().max(300, "Description is too long.").optional(),
  isDefault: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  permissions: z.array(z.string()).default([]),
});

export interface RoleState {
  error?: string;
  success?: string;
  warnings?: string[];
  fieldErrors?: Record<string, string>;
  roleId?: number;
}

function fieldErrorsOf(issues: { path: (string | number | symbol)[]; message: string }[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** Keeps only known catalog keys, de-duplicated and in catalog order. */
function sanitizePermissions(input: string[]): string[] {
  const set = new Set(input);
  return PERMISSION_KEYS.filter((key) => set.has(key));
}

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) !== null;
}

function parseRoleForm(formData: FormData) {
  return roleSchema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    description: text(formData, "description"),
    isDefault: bool(formData, "isDefault"),
    sortOrder: formData.get("sortOrder") ?? 0,
    permissions: sanitizePermissions(formData.getAll("permissions").map(String)),
  });
}

/** Ensures exactly one default role by clearing the flag on all others. */
async function clearOtherDefaults(exceptId: number): Promise<void> {
  await prisma.role.updateMany({ where: { isDefault: true, id: { not: exceptId } }, data: { isDefault: false } });
}

export async function createRoleAction(_prev: RoleState, formData: FormData): Promise<RoleState> {
  const admin = await requirePermission("roles.manage");
  const parsed = parseRoleForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const clash = await prisma.role.findUnique({ where: { key: parsed.data.key } });
  if (clash) return { fieldErrors: { key: "That key is already in use." }, error: "A role with that key already exists." };

  const role = await prisma.role.create({
    data: {
      key: parsed.data.key,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      permissions: JSON.stringify(parsed.data.permissions),
      isSystem: false,
      isDefault: parsed.data.isDefault,
      sortOrder: parsed.data.sortOrder,
    },
  });

  if (role.isDefault) await clearOtherDefaults(role.id);

  await logActivity({ event: "admin:role.create", userId: admin.id, properties: { key: role.key, name: role.name } });
  revalidatePath("/admin/roles");
  return { success: `Role ${role.name} created.`, roleId: role.id };
}

export async function updateRoleAction(_prev: RoleState, formData: FormData): Promise<RoleState> {
  const admin = await requirePermission("roles.manage");
  const roleId = Number(formData.get("roleId"));
  if (!Number.isInteger(roleId)) return { error: "Invalid role." };

  const existing = await prisma.role.findUnique({ where: { id: roleId } });
  if (!existing) return { error: "That role no longer exists." };

  const parsed = parseRoleForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  // System roles keep their immutable key; only the display fields/permissions
  // can change. Never allow the admin system role to lose all permissions.
  const isAdminSystem = existing.isSystem && existing.key === "admin";
  if (isAdminSystem && parsed.data.permissions.length < PERMISSION_KEYS.length) {
    return { error: "The Administrator role must keep every permission." };
  }

  const nextKey = existing.isSystem ? existing.key : parsed.data.key;
  if (nextKey !== existing.key) {
    const clash = await prisma.role.findUnique({ where: { key: nextKey } });
    if (clash) return { fieldErrors: { key: "That key is already in use." }, error: "A role with that key already exists." };
  }

  const role = await prisma.role.update({
    where: { id: roleId },
    data: {
      key: nextKey,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      permissions: JSON.stringify(parsed.data.permissions),
      isDefault: parsed.data.isDefault,
      sortOrder: parsed.data.sortOrder,
    },
  });

  if (role.isDefault) await clearOtherDefaults(role.id);

  await logActivity({ event: "admin:role.update", userId: admin.id, properties: { key: role.key, name: role.name } });
  revalidatePath("/admin/roles");
  return { success: `${role.name} saved.`, roleId: role.id };
}

/**
 * Updates just the permission set of a role (matrix editor). Guards the admin
 * system role so it can never be stripped of permissions.
 */
export async function setRolePermissionsAction(roleId: number, permissions: string[]): Promise<RoleState> {
  const admin = await requirePermission("roles.manage");
  if (!Number.isInteger(roleId)) return { error: "Invalid role." };

  const existing = await prisma.role.findUnique({ where: { id: roleId } });
  if (!existing) return { error: "That role no longer exists." };

  const clean = sanitizePermissions(permissions);
  if (existing.isSystem && existing.key === "admin" && clean.length < PERMISSION_KEYS.length) {
    return { error: "The Administrator role must keep every permission." };
  }

  const role = await prisma.role.update({
    where: { id: roleId },
    data: { permissions: JSON.stringify(clean) },
  });

  await logActivity({ event: "admin:role.permissions", userId: admin.id, properties: { key: role.key, count: clean.length } });
  revalidatePath("/admin/roles");
  return { success: `${role.name} permissions updated.`, roleId: role.id };
}

export async function deleteRoleAction(roleId: number): Promise<RoleState> {
  const admin = await requirePermission("roles.manage");
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true, key: true, name: true, isSystem: true } });
  if (!role) return { error: "That role no longer exists." };

  if (role.isSystem) return { error: "System roles cannot be deleted." };

  const assigned = await prisma.user.count({ where: { roleId } });

  // Reassign users on the deleted role back to the default role (or null).
  const fallback = await prisma.role.findFirst({ where: { isDefault: true, id: { not: roleId } }, select: { id: true } });
  if (assigned > 0) {
    await prisma.user.updateMany({ where: { roleId }, data: { roleId: fallback?.id ?? null } });
  }

  await prisma.role.delete({ where: { id: roleId } });

  await logActivity({ event: "admin:role.delete", userId: admin.id, properties: { key: role.key, name: role.name } });
  revalidatePath("/admin/roles");
  return {
    success: `${role.name} deleted.`,
    warnings:
      assigned > 0
        ? [`${assigned} user(s) were moved to the ${fallback ? "default" : "no"} role.`]
        : undefined,
  };
}

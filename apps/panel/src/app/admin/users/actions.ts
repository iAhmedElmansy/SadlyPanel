"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission, revokeAllSessions } from "@/lib/auth/session";
import { hashPassword } from "@/lib/password";
import { uuid } from "@/lib/crypto";
import { userCreateSchema, userUpdateSchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { getSetting } from "@/lib/settings";
import { SETTING_KEYS } from "@/lib/constants";
import { renderBrandedEmail, sendMail } from "@/lib/mail";

export interface UserState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

function fieldErrors(issues: { path: (string | number)[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Sentinel: the submitted plan id does not exist. */
const INVALID_PLAN = Symbol("invalid-plan");

/**
 * Resolves the optional planId form field to a plan id or null. Returns the
 * INVALID_PLAN sentinel when a non-empty id references a plan that is gone.
 */
async function resolvePlanId(raw: FormDataEntryValue | null): Promise<number | null | typeof INVALID_PLAN> {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return INVALID_PLAN;
  const plan = await prisma.plan.findUnique({ where: { id }, select: { id: true } });
  return plan ? plan.id : INVALID_PLAN;
}

export async function createUserAction(_prev: UserState, formData: FormData): Promise<UserState> {
  const admin = await requirePermission("users.manage");

  const parsed = userCreateSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role") ?? "user",
    isActive: formData.get("isActive") !== null,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), error: "Please fix the highlighted fields." };

  const planId = await resolvePlanId(formData.get("planId"));
  if (planId === INVALID_PLAN) return { error: "The selected plan no longer exists." };

  const clash = await prisma.user.findFirst({
    where: { OR: [{ email: parsed.data.email }, { username: parsed.data.username }] },
    select: { email: true },
  });
  if (clash) return { error: "A user with that email or username already exists." };

  const created = await prisma.user.create({
    data: {
      uuid: uuid(),
      email: parsed.data.email,
      username: parsed.data.username,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      password: await hashPassword(parsed.data.password),
      role: parsed.data.role,
      isActive: parsed.data.isActive,
      planId,
    },
  });

  await logActivity({
    event: "admin:user.create",
    userId: admin.id,
    properties: { target: created.username, role: created.role },
  });

  // Best-effort welcome email; never blocks user creation.
  const siteName = (await getSetting(SETTING_KEYS.siteName)) || "SPanel";
  const siteUrl = (await getSetting(SETTING_KEYS.siteUrl)) || "";
  await sendMail({
    to: created.email,
    subject: `Your ${siteName} account`,
    html: renderBrandedEmail(
      siteName,
      "Your account is ready",
      `<p>An administrator created an account for you.</p>
       <p><strong>Username:</strong> ${created.username}<br/><strong>Email:</strong> ${created.email}</p>
       <p>Sign in at <a href="${siteUrl}/auth/login" style="color:#111111;font-weight:600">${siteUrl}/auth/login</a> using the password you were given, then change it from Account settings.</p>`,
    ),
  }).catch(() => undefined);

  revalidatePath("/admin/users");
  return { success: `${created.username} created.` };
}

export async function updateUserAction(_prev: UserState, formData: FormData): Promise<UserState> {
  const admin = await requirePermission("users.manage");
  const userId = Number(formData.get("userId"));
  if (!Number.isInteger(userId)) return { error: "Invalid user." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User not found." };

  const parsed = userUpdateSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password") || undefined,
    role: formData.get("role") ?? target.role,
    isActive: formData.get("isActive") !== null,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), error: "Please fix the highlighted fields." };

  const planId = await resolvePlanId(formData.get("planId"));
  if (planId === INVALID_PLAN) return { error: "The selected plan no longer exists." };

  const clash = await prisma.user.findFirst({
    where: {
      id: { not: userId },
      OR: [{ email: parsed.data.email }, { username: parsed.data.username }],
    },
    select: { id: true },
  });
  if (clash) return { error: "Another account already uses that email or username." };

  // Never allow the last administrator to be demoted or disabled.
  if (target.role === "admin" && (parsed.data.role !== "admin" || !parsed.data.isActive)) {
    const admins = await prisma.user.count({ where: { role: "admin", isActive: true } });
    if (admins <= 1) return { error: "At least one active administrator must remain." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      username: parsed.data.username,
      email: parsed.data.email,
      role: parsed.data.role,
      isActive: parsed.data.isActive,
      planId,
      ...(parsed.data.password ? { password: await hashPassword(parsed.data.password) } : {}),
    },
  });

  if (parsed.data.password || !parsed.data.isActive) await revokeAllSessions(userId);

  await logActivity({
    event: "admin:user.update",
    userId: admin.id,
    properties: { target: parsed.data.username, passwordChanged: Boolean(parsed.data.password) },
  });

  revalidatePath("/admin/users");
  return { success: `${parsed.data.username} updated.` };
}

export async function deleteUserAction(userId: number): Promise<UserState> {
  const admin = await requirePermission("users.manage");
  if (userId === admin.id) return { error: "You cannot delete your own account." };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { _count: { select: { servers: true } } },
  });
  if (!target) return { error: "User not found." };

  if (target.role === "admin") {
    const admins = await prisma.user.count({ where: { role: "admin" } });
    if (admins <= 1) return { error: "The last administrator cannot be deleted." };
  }
  if (target._count.servers > 0) {
    return { error: `${target.username} still owns ${target._count.servers} server(s). Delete or transfer them first.` };
  }

  await prisma.user.delete({ where: { id: userId } });
  await logActivity({ event: "admin:user.delete", userId: admin.id, properties: { target: target.username } });

  revalidatePath("/admin/users");
  return { success: `${target.username} deleted.` };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity";

export interface LocationState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

// Mirrors the inline location-create rules in admin/nodes/actions.ts so the two
// entry points stay consistent: short code is 2–20 lowercase letters, numbers
// or dashes and unique; name is required.
const locationSchema = z.object({
  shortCode: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,20}$/, "Short code must be 2–20 lowercase letters, numbers or dashes."),
  name: z.string().trim().min(1, "Name is required.").max(191, "Name is too long."),
});

function fieldErrorsOf(issues: { path: (string | number | symbol)[]; message: string }[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function parseLocation(formData: FormData) {
  return locationSchema.safeParse({
    shortCode: formData.get("shortCode"),
    name: formData.get("name"),
  });
}

/** Prisma unique-constraint error code. */
function isUniqueClash(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

export async function createLocationAction(_prev: LocationState, formData: FormData): Promise<LocationState> {
  const admin = await requireAdmin();
  const parsed = parseLocation(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const clash = await prisma.location.findUnique({ where: { shortCode: parsed.data.shortCode } });
  if (clash) return { fieldErrors: { shortCode: "That short code is already used." }, error: "That short code is already used." };

  try {
    const location = await prisma.location.create({ data: parsed.data });
    await logActivity({ event: "admin:location.create", userId: admin.id, properties: { shortCode: location.shortCode } });
  } catch (error) {
    // Guards against the race between the check above and the insert.
    if (isUniqueClash(error))
      return { fieldErrors: { shortCode: "That short code is already used." }, error: "That short code is already used." };
    throw error;
  }

  revalidatePath("/admin/locations");
  revalidatePath("/admin/nodes");
  return { success: `Location ${parsed.data.shortCode} created.` };
}

export async function updateLocationAction(_prev: LocationState, formData: FormData): Promise<LocationState> {
  const admin = await requireAdmin();
  const locationId = Number(formData.get("locationId"));
  if (!Number.isInteger(locationId)) return { error: "Invalid location." };

  const parsed = parseLocation(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const clash = await prisma.location.findFirst({
    where: { shortCode: parsed.data.shortCode, id: { not: locationId } },
  });
  if (clash) return { fieldErrors: { shortCode: "That short code is already used." }, error: "That short code is already used." };

  try {
    await prisma.location.update({ where: { id: locationId }, data: parsed.data });
    await logActivity({ event: "admin:location.update", userId: admin.id, properties: { locationId } });
  } catch (error) {
    if (isUniqueClash(error))
      return { fieldErrors: { shortCode: "That short code is already used." }, error: "That short code is already used." };
    throw error;
  }

  revalidatePath("/admin/locations");
  revalidatePath("/admin/nodes");
  return { success: "Location updated." };
}

export async function deleteLocationAction(locationId: number): Promise<LocationState> {
  const admin = await requireAdmin();

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { shortCode: true, _count: { select: { nodes: true } } },
  });
  if (!location) return { error: "Location not found." };

  // Deletion safety: BLOCK while nodes are still attached rather than silently
  // nulling their locationId. Reassigning nodes is a deliberate, reversible act;
  // an accidental delete that quietly detaches nodes is not. The admin must move
  // the nodes elsewhere first.
  if (location._count.nodes > 0)
    return {
      error: `This location still has ${location._count.nodes} node(s) attached. Reassign or remove them before deleting it.`,
    };

  await prisma.location.delete({ where: { id: locationId } });
  await logActivity({ event: "admin:location.delete", userId: admin.id, properties: { shortCode: location.shortCode } });

  revalidatePath("/admin/locations");
  revalidatePath("/admin/nodes");
  return { success: `Location ${location.shortCode} deleted.` };
}

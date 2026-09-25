"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { packageSchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";

// Availability metadata layered on top of the shared package schema. The
// PlanPackage join is the primary mechanism; requiredPlanId is a shortcut for a
// single "minimum plan". Kept inline so it stays owned by this feature.
const packageAvailabilitySchema = packageSchema.extend({
  availablePlanIds: z.array(z.coerce.number().int().positive()).default([]),
  requiredPlanId: z.coerce.number().int().positive().nullable().optional(),
});

export interface PackageState {
  error?: string;
  success?: string;
  warnings?: string[];
  fieldErrors?: Record<string, string>;
  packageId?: number;
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

function numberList(formData: FormData, key: string): number[] {
  return formData
    .getAll(key)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function parsePackageForm(formData: FormData) {
  const nestRaw = formData.get("nestId");
  const requiredRaw = formData.get("requiredPlanId");
  return packageAvailabilitySchema.safeParse({
    name: formData.get("name"),
    description: text(formData, "description"),
    isPublic: bool(formData, "isPublic"),
    sortOrder: formData.get("sortOrder") ?? 0,
    planId: formData.get("planId"),
    eggId: formData.get("eggId"),
    nestId: nestRaw && nestRaw !== "" ? nestRaw : null,
    availablePlanIds: numberList(formData, "availablePlanIds"),
    requiredPlanId: requiredRaw && requiredRaw !== "" ? requiredRaw : null,
  });
}

/** Filters a requested list of plan ids down to the ones that still exist. */
async function validPlanIds(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const rows = await prisma.plan.findMany({ where: { id: { in: unique } }, select: { id: true } });
  const known = new Set(rows.map((row) => row.id));
  return unique.filter((id) => known.has(id));
}

/** Confirms the referenced plan/egg exist and the egg belongs to the nest. */
async function validateReferences(planId: number, eggId: number, nestId: number | null | undefined) {
  const [plan, egg] = await Promise.all([
    prisma.plan.findUnique({ where: { id: planId }, select: { id: true } }),
    prisma.egg.findUnique({ where: { id: eggId }, select: { id: true, nestId: true } }),
  ]);
  if (!plan) return { error: "The selected plan no longer exists." };
  if (!egg) return { error: "The selected default service no longer exists." };
  const resolvedNestId = nestId ?? egg.nestId;
  if (nestId && egg.nestId !== nestId) {
    return { error: "The default service must belong to the selected nest." };
  }
  return { resolvedNestId };
}

export async function createPackageAction(_prev: PackageState, formData: FormData): Promise<PackageState> {
  const admin = await requirePermission("plans.manage");
  const parsed = parsePackageForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const clash = await prisma.package.findFirst({ where: { name: parsed.data.name } });
  if (clash) return { error: `A package named "${parsed.data.name}" already exists.` };

  const refs = await validateReferences(parsed.data.planId, parsed.data.eggId, parsed.data.nestId);
  if ("error" in refs) return { error: refs.error };

  const availablePlanIds = await validPlanIds(parsed.data.availablePlanIds);
  const requiredPlanId = parsed.data.requiredPlanId ?? null;

  const pkg = await prisma.package.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isPublic: parsed.data.isPublic,
      sortOrder: parsed.data.sortOrder,
      planId: parsed.data.planId,
      requiredPlanId,
      eggId: parsed.data.eggId,
      nestId: refs.resolvedNestId ?? null,
      plans: { create: availablePlanIds.map((planId) => ({ planId })) },
    },
  });

  await logActivity({ event: "admin:package.create", userId: admin.id, properties: { name: pkg.name } });
  revalidatePath("/admin/packages");
  return { success: `Package ${pkg.name} created.`, packageId: pkg.id };
}

export async function updatePackageAction(_prev: PackageState, formData: FormData): Promise<PackageState> {
  const admin = await requirePermission("plans.manage");
  const packageId = Number(formData.get("packageId"));
  if (!Number.isInteger(packageId)) return { error: "Invalid package." };

  const parsed = parsePackageForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const existing = await prisma.package.findUnique({ where: { id: packageId } });
  if (!existing) return { error: "That package no longer exists." };

  const clash = await prisma.package.findFirst({ where: { name: parsed.data.name, id: { not: packageId } } });
  if (clash) return { error: `A package named "${parsed.data.name}" already exists.` };

  const refs = await validateReferences(parsed.data.planId, parsed.data.eggId, parsed.data.nestId);
  if ("error" in refs) return { error: refs.error };

  const availablePlanIds = await validPlanIds(parsed.data.availablePlanIds);
  const requiredPlanId = parsed.data.requiredPlanId ?? null;

  // Replace-on-update: clear the join rows and rewrite them so availability
  // exactly matches the submitted selection, all in one transaction.
  const [pkg] = await prisma.$transaction([
    prisma.package.update({
      where: { id: packageId },
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        isPublic: parsed.data.isPublic,
        sortOrder: parsed.data.sortOrder,
        planId: parsed.data.planId,
        requiredPlanId,
        eggId: parsed.data.eggId,
        nestId: refs.resolvedNestId ?? null,
      },
    }),
    prisma.planPackage.deleteMany({ where: { packageId } }),
    prisma.planPackage.createMany({ data: availablePlanIds.map((planId) => ({ packageId, planId })) }),
  ]);

  await logActivity({ event: "admin:package.update", userId: admin.id, properties: { packageId, name: pkg.name } });
  revalidatePath("/admin/packages");
  return { success: `${pkg.name} saved.`, packageId: pkg.id };
}

export async function deletePackageAction(packageId: number): Promise<PackageState> {
  const admin = await requirePermission("plans.manage");
  const pkg = await prisma.package.findUnique({ where: { id: packageId }, select: { name: true } });
  if (!pkg) return { error: "That package no longer exists." };

  const servers = await prisma.server.count({ where: { packageId } });
  await prisma.package.delete({ where: { id: packageId } });

  await logActivity({ event: "admin:package.delete", userId: admin.id, properties: { name: pkg.name } });
  revalidatePath("/admin/packages");
  return {
    success: `${pkg.name} deleted.`,
    warnings: servers > 0 ? [`${servers} server(s) were unlinked from this package; their limits are unchanged.`] : undefined,
  };
}

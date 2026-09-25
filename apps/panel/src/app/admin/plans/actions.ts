"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { planSchema } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { BILLING_CYCLES, PLAN_CURRENCIES } from "@/lib/constants";

// Billing metadata is layered on top of the shared resource-limit schema. Kept
// inline here (not in validation.ts) so it stays owned by this feature.
const planBillingSchema = planSchema.extend({
  isPublic: z.boolean().default(true),
  priceCents: z.coerce.number().int().min(0).max(100_000_000).default(0),
  currency: z.enum(PLAN_CURRENCIES).default("USD"),
  billingCycle: z.enum(BILLING_CYCLES).default("monthly"),
});

/** Parses a decimal price string ("9.99") into integer cents; clamps to >= 0. */
function priceToCents(formData: FormData): number {
  const raw = formData.get("price");
  if (typeof raw !== "string" || raw.trim() === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

export interface PlanState {
  error?: string;
  success?: string;
  warnings?: string[];
  fieldErrors?: Record<string, string>;
  planId?: number;
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

function parsePlanForm(formData: FormData) {
  return planBillingSchema.safeParse({
    name: formData.get("name"),
    description: text(formData, "description"),
    isActive: bool(formData, "isActive"),
    isPublic: bool(formData, "isPublic"),
    priceCents: priceToCents(formData),
    currency: formData.get("currency") ?? "USD",
    billingCycle: formData.get("billingCycle") ?? "monthly",
    sortOrder: formData.get("sortOrder") ?? 0,
    memory: formData.get("memory"),
    swap: formData.get("swap") ?? 0,
    disk: formData.get("disk"),
    cpu: formData.get("cpu"),
    io: formData.get("io") ?? 500,
    threads: text(formData, "threads"),
    oomKiller: bool(formData, "oomKiller"),
    databaseLimit: formData.get("databaseLimit") ?? 2,
    allocationLimit: formData.get("allocationLimit") ?? 2,
    backupLimit: formData.get("backupLimit") ?? 3,
  });
}

export async function createPlanAction(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const admin = await requirePermission("plans.manage");
  const parsed = parsePlanForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const clash = await prisma.plan.findFirst({ where: { name: parsed.data.name } });
  if (clash) return { error: `A plan named "${parsed.data.name}" already exists.` };

  const plan = await prisma.plan.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isActive: parsed.data.isActive,
      isPublic: parsed.data.isPublic,
      priceCents: parsed.data.priceCents,
      currency: parsed.data.currency,
      billingCycle: parsed.data.billingCycle,
      sortOrder: parsed.data.sortOrder,
      memory: parsed.data.memory,
      swap: parsed.data.swap,
      disk: parsed.data.disk,
      cpu: parsed.data.cpu,
      io: parsed.data.io,
      threads: parsed.data.threads ?? null,
      oomKiller: parsed.data.oomKiller,
      databaseLimit: parsed.data.databaseLimit,
      allocationLimit: parsed.data.allocationLimit,
      backupLimit: parsed.data.backupLimit,
    },
  });

  await logActivity({ event: "admin:plan.create", userId: admin.id, properties: { name: plan.name } });
  revalidatePath("/admin/plans");
  return { success: `Plan ${plan.name} created.`, planId: plan.id };
}

export async function updatePlanAction(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const admin = await requirePermission("plans.manage");
  const planId = Number(formData.get("planId"));
  if (!Number.isInteger(planId)) return { error: "Invalid plan." };

  const parsed = parsePlanForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const existing = await prisma.plan.findUnique({ where: { id: planId } });
  if (!existing) return { error: "That plan no longer exists." };

  const clash = await prisma.plan.findFirst({ where: { name: parsed.data.name, id: { not: planId } } });
  if (clash) return { error: `A plan named "${parsed.data.name}" already exists.` };

  const plan = await prisma.plan.update({
    where: { id: planId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isActive: parsed.data.isActive,
      isPublic: parsed.data.isPublic,
      priceCents: parsed.data.priceCents,
      currency: parsed.data.currency,
      billingCycle: parsed.data.billingCycle,
      sortOrder: parsed.data.sortOrder,
      memory: parsed.data.memory,
      swap: parsed.data.swap,
      disk: parsed.data.disk,
      cpu: parsed.data.cpu,
      io: parsed.data.io,
      threads: parsed.data.threads ?? null,
      oomKiller: parsed.data.oomKiller,
      databaseLimit: parsed.data.databaseLimit,
      allocationLimit: parsed.data.allocationLimit,
      backupLimit: parsed.data.backupLimit,
    },
  });

  const warnings: string[] = [];
  const servers = await prisma.server.count({ where: { planId } });
  if (servers > 0) {
    warnings.push(`${servers} existing server(s) were created from this plan. Their current limits are unchanged.`);
  }

  await logActivity({ event: "admin:plan.update", userId: admin.id, properties: { planId, name: plan.name } });
  revalidatePath("/admin/plans");
  return { success: `${plan.name} saved.`, warnings: warnings.length > 0 ? warnings : undefined, planId: plan.id };
}

export async function deletePlanAction(planId: number): Promise<PlanState> {
  const admin = await requirePermission("plans.manage");
  const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { name: true } });
  if (!plan) return { error: "That plan no longer exists." };

  // Packages reference plans; block the delete so a product isn't silently
  // orphaned. Servers keep their limits (planId is nulled via SetNull).
  const packages = await prisma.package.count({ where: { planId } });
  if (packages > 0) {
    return { error: `${packages} package(s) still use this plan. Reassign or delete them first.` };
  }

  const servers = await prisma.server.count({ where: { planId } });
  await prisma.plan.delete({ where: { id: planId } });

  await logActivity({ event: "admin:plan.delete", userId: admin.id, properties: { name: plan.name } });
  revalidatePath("/admin/plans");
  return {
    success: `${plan.name} deleted.`,
    warnings: servers > 0 ? [`${servers} server(s) were unlinked from this plan; their limits are unchanged.`] : undefined,
  };
}

"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity";
import {
  INCIDENT_IMPACTS,
  INCIDENT_STATUSES,
  MONITOR_INTERVAL_MAX,
  MONITOR_INTERVAL_MIN,
  MONITOR_TYPES,
  STATUS_COMPONENT_KINDS,
} from "@/lib/constants";
import { probeComponent, recordCheck } from "@/lib/services/status-monitor";

export interface StatusState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

function fieldErrorsOf(issues: { path: (string | number | symbol)[]; message: string }[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function revalidate() {
  revalidatePath("/admin/status");
  revalidatePath("/status");
}

// ---------------------------------------------------------------------------
// Status components
// ---------------------------------------------------------------------------

const componentSchema = z
  .object({
    name: z.string().trim().min(1, "A name is required.").max(80, "Keep the name under 80 characters."),
    kind: z.enum(STATUS_COMPONENT_KINDS),
    categoryId: z.coerce.number().int().positive().optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
    monitorEnabled: z.coerce.boolean().default(false),
    monitorType: z.enum(MONITOR_TYPES).default("http"),
    monitorTarget: z.string().trim().max(300, "Target is too long.").default(""),
    intervalSeconds: z.coerce.number().int().min(MONITOR_INTERVAL_MIN).max(MONITOR_INTERVAL_MAX).default(60),
    visible: z.coerce.boolean().default(true),
  })
  .refine((data) => !data.monitorEnabled || data.monitorTarget.length > 0, {
    message: "A monitor target is required when monitoring is enabled.",
    path: ["monitorTarget"],
  });

/** Reads the shared component fields from a form into the schema's input shape. */
function componentInput(formData: FormData) {
  return {
    name: formData.get("name"),
    kind: formData.get("kind"),
    categoryId: text(formData, "categoryId"),
    sortOrder: formData.get("sortOrder") ?? 0,
    monitorEnabled: formData.get("monitorEnabled") === "on" || formData.get("monitorEnabled") === "true",
    monitorType: formData.get("monitorType") ?? "http",
    monitorTarget: formData.get("monitorTarget") ?? "",
    intervalSeconds: formData.get("intervalSeconds") ?? 60,
    visible: formData.get("visible") === null ? true : formData.get("visible") === "on" || formData.get("visible") === "true",
  };
}

export async function createComponentAction(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const admin = await requirePermission("status.manage");
  const parsed = componentSchema.safeParse(componentInput(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  // Guard the FK: an unknown categoryId would throw on insert.
  if (parsed.data.categoryId) {
    const exists = await prisma.statusCategory.findUnique({ where: { id: parsed.data.categoryId }, select: { id: true } });
    if (!exists) return { fieldErrors: { categoryId: "That category no longer exists." }, error: "Please fix the highlighted fields." };
  }

  const component = await prisma.statusComponent.create({
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      categoryId: parsed.data.categoryId ?? null,
      sortOrder: parsed.data.sortOrder,
      monitorEnabled: parsed.data.monitorEnabled,
      monitorType: parsed.data.monitorType,
      monitorTarget: parsed.data.monitorTarget,
      intervalSeconds: parsed.data.intervalSeconds,
      visible: parsed.data.visible,
    },
  });

  await logActivity({ event: "admin:status.component.create", userId: admin.id, properties: { name: component.name } });
  revalidate();
  return { success: `Component ${component.name} created.` };
}

export async function updateComponentAction(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const admin = await requirePermission("status.manage");
  const componentId = Number(formData.get("componentId"));
  if (!Number.isInteger(componentId)) return { error: "Invalid component." };

  const parsed = componentSchema.safeParse(componentInput(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const existing = await prisma.statusComponent.findUnique({ where: { id: componentId } });
  if (!existing) return { error: "That component no longer exists." };

  if (parsed.data.categoryId) {
    const exists = await prisma.statusCategory.findUnique({ where: { id: parsed.data.categoryId }, select: { id: true } });
    if (!exists) return { fieldErrors: { categoryId: "That category no longer exists." }, error: "Please fix the highlighted fields." };
  }

  const component = await prisma.statusComponent.update({
    where: { id: componentId },
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      categoryId: parsed.data.categoryId ?? null,
      sortOrder: parsed.data.sortOrder,
      monitorEnabled: parsed.data.monitorEnabled,
      monitorType: parsed.data.monitorType,
      monitorTarget: parsed.data.monitorTarget,
      intervalSeconds: parsed.data.intervalSeconds,
      visible: parsed.data.visible,
    },
  });

  await logActivity({ event: "admin:status.component.update", userId: admin.id, properties: { componentId, name: component.name } });
  revalidate();
  return { success: `${component.name} saved.` };
}

/** Flips monitorEnabled without opening the full editor. */
export async function toggleMonitorAction(componentId: number): Promise<StatusState> {
  const admin = await requirePermission("status.manage");
  const existing = await prisma.statusComponent.findUnique({
    where: { id: componentId },
    select: { name: true, monitorEnabled: true, monitorTarget: true },
  });
  if (!existing) return { error: "That component no longer exists." };
  if (!existing.monitorEnabled && !existing.monitorTarget.trim())
    return { error: "Set a monitor target before enabling monitoring." };

  await prisma.statusComponent.update({ where: { id: componentId }, data: { monitorEnabled: !existing.monitorEnabled } });
  await logActivity({
    event: "admin:status.component.monitor",
    userId: admin.id,
    properties: { componentId, enabled: !existing.monitorEnabled },
  });
  revalidate();
  return { success: existing.monitorEnabled ? `Monitoring paused for ${existing.name}.` : `Monitoring enabled for ${existing.name}.` };
}

/** Flips public visibility of a component. */
export async function toggleVisibleAction(componentId: number): Promise<StatusState> {
  await requirePermission("status.manage");
  const existing = await prisma.statusComponent.findUnique({ where: { id: componentId }, select: { name: true, visible: true } });
  if (!existing) return { error: "That component no longer exists." };
  await prisma.statusComponent.update({ where: { id: componentId }, data: { visible: !existing.visible } });
  revalidate();
  return { success: existing.visible ? `${existing.name} hidden from the public page.` : `${existing.name} is now public.` };
}

/** Runs an immediate probe (the "check now" button) and records the result. */
export async function checkNowAction(componentId: number): Promise<StatusState> {
  await requirePermission("status.manage");
  const component = await prisma.statusComponent.findUnique({
    where: { id: componentId },
    select: { name: true, monitorType: true, monitorTarget: true },
  });
  if (!component) return { error: "That component no longer exists." };
  if (!component.monitorTarget.trim()) return { error: "Set a monitor target first." };

  const result = await probeComponent(component);
  await recordCheck(componentId, result);
  revalidate();
  return result.ok
    ? { success: `${component.name} is up${result.latencyMs !== null ? ` (${result.latencyMs}ms).` : "."}` }
    : { error: `${component.name} is down: ${result.error ?? "unreachable"}.` };
}

export async function deleteComponentAction(componentId: number): Promise<StatusState> {
  const admin = await requirePermission("status.manage");
  const component = await prisma.statusComponent.findUnique({ where: { id: componentId }, select: { name: true } });
  if (!component) return { error: "That component no longer exists." };

  await prisma.statusComponent.delete({ where: { id: componentId } });
  await logActivity({ event: "admin:status.component.delete", userId: admin.id, properties: { name: component.name } });
  revalidate();
  return { success: `${component.name} deleted.` };
}

/** Moves a component up or down by swapping sortOrder with its neighbour. */
export async function reorderComponentAction(componentId: number, direction: "up" | "down"): Promise<StatusState> {
  await requirePermission("status.manage");
  const current = await prisma.statusComponent.findUnique({ where: { id: componentId } });
  if (!current) return { error: "That component no longer exists." };

  const neighbour = await prisma.statusComponent.findFirst({
    where:
      direction === "up"
        ? { OR: [{ sortOrder: { lt: current.sortOrder } }, { sortOrder: current.sortOrder, id: { lt: current.id } }] }
        : { OR: [{ sortOrder: { gt: current.sortOrder } }, { sortOrder: current.sortOrder, id: { gt: current.id } }] },
    orderBy:
      direction === "up"
        ? [{ sortOrder: "desc" }, { id: "desc" }]
        : [{ sortOrder: "asc" }, { id: "asc" }],
  });
  if (!neighbour) return { success: "Already at the edge." };

  await prisma.$transaction([
    prisma.statusComponent.update({ where: { id: current.id }, data: { sortOrder: neighbour.sortOrder } }),
    prisma.statusComponent.update({ where: { id: neighbour.id }, data: { sortOrder: current.sortOrder } }),
  ]);
  revalidate();
  return { success: "Reordered." };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  name: z.string().trim().min(1, "A name is required.").max(80, "Keep the name under 80 characters."),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function createCategoryAction(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const admin = await requirePermission("status.manage");
  const parsed = categorySchema.safeParse({ name: formData.get("name"), sortOrder: formData.get("sortOrder") ?? 0 });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const category = await prisma.statusCategory.create({ data: parsed.data });
  await logActivity({ event: "admin:status.category.create", userId: admin.id, properties: { name: category.name } });
  revalidate();
  return { success: `Category ${category.name} created.` };
}

export async function updateCategoryAction(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const admin = await requirePermission("status.manage");
  const categoryId = Number(formData.get("categoryId"));
  if (!Number.isInteger(categoryId)) return { error: "Invalid category." };

  const parsed = categorySchema.safeParse({ name: formData.get("name"), sortOrder: formData.get("sortOrder") ?? 0 });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const existing = await prisma.statusCategory.findUnique({ where: { id: categoryId } });
  if (!existing) return { error: "That category no longer exists." };

  const category = await prisma.statusCategory.update({ where: { id: categoryId }, data: parsed.data });
  await logActivity({ event: "admin:status.category.update", userId: admin.id, properties: { categoryId, name: category.name } });
  revalidate();
  return { success: `${category.name} saved.` };
}

/** Deletes a category; its components are detached (categoryId -> null), not removed. */
export async function deleteCategoryAction(categoryId: number): Promise<StatusState> {
  const admin = await requirePermission("status.manage");
  const category = await prisma.statusCategory.findUnique({ where: { id: categoryId }, select: { name: true } });
  if (!category) return { error: "That category no longer exists." };

  // onDelete: SetNull on StatusComponent.categoryId handles detachment.
  await prisma.statusCategory.delete({ where: { id: categoryId } });
  await logActivity({ event: "admin:status.category.delete", userId: admin.id, properties: { name: category.name } });
  revalidate();
  return { success: `Category ${category.name} deleted.` };
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

const incidentSchema = z.object({
  title: z.string().trim().min(1, "A title is required.").max(160, "Keep the title under 160 characters."),
  impact: z.enum(INCIDENT_IMPACTS),
  status: z.enum(INCIDENT_STATUSES),
  body: z.string().trim().min(1, "An opening update is required.").max(4000, "Keep the update under 4000 characters."),
});

export async function createIncidentAction(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const admin = await requirePermission("status.manage");
  const parsed = incidentSchema.safeParse({
    title: formData.get("title"),
    impact: formData.get("impact"),
    status: formData.get("status"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const resolved = parsed.data.status === "resolved";
  const incident = await prisma.incident.create({
    data: {
      uuid: randomUUID(),
      title: parsed.data.title,
      impact: parsed.data.impact,
      status: parsed.data.status,
      resolvedAt: resolved ? new Date() : null,
      updates: { create: { body: parsed.data.body, status: parsed.data.status } },
    },
  });

  await logActivity({ event: "admin:status.incident.create", userId: admin.id, properties: { title: incident.title } });
  revalidate();
  return { success: `Incident "${incident.title}" opened.` };
}

const updateSchema = z.object({
  status: z.enum(INCIDENT_STATUSES),
  body: z.string().trim().min(1, "An update body is required.").max(4000, "Keep the update under 4000 characters."),
});

/** Posts an update that also advances the incident status (and resolves it). */
export async function postUpdateAction(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const admin = await requirePermission("status.manage");
  const incidentId = Number(formData.get("incidentId"));
  if (!Number.isInteger(incidentId)) return { error: "Invalid incident." };

  const parsed = updateSchema.safeParse({ status: formData.get("status"), body: formData.get("body") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues), error: "Please fix the highlighted fields." };

  const existing = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!existing) return { error: "That incident no longer exists." };

  const resolved = parsed.data.status === "resolved";
  await prisma.$transaction([
    prisma.incidentUpdate.create({ data: { incidentId, body: parsed.data.body, status: parsed.data.status } }),
    prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: parsed.data.status,
        resolvedAt: resolved ? existing.resolvedAt ?? new Date() : null,
      },
    }),
  ]);

  await logActivity({ event: "admin:status.incident.update", userId: admin.id, properties: { incidentId, status: parsed.data.status } });
  revalidate();
  return { success: resolved ? "Incident resolved." : "Update posted." };
}

export async function deleteIncidentAction(incidentId: number): Promise<StatusState> {
  const admin = await requirePermission("status.manage");
  const incident = await prisma.incident.findUnique({ where: { id: incidentId }, select: { title: true } });
  if (!incident) return { error: "That incident no longer exists." };

  await prisma.incident.delete({ where: { id: incidentId } });
  await logActivity({ event: "admin:status.incident.delete", userId: admin.id, properties: { title: incident.title } });
  revalidate();
  return { success: `Incident "${incident.title}" deleted.` };
}

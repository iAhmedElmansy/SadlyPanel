import { prisma } from "../db";
import type { Package, Plan } from "@prisma/client";

/**
 * Subscription/entitlement layer.
 *
 * A package is UNLOCKED for a user when any of these hold:
 *  - it has no PlanPackage rows AND no requiredPlanId (public to every plan), OR
 *  - the user's plan is present in the package's PlanPackage set, OR
 *  - the user's plan satisfies requiredPlanId (same plan, or ranks at least as
 *    high by sortOrder — a lower sortOrder sorts first / is the "higher" tier).
 *
 * Admins are never locked. Enforcement is server-side: callers must gate on
 * assertUserCanUsePackage before provisioning; the wizard's disabled state is
 * only a UX affordance.
 */

/** The minimal user shape the entitlement checks need. */
export interface EntitlementUser {
  id: number;
  role: string;
  rootAdmin?: boolean;
}

export interface PackageEntitlement {
  package: Package;
  locked: boolean;
  requiredPlanName?: string;
}

function isAdmin(user: EntitlementUser): boolean {
  return user.rootAdmin === true || user.role === "admin";
}

/**
 * Resolves the user's plan sortOrder (lower = higher tier). Returns null when
 * the user has no plan assigned.
 */
async function userPlan(userId: number): Promise<{ id: number; sortOrder: number } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: { select: { id: true, sortOrder: true } } },
  });
  return user?.plan ?? null;
}

/**
 * Returns every package annotated with whether it is locked for the given user
 * and, when locked via a minimum plan, the plan's name for a helpful message.
 */
export async function getAvailablePackagesForUser(user: EntitlementUser): Promise<PackageEntitlement[]> {
  const packages = await prisma.package.findMany({
    include: {
      requiredPlan: { select: { name: true, sortOrder: true } },
      plans: { select: { planId: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const admin = isAdmin(user);
  const plan = admin ? null : await userPlan(user.id);

  return packages.map((pkg) => {
    const { requiredPlan, plans, ...bare } = pkg;
    const pkgPackage = bare as Package;

    if (admin) return { package: pkgPackage, locked: false };

    const restrictedByJoin = plans.length > 0;
    const restrictedByMin = pkg.requiredPlanId !== null;

    // No restrictions at all → public to every plan (and to plan-less users).
    if (!restrictedByJoin && !restrictedByMin) return { package: pkgPackage, locked: false };

    // Satisfied by the explicit availability set.
    if (restrictedByJoin && plan && plans.some((row) => row.planId === plan.id)) {
      return { package: pkgPackage, locked: false };
    }

    // Satisfied by the minimum-plan shortcut: same plan, or a higher tier
    // (lower or equal sortOrder).
    if (restrictedByMin && plan && requiredPlan) {
      if (plan.id === pkg.requiredPlanId || plan.sortOrder <= requiredPlan.sortOrder) {
        return { package: pkgPackage, locked: false };
      }
    }

    return {
      package: pkgPackage,
      locked: true,
      requiredPlanName: requiredPlan?.name ?? undefined,
    };
  });
}

export interface EntitlementCheck {
  ok: boolean;
  error?: string;
  requiredPlanName?: string;
}

/**
 * Server-side gate. Returns ok=false with a client-safe message when the given
 * package is locked for the user. Non-existent packages are treated as ok so
 * callers keep their existing "invalid id is dropped" behaviour.
 */
export async function assertUserCanUsePackage(user: EntitlementUser, packageId: number): Promise<EntitlementCheck> {
  if (isAdmin(user)) return { ok: true };

  const pkg = await prisma.package.findUnique({
    where: { id: packageId },
    include: {
      requiredPlan: { select: { name: true, sortOrder: true } },
      plans: { select: { planId: true } },
    },
  });
  if (!pkg) return { ok: true };

  const restrictedByJoin = pkg.plans.length > 0;
  const restrictedByMin = pkg.requiredPlanId !== null;
  if (!restrictedByJoin && !restrictedByMin) return { ok: true };

  const plan = await userPlan(user.id);

  if (restrictedByJoin && plan && pkg.plans.some((row) => row.planId === plan.id)) return { ok: true };
  if (
    restrictedByMin &&
    plan &&
    pkg.requiredPlan &&
    (plan.id === pkg.requiredPlanId || plan.sortOrder <= pkg.requiredPlan.sortOrder)
  ) {
    return { ok: true };
  }

  const requiredPlanName = pkg.requiredPlan?.name;
  return {
    ok: false,
    requiredPlanName: requiredPlanName ?? undefined,
    error: requiredPlanName
      ? `This package requires the ${requiredPlanName} plan. Upgrade your plan to deploy it.`
      : "This package is not available on your current plan.",
  };
}

// ---------------------------------------------------------------------------
// Node → plan gating (mirrors the package rules above)
//
// A node with requiredPlanId set is only selectable by users whose plan is that
// plan, or a higher tier (lower/equal sortOrder). Nodes with no requiredPlanId
// are open to everyone (including plan-less users). Admins are never gated.
// ---------------------------------------------------------------------------

/** Full plan row for the user, used for quota display + node gating. Null when unassigned. */
export async function getUserPlan(userId: number): Promise<Plan | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  return user?.plan ?? null;
}

/** Pure check: does the user's plan satisfy a node's minimum-plan requirement? */
export function planSatisfiesNode(
  node: { requiredPlanId: number | null; requiredPlan?: { sortOrder: number } | null },
  plan: { id: number; sortOrder: number } | null,
): boolean {
  if (node.requiredPlanId === null) return true;
  if (!plan) return false;
  if (plan.id === node.requiredPlanId) return true;
  return node.requiredPlan ? plan.sortOrder <= node.requiredPlan.sortOrder : false;
}

/**
 * Server-side gate for node selection in the self-service wizard. Returns
 * ok=false with a client-safe message (and the required plan name) when the
 * node is reserved for a plan the user doesn't hold.
 */
export async function assertUserCanUseNode(user: EntitlementUser, nodeId: number): Promise<EntitlementCheck> {
  if (isAdmin(user)) return { ok: true };

  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: { requiredPlanId: true, requiredPlan: { select: { name: true, sortOrder: true } } },
  });
  if (!node || node.requiredPlanId === null) return { ok: true };

  const plan = await userPlan(user.id);
  if (planSatisfiesNode(node, plan)) return { ok: true };

  const requiredPlanName = node.requiredPlan?.name;
  return {
    ok: false,
    requiredPlanName: requiredPlanName ?? undefined,
    error: requiredPlanName
      ? `This node is reserved for the ${requiredPlanName} plan. Upgrade your plan to deploy here.`
      : "This node is not available on your current plan.",
  };
}

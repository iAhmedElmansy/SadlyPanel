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

// ---------------------------------------------------------------------------
// Plan quota (aggregate resource allowance across a user's servers)
//
// A user's plan grants a POOL of memory / disk / cpu shared across every server
// they own; each new self-service server draws from what's left after their
// existing servers. A plan dimension of 0 means "unlimited" (no cap), mirroring
// the Server semantics where 0 = unlimited. Ports and databases are per-server
// feature caps (plan.allocationLimit / plan.databaseLimit), not pooled, and are
// enforced at the server level rather than here.
// ---------------------------------------------------------------------------

export type QuotaDimension = "memory" | "disk" | "cpu";

export interface PlanQuota {
  plan: Plan;
  /** Aggregate usage across the user's existing servers (MiB / MiB / % cpu). */
  used: { memory: number; disk: number; cpu: number };
  /** Remaining allowance per dimension. Number.POSITIVE_INFINITY when unlimited. */
  remaining: { memory: number; disk: number; cpu: number };
  /** True when the plan sets the dimension to 0 (uncapped). */
  unlimited: { memory: boolean; disk: boolean; cpu: boolean };
  /** How many servers the user already owns. */
  serverCount: number;
}

/**
 * Resolves the user's plan plus how much of its pooled RAM / disk / CPU their
 * existing servers already consume, and what remains. Returns null when the
 * user has no plan assigned (self-service is blocked in that case).
 */
export async function getUserPlanQuota(userId: number): Promise<PlanQuota | null> {
  const plan = await getUserPlan(userId);
  if (!plan) return null;

  const [aggregate, serverCount] = await Promise.all([
    prisma.server.aggregate({ where: { ownerId: userId }, _sum: { memory: true, disk: true, cpu: true } }),
    prisma.server.count({ where: { ownerId: userId } }),
  ]);

  const used = {
    memory: aggregate._sum.memory ?? 0,
    disk: aggregate._sum.disk ?? 0,
    cpu: aggregate._sum.cpu ?? 0,
  };

  const left = (total: number, consumed: number) =>
    total <= 0 ? Number.POSITIVE_INFINITY : Math.max(0, total - consumed);

  return {
    plan,
    used,
    remaining: {
      memory: left(plan.memory, used.memory),
      disk: left(plan.disk, used.disk),
      cpu: left(plan.cpu, used.cpu),
    },
    unlimited: { memory: plan.memory <= 0, disk: plan.disk <= 0, cpu: plan.cpu <= 0 },
    serverCount,
  };
}

/**
 * Pure check: returns the first dimension whose requested amount exceeds the
 * plan's remaining allowance, or null when the whole request fits. Unlimited
 * dimensions never fail. Used by the create action to reject over-quota
 * requests without trusting the clamped client values.
 */
export function quotaExceededDimension(
  quota: Pick<PlanQuota, "remaining" | "unlimited">,
  req: { memory: number; disk: number; cpu: number },
): QuotaDimension | null {
  if (!quota.unlimited.memory && req.memory > quota.remaining.memory) return "memory";
  if (!quota.unlimited.disk && req.disk > quota.remaining.disk) return "disk";
  if (!quota.unlimited.cpu && req.cpu > quota.remaining.cpu) return "cpu";
  return null;
}

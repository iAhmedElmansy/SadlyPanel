import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getEnabledMethods, getPaymentSettings } from "@/lib/services/payments";
import { BillingCheckout } from "./billing-checkout";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; status?: string }>;
}) {
  const user = await requireUser();
  const { plan: planParam, status } = await searchParams;

  const [plans, settings, current, recentOrders] = await Promise.all([
    prisma.plan.findMany({
      where: { isActive: true, isPublic: true },
      orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }],
    }),
    getPaymentSettings(),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { planId: true, planExpiresAt: true, plan: { select: { name: true } } },
    }),
    prisma.paymentOrder.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { plan: { select: { name: true } } },
    }),
  ]);

  const methods = await getEnabledMethods(settings);

  return (
    <BillingCheckout
      plans={plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        currency: p.currency,
        billingCycle: p.billingCycle,
        memory: p.memory,
        disk: p.disk,
        cpu: p.cpu,
        databaseLimit: p.databaseLimit,
        allocationLimit: p.allocationLimit,
        backupLimit: p.backupLimit,
      }))}
      methods={methods}
      vodafone={{ phone: settings.vodafoneCash.phone, instructions: settings.vodafoneCash.instructions }}
      preselectPlanId={planParam ? Number(planParam) : null}
      status={status ?? null}
      currentPlan={
        current?.planId
          ? { name: current.plan?.name ?? "Current plan", expiresAt: current.planExpiresAt?.toISOString() ?? null }
          : null
      }
      recentOrders={recentOrders.map((o) => ({
        id: o.id,
        plan: o.plan.name,
        method: o.method,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        rejectionReason: o.rejectionReason,
      }))}
    />
  );
}

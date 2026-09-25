import type { Metadata } from "next";
import Link from "next/link";
import { Check, LifeBuoy, Layers } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCpu, formatMib, formatPrice } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dashboard.plansMetaTitle") };
}
export const dynamic = "force-dynamic";

interface PlanResources {
  memory: number;
  disk: number;
  cpu: number;
  databaseLimit: number;
  backupLimit: number;
  allocationLimit: number;
}

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function resourceLines(plan: PlanResources, t: Translator): string[] {
  return [
    t("dashboard.plansResMemory", { value: formatMib(plan.memory) }),
    t("dashboard.plansResDisk", { value: formatMib(plan.disk) }),
    t("dashboard.plansResCpu", { value: formatCpu(plan.cpu) }),
    plan.databaseLimit === 1
      ? t("dashboard.plansResDatabase", { count: plan.databaseLimit })
      : t("dashboard.plansResDatabases", { count: plan.databaseLimit }),
    plan.backupLimit === 1
      ? t("dashboard.plansResBackup", { count: plan.backupLimit })
      : t("dashboard.plansResBackups", { count: plan.backupLimit }),
    plan.allocationLimit === 1
      ? t("dashboard.plansResPort", { count: plan.allocationLimit })
      : t("dashboard.plansResPorts", { count: plan.allocationLimit }),
  ];
}

export default async function PlansPage() {
  const user = await requireUser();
  const t = await getT();

  const [account, plans] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { planId: true, plan: true },
    }),
    prisma.plan.findMany({
      where: { isPublic: true, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const currentPlan = account?.plan ?? null;
  const currentPlanId = account?.planId ?? null;

  return (
    <>
      <PageHeader
        title={t("dashboard.plansTitle")}
        description={t("dashboard.plansDescription")}
      />

      <Card>
        <CardHeader
          title={t("dashboard.plansCurrentTitle")}
          description={t("dashboard.plansCurrentDescription")}
        />
        {currentPlan ? (
          <CardBody>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-ink">{currentPlan.name}</h3>
                  <Badge tone="brand">{t("dashboard.plansCurrentBadge")}</Badge>
                </div>
                {currentPlan.description ? (
                  <p className="mt-1 text-sm text-ink-muted">{currentPlan.description}</p>
                ) : null}
              </div>
              <span className="text-2xl font-semibold text-ink">
                {formatPrice(currentPlan.priceCents, currentPlan.currency, currentPlan.billingCycle)}
              </span>
            </div>
            <ul className="mt-5 grid gap-2 border-t border-line-soft pt-5 text-sm text-ink-muted sm:grid-cols-2 lg:grid-cols-3">
              {resourceLines(currentPlan, t).map((line) => (
                <li key={line} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-ok" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        ) : (
          <EmptyState
            icon={<Layers className="size-5" />}
            title={t("dashboard.plansNoPlanTitle")}
            description={t("dashboard.plansNoPlanDescription")}
            action={
              <Link href="/dashboard/tickets" className="btn btn-ghost">
                <LifeBuoy className="size-4" />
                {t("dashboard.plansContactSupport")}
              </Link>
            }
          />
        )}
      </Card>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">{t("dashboard.plansAvailableTitle")}</h2>
        {plans.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Layers className="size-5" />}
              title={t("dashboard.plansNoneTitle")}
              description={t("dashboard.plansNoneDescription")}
            />
          </Card>
        ) : (
          <div className="grid animate-in gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlanId;
              return (
                <div
                  key={plan.id}
                  className={
                    "panel-card relative flex h-full flex-col p-6" +
                    (isCurrent ? " border-brand/50 shadow-[var(--shadow-brand)]" : " lift")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-ink">{plan.name}</h3>
                    {isCurrent ? <Badge tone="brand">{t("dashboard.plansCurrentBadge")}</Badge> : null}
                  </div>
                  {plan.description ? (
                    <p className="mt-1 text-sm text-ink-muted">{plan.description}</p>
                  ) : null}

                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold text-ink">
                      {formatPrice(plan.priceCents, plan.currency, plan.billingCycle)}
                    </span>
                  </div>

                  <ul className="mt-5 space-y-2 border-t border-line-soft pt-5 text-sm text-ink-muted">
                    {resourceLines(plan, t).map((line) => (
                      <li key={line} className="flex items-center gap-2">
                        <Check className="size-4 shrink-0 text-ok" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 pt-2">
                    {isCurrent ? (
                      <p className="text-center text-xs text-ink-dim">{t("dashboard.plansOnThisPlan")}</p>
                    ) : (
                      <Link
                        href="/dashboard/tickets"
                        className="btn btn-ghost w-full"
                      >
                        <LifeBuoy className="size-4" />
                        {t("dashboard.plansChangePlan")}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

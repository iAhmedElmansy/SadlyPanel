import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Lock, Package as PackageIcon } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getAvailablePackagesForUser } from "@/lib/services/entitlements";
import { formatCpu, formatMib, formatPrice } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dashboard.packagesMetaTitle") };
}
export const dynamic = "force-dynamic";

interface PlanResources {
  memory: number;
  disk: number;
  cpu: number;
}

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function resourceLines(plan: PlanResources, t: Translator): string[] {
  return [
    t("dashboard.packagesResMemory", { value: formatMib(plan.memory) }),
    t("dashboard.packagesResDisk", { value: formatMib(plan.disk) }),
    t("dashboard.packagesResCpu", { value: formatCpu(plan.cpu) }),
  ];
}

export default async function PackagesPage() {
  const user = await requireUser();
  const t = await getT();
  const isAdmin = user.role === "admin" || user.rootAdmin;

  const entitlements = await getAvailablePackagesForUser({
    id: user.id,
    role: user.role,
    rootAdmin: user.rootAdmin,
  });

  // Clients see only public packages (locked ones shown disabled); admins see all.
  const visible = isAdmin ? entitlements : entitlements.filter((entry) => entry.package.isPublic);

  const planIds = [
    ...new Set(visible.map((entry) => entry.package.planId).filter((id): id is number => id !== null)),
  ];
  const planRows = planIds.length
    ? await prisma.plan.findMany({ where: { id: { in: planIds } } })
    : [];
  const planMap = new Map(planRows.map((plan) => [plan.id, plan]));

  return (
    <>
      <PageHeader
        title={t("dashboard.packagesTitle")}
        description={t("dashboard.packagesDescription")}
      />

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PackageIcon className="size-5" />}
            title={t("dashboard.packagesNoneTitle")}
            description={t("dashboard.packagesNoneDescription")}
          />
        </Card>
      ) : (
        <div className="grid animate-in gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(({ package: pkg, locked, requiredPlanName }) => {
            const plan = pkg.planId !== null ? planMap.get(pkg.planId) : undefined;
            return (
              <div
                key={pkg.id}
                className={"panel-card flex h-full flex-col p-6" + (locked ? " opacity-70" : " lift")}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-ink">{pkg.name}</h3>
                  {locked ? (
                    <Badge tone="neutral">
                      <Lock className="size-3" />
                      {t("dashboard.packagesLocked")}
                    </Badge>
                  ) : (
                    <Badge tone="ok">{t("dashboard.packagesAvailable")}</Badge>
                  )}
                </div>

                {pkg.description ? <p className="mt-1 text-sm text-ink-muted">{pkg.description}</p> : null}

                {plan ? (
                  <div className="mt-4 text-sm text-ink-muted">
                    <span className="text-lg font-semibold text-ink">
                      {formatPrice(plan.priceCents, plan.currency, plan.billingCycle)}
                    </span>
                    <ul className="mt-3 space-y-2 border-t border-line-soft pt-4">
                      {resourceLines(plan, t).map((line) => (
                        <li key={line} className="flex items-center gap-2">
                          <Check className="size-4 shrink-0 text-ok" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-6 flex flex-1 flex-col justify-end pt-2">
                  {locked ? (
                    <p className="text-center text-xs text-ink-dim">
                      {requiredPlanName
                        ? t("dashboard.packagesRequiresPlan", { plan: requiredPlanName })
                        : t("dashboard.packagesNotAvailable")}
                    </p>
                  ) : (
                    <Link href={`/dashboard/servers/new?package=${pkg.id}`} className="btn btn-primary w-full">
                      {t("dashboard.packagesDeploy")}
                      <ArrowRight className="size-4" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

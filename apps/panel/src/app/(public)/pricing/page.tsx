import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Package as PackageIcon, Tag } from "lucide-react";
import { prisma } from "@/lib/db";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/ui/reveal";
import { formatCpu, formatMib, formatPrice } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translate";
import { SpotlightCard } from "../spotlight-card";
import { CountUp } from "../count-up";

/** Mirrors formatPrice's billing-cycle suffix for the animated price. */
const CYCLE_SUFFIX: Record<string, string> = { monthly: "/mo", yearly: "/yr", once: "", free: "" };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("public.metaPricing") };
}
export const dynamic = "force-dynamic";

function resourceLines(
  plan: {
    memory: number;
    disk: number;
    cpu: number;
    databaseLimit: number;
    backupLimit: number;
    allocationLimit: number;
  },
  t: Translator,
): string[] {
  return [
    t("public.resMemory", { value: formatMib(plan.memory) }),
    t("public.resDisk", { value: formatMib(plan.disk) }),
    t("public.resCpu", { value: formatCpu(plan.cpu) }),
    t(plan.databaseLimit === 1 ? "public.resDatabaseOne" : "public.resDatabaseOther", { count: plan.databaseLimit }),
    t(plan.backupLimit === 1 ? "public.resBackupOne" : "public.resBackupOther", { count: plan.backupLimit }),
    t(plan.allocationLimit === 1 ? "public.resPortOne" : "public.resPortOther", { count: plan.allocationLimit }),
  ];
}

export default async function PricingPage() {
  const t = await getT();
  const packages = await prisma.package.findMany({
    where: { isPublic: true, planId: { not: null } },
    include: { plan: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const priced = packages.filter((pkg) => pkg.plan !== null);

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(55rem 26rem at 50% -10%, color-mix(in srgb, var(--color-brand) 12%, transparent), transparent 60%)",
        }}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <div className="max-w-2xl animate-in">
        <span className="badge border-brand/40 bg-brand/12 text-brand-soft">
          <Tag className="size-3" />
          {t("public.pricingBadge")}
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{t("public.pricingTitle")}</h1>
        <p className="mt-3 text-sm text-ink-muted sm:text-base">
          {t("public.pricingDesc")}
        </p>
      </div>

      {priced.length === 0 ? (
        <div className="panel-card mt-10">
          <EmptyState
            icon={<PackageIcon className="size-5" />}
            title={t("public.plansComingSoon")}
            description={t("public.plansComingSoonDesc")}
            action={
              <Link href="/auth/register" className="btn btn-primary">
                {t("public.createAccount")}
                <ArrowRight className="size-4" />
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {priced.map((pkg, i) => {
            const plan = pkg.plan!;
            const numeric = plan.billingCycle !== "free" && plan.priceCents > 0;
            return (
              <Reveal key={pkg.id} delay={i * 90}>
                <SpotlightCard className="panel-card lift relative flex h-full flex-col overflow-hidden p-6">
                  <h2 className="text-base font-semibold text-ink">{pkg.name}</h2>
                  {pkg.description ? <p className="mt-1 text-sm text-ink-muted">{pkg.description}</p> : null}

                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold text-ink">
                      {numeric ? (
                        <CountUp
                          to={plan.priceCents / 100}
                          currency={plan.currency}
                          suffix={CYCLE_SUFFIX[plan.billingCycle] ?? ""}
                        />
                      ) : (
                        formatPrice(plan.priceCents, plan.currency, plan.billingCycle)
                      )}
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
                    <Link href="/auth/register" className="btn btn-primary w-full">
                      {t("public.getStarted")}
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </SpotlightCard>
              </Reveal>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}

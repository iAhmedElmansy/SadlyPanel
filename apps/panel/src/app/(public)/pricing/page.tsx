import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Layers, Sparkles, Tag } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
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

  // Subscribable plans come straight from the Plan catalog now (not Packages), so
  // /pricing shows exactly what a customer can buy on /dashboard/billing.
  const [plans, authUser] = await Promise.all([
    prisma.plan.findMany({
      where: { isActive: true, isPublic: true },
      orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }],
    }),
    getCurrentUser(),
  ]);

  let currentPlanId: number | null = null;
  if (authUser) {
    const me = await prisma.user.findUnique({ where: { id: authUser.id }, select: { planId: true } });
    currentPlanId = me?.planId ?? null;
  }

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
          <p className="mt-3 text-sm text-ink-muted sm:text-base">{t("public.pricingDesc")}</p>
        </div>

        {plans.length === 0 ? (
          <div className="panel-card mt-10">
            <EmptyState
              icon={<Layers className="size-5" />}
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
            {plans.map((plan, i) => {
              const numeric = plan.billingCycle !== "free" && plan.priceCents > 0;
              const isCurrent = currentPlanId === plan.id;
              const target = authUser ? `/dashboard/billing?plan=${plan.id}` : "/auth/register";
              return (
                <Reveal key={plan.id} delay={i * 90}>
                  <SpotlightCard className="panel-card lift relative flex h-full flex-col overflow-hidden p-6">
                    {isCurrent ? (
                      <span className="badge absolute right-4 top-4 border-ok/40 bg-ok/12 text-ok">
                        <Check className="size-3" />
                        {/* Fallback plain text — no dedicated i18n key needed. */}
                        Current plan
                      </span>
                    ) : null}
                    <h2 className="text-base font-semibold text-ink">{plan.name}</h2>
                    {plan.description ? <p className="mt-1 text-sm text-ink-muted">{plan.description}</p> : null}

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
                      {isCurrent ? (
                        <span className="btn btn-ghost w-full cursor-default opacity-70">
                          <Sparkles className="size-4" />
                          Active subscription
                        </span>
                      ) : (
                        <Link href={target} className="btn btn-primary w-full">
                          {t("public.getStarted")}
                          <ArrowRight className="size-4" />
                        </Link>
                      )}
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

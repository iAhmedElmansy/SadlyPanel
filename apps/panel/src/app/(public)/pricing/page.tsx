import type { Metadata } from "next";
import Link from "next/link";
import {
  Archive,
  ArrowRight,
  Check,
  Cpu,
  Database,
  HardDrive,
  Layers,
  MemoryStick,
  Network,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/ui/reveal";
import { cn, formatPrice } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translate";
import { SpotlightCard } from "../spotlight-card";
import { CountUp } from "../count-up";
import { SectionLabel } from "../fx/section-label";
import { SectionBackdrop } from "../fx/section-backdrop";

/** Amber accent — mirrors the landing pricing section so /pricing reads as one system. */
const PRICING_ACCENT = "#fbbf24";

/** Mirrors formatPrice's billing-cycle suffix for the animated price. */
const CYCLE_SUFFIX: Record<string, string> = { monthly: "/mo", yearly: "/yr", once: "", free: "" };

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("public.metaPricing") };
}

/** MiB → a clean marketing capacity label (5120 → "5 GB", 512 → "512 MB"). */
function formatCapacity(mib: number): string {
  if (mib < 1024) return `${mib} MB`;
  const gb = Math.round((mib / 1024) * 10) / 10;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}

/** CPU percent → whole "vCPU cores" when it divides evenly, else "X% CPU"; 0 = unlimited. */
function cpuLabel(cpu: number, t: Translator): string {
  if (cpu === 0) return t("public.planCpuUnlimited");
  if (cpu % 100 === 0) {
    const cores = cpu / 100;
    return t(cores === 1 ? "public.planCpuCoresOne" : "public.planCpuCoresOther", { count: cores });
  }
  return t("public.planCpuPercent", { value: cpu });
}

interface PlanLimits {
  memory: number;
  disk: number;
  cpu: number;
  databaseLimit: number;
  allocationLimit: number;
  backupLimit: number;
}

/** The six headline limits every plan card lists, each with its own glyph. */
function planFeatures(plan: PlanLimits, t: Translator): { key: string; icon: LucideIcon; text: string }[] {
  return [
    {
      key: "disk",
      icon: HardDrive,
      text: plan.disk === 0 ? t("public.planStorageUnlimited") : t("public.planStorage", { value: formatCapacity(plan.disk) }),
    },
    {
      key: "memory",
      icon: MemoryStick,
      text: plan.memory === 0 ? t("public.planRamUnlimited") : t("public.planRam", { value: formatCapacity(plan.memory) }),
    },
    { key: "cpu", icon: Cpu, text: cpuLabel(plan.cpu, t) },
    {
      key: "db",
      icon: Database,
      text: t(plan.databaseLimit === 1 ? "public.planDatabasesOne" : "public.planDatabasesOther", { count: plan.databaseLimit }),
    },
    {
      key: "ports",
      icon: Network,
      text: t(plan.allocationLimit === 1 ? "public.planPortsOne" : "public.planPortsOther", { count: plan.allocationLimit }),
    },
    {
      key: "backups",
      icon: Archive,
      text: t(plan.backupLimit === 1 ? "public.planBackupsOne" : "public.planBackupsOther", { count: plan.backupLimit }),
    },
  ];
}

/** Descriptor under the headline price so the billing cadence is unmistakable. */
function cadenceLabel(numeric: boolean, billingCycle: string, t: Translator): string {
  if (!numeric) return t("public.planCadenceFree");
  if (billingCycle === "yearly") return t("public.planCadenceYearly");
  if (billingCycle === "once") return t("public.planCadenceOnce");
  return t("public.planCadenceMonthly");
}

export default async function PricingPage() {
  const t = await getT();

  // Subscribable plans come straight from the Plan catalog, so /pricing shows
  // exactly what a customer can buy on /dashboard/billing.
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
    <section className="relative isolate overflow-hidden">
      <SectionBackdrop variant="glow" accent={PRICING_ACCENT} />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <header className="max-w-2xl">
          <SectionLabel icon="package" label={t("public.pricingBadge")} anim="rise" accent={PRICING_ACCENT} badge />
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            {t("public.pricingTitle")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">{t("public.pricingDesc")}</p>
        </header>

        {plans.length === 0 ? (
          <div className="panel-card mt-12">
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
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan, i) => {
              const numeric = plan.billingCycle !== "free" && plan.priceCents > 0;
              const isCurrent = currentPlanId === plan.id;
              const features = planFeatures(plan, t);
              return (
                <Reveal key={plan.id} delay={i * 80} className="h-full">
                  <SpotlightCard
                    className={cn(
                      "panel-card lift relative flex h-full flex-col overflow-hidden p-6",
                      isCurrent && "border-brand/60 ring-1 ring-brand/25",
                    )}
                  >
                    {isCurrent ? (
                      <span className="badge absolute end-4 top-4 border-ok/40 bg-ok/12 text-ok">
                        <Check className="size-3" />
                        {t("public.planCurrent")}
                      </span>
                    ) : null}

                    <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{plan.name}</h2>
                    {plan.description ? (
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{plan.description}</p>
                    ) : null}

                    <div className="mt-5">
                      <span className="font-display text-4xl font-semibold tracking-tight text-ink">
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
                      <p className="mt-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-ink-dim">
                        {cadenceLabel(numeric, plan.billingCycle, t)}
                      </p>
                    </div>

                    <p className="mt-6 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-ink-dim">
                      {t("public.planFeaturesHeading")}
                    </p>
                    <ul className="mt-3 flex-1 space-y-2.5 text-sm text-ink-muted">
                      {features.map((f) => (
                        <li key={f.key} className="flex items-center gap-2.5">
                          <span className="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-ink-muted">
                            <f.icon className="size-3.5" aria-hidden />
                          </span>
                          <span>{f.text}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-7">
                      {isCurrent ? (
                        <span className="btn btn-ghost w-full cursor-default opacity-70" aria-disabled={true}>
                          <Sparkles className="size-4" />
                          {t("public.planActive")}
                        </span>
                      ) : authUser ? (
                        <Link href={`/dashboard/billing?plan=${plan.id}`} className="btn btn-primary w-full">
                          {t("public.planSubscribe")}
                          <ArrowRight className="size-4" />
                        </Link>
                      ) : (
                        <Link href="/auth/register" className="btn btn-primary w-full">
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
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Gauge,
  Globe,
  LayoutDashboard,
  Lock,
  Package as PackageIcon,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getBranding } from "@/lib/settings";
import { getAvailablePackagesForUser } from "@/lib/services/entitlements";
import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { StepsFlow } from "./steps-flow";
import { GameServerCards } from "./game-server-cards";
import { WebHostingShowcase } from "./web-hosting-showcase";
import { SpotlightCard } from "./spotlight-card";
import { PricingStage } from "./pricing-stage";
import { DepthPortal } from "./depth-portal";
import { HeroVisual } from "./hero-visual";
import { CountUp } from "./count-up";
import { ScaleBars } from "./scale-bars";
import { Marquee } from "./fx/marquee";
import { SectionLabel } from "./fx/section-label";
import { SectionBackdrop } from "./fx/section-backdrop";
import { Magnetic } from "@/components/ui/magnetic";

export const dynamic = "force-dynamic";

/**
 * Per-section accent hues. Each part of the page expresses itself with its own
 * colour over the shared monochrome base — a distinct, professional identity
 * for every section, paired with a distinct SectionLabel entrance motion.
 */
const ACCENT = {
  how: "#8b7bff", // violet — the process
  game: "#34d399", // emerald — game servers
  web: "#38bdf8", // sky — web hosting
  price: "#fbbf24", // amber — pricing
} as const;

/** Mirrors the billing-cycle suffix used by formatPrice, for the animated teaser price. */
const CYCLE_SUFFIX: Record<string, string> = { monthly: "/mo", yearly: "/yr", once: "", free: "" };

export async function generateMetadata(): Promise<Metadata> {
  const [branding, t] = await Promise.all([getBranding(), getT()]);
  return { title: t("public.metaHome", { name: branding.siteName || "SPanel" }) };
}

export default async function LandingPage() {
  const user = await getCurrentUser();
  const t = await getT();

  const GAME_FEATURES = [
    { kind: "console" as const, title: t("public.featConsoleTitle"), body: t("public.featConsoleBody") },
    { kind: "eggs" as const, title: t("public.featEggsTitle"), body: t("public.featEggsBody") },
    { kind: "limits" as const, title: t("public.featLimitsTitle"), body: t("public.featLimitsBody") },
  ];

  const WEB_FEATURES = [
    { icon: Globe, title: t("public.featStaticTitle"), body: t("public.featStaticBody") },
    { icon: Lock, title: t("public.featDbTitle"), body: t("public.featDbBody") },
    { icon: ShieldCheck, title: t("public.featIsolatedTitle"), body: t("public.featIsolatedBody") },
  ];

  const HERO_POINTS = [
    { icon: Terminal, label: t("public.heroPointConsole") },
    { icon: Gauge, label: t("public.heroPointLimits") },
    { icon: ShieldCheck, label: t("public.heroPointBackups") },
  ];

  const STEPS = [
    { n: "1", title: t("public.step1Title"), body: t("public.step1Body") },
    { n: "2", title: t("public.step2Title"), body: t("public.step2Body") },
    { n: "3", title: t("public.step3Title"), body: t("public.step3Body") },
  ];

  // Resolve the signed-in user's plan (their "package" tier) and how many
  // packages that plan unlocks — all from the real DB, never faked.
  let plan: { name: string; priceCents: number; currency: string; billingCycle: string } | null = null;
  let unlockedCount = 0;
  if (user) {
    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: { select: { name: true, priceCents: true, currency: true, billingCycle: true } } },
    });
    plan = record?.plan ?? null;
    const entitlements = await getAvailablePackagesForUser({
      id: user.id,
      role: user.role,
      rootAdmin: user.rootAdmin,
    });
    unlockedCount = entitlements.filter((e) => !e.locked).length;
  }

  // Cheapest public, priced package — powers the "plans starting at" teaser.
  // Pulled straight from the DB so the figure is always real.
  const pricedPackages = await prisma.package.findMany({
    where: { isPublic: true, planId: { not: null } },
    include: { plan: true },
  });
  const cheapest = pricedPackages
    .map((pkg) => pkg.plan)
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.priceCents - b.priceCents)[0];

  return (
    <div>
      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b border-line">
        {/* The signature 3D network now lives behind the whole site (SiteField
            in the layout), so it shows through the hero here too — no separate
            hero canvas. Ambient glow + vignette add depth over it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(60rem 30rem at 78% -10%, color-mix(in srgb, var(--color-brand) 10%, transparent), transparent 60%)",
          }}
        />
        <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="max-w-2xl animate-in">
            <span className="badge border-brand/40 bg-brand/12 text-brand-soft">
              <Zap className="size-3" />
              {t("public.heroBadge")}
            </span>
            <h1 className="mt-5 font-display text-5xl font-semibold tracking-tighter text-ink sm:text-7xl">
              {t("public.heroTitle")}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">{t("public.heroDesc")}</p>

            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2">
              {HERO_POINTS.map((point) => (
                <li key={point.label} className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-ink-muted">
                  <point.icon className="size-4 text-brand-soft" />
                  {point.label}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {user ? (
                <>
                  <Link href="/dashboard" className="btn btn-primary">
                    <LayoutDashboard className="size-4" />
                    {t("public.goToDashboard")}
                  </Link>
                  <Link href="/pricing" className="btn btn-ghost">
                    {t("public.viewPricing")}
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/auth/register" className="btn btn-primary">
                    {t("public.getStarted")}
                    <ArrowRight className="size-4" />
                  </Link>
                  <Link href="/pricing" className="btn btn-ghost">
                    {t("public.viewPricing")}
                  </Link>
                </>
              )}
            </div>

            {user ? (
              <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
                <span className="badge border-line bg-surface-2 text-ink-muted">
                  {t("public.signedInAs")} <span className="ms-1 font-medium text-ink">{user.username}</span>
                </span>
                <span className="badge border-brand/40 bg-brand/12 text-brand-soft">
                  <PackageIcon className="size-3" />
                  {plan ? plan.name : t("public.noPlan")}
                  {plan ? (
                    <span className="text-brand-soft/80">
                      · {formatPrice(plan.priceCents, plan.currency, plan.billingCycle)}
                    </span>
                  ) : null}
                </span>
                {plan && unlockedCount > 0 ? (
                  <span className="badge border-line bg-surface-2 text-ink-muted">
                    {t(unlockedCount === 1 ? "public.packagesUnlockedOne" : "public.packagesUnlockedOther", {
                      count: unlockedCount,
                    })}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Hero visual — decorative server-panel mockup built from tokens only. */}
          <HeroVisual />
        </div>
      </section>

      {/* Marquee band — an infinite scrolling ribbon of what the panel hosts. */}
      <section className="border-b border-line py-6">
        <Marquee
          items={[
            t("public.gameServers"),
            t("public.webHosting"),
            t("public.heroPointConsole"),
            t("public.heroPointLimits"),
            t("public.heroPointBackups"),
          ]}
        />
      </section>

      {/* How it works */}
      <section data-reveal="fold" className="relative isolate overflow-hidden border-b border-line">
        <SectionBackdrop variant="grid" accent={ACCENT.how} />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <SectionLabel icon="zap" label={t("public.howItWorks")} anim="flip" accent={ACCENT.how} />
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-[2.6rem] sm:leading-[1.1]">{t("public.howItWorksTitle")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">{t("public.howItWorksDesc")}</p>
          <StepsFlow steps={STEPS} />
        </div>
      </section>

      {/* Game servers — pins and deals its three cards down like a staircase;
          it runs its own choreography, so the site-wide reveal skips it. */}
      <section data-no-reveal className="relative isolate overflow-hidden border-b border-line">
        <SectionBackdrop variant="dots" accent={ACCENT.game} />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <SectionLabel icon="cpu" label={t("public.gameServers")} anim="swing" accent={ACCENT.game} />
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-[2.6rem] sm:leading-[1.1]">{t("public.gameServersTitle")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">{t("public.gameServersDesc")}</p>
          <GameServerCards cards={GAME_FEATURES} />
        </div>
      </section>

      {/* Web hosting */}
      <section data-reveal="door" className="relative isolate overflow-hidden border-b border-line">
        <SectionBackdrop variant="beams" accent={ACCENT.web} />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <SectionLabel icon="globe" label={t("public.webHosting")} anim="drop" accent={ACCENT.web} />
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-[2.6rem] sm:leading-[1.1]">{t("public.webHostingTitle")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">{t("public.webHostingDesc")}</p>
          <WebHostingShowcase>
            {WEB_FEATURES.map((feature) => (
              <li key={feature.title} data-feat className="flex gap-3.5">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-brand/30 bg-brand/12 text-brand-soft">
                  <feature.icon className="size-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-ink">{feature.title}</h3>
                  <p className="mt-1 text-sm text-ink-muted">{feature.body}</p>
                </div>
              </li>
            ))}
          </WebHostingShowcase>
        </div>
      </section>

      {/* Pricing teaser — a flip-up platform (see PricingStage). Runs its own
          3D choreography, so the site-wide section reveal skips it. */}
      <section data-no-reveal className="relative isolate overflow-hidden border-b border-line">
        <SectionBackdrop variant="glow" accent={ACCENT.price} />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <PricingStage>
            <SpotlightCard className="panel-card d3 relative p-8 sm:p-10">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[inherit]"
                style={{
                  background:
                    "radial-gradient(40rem 20rem at 100% 0%, color-mix(in srgb, var(--color-brand) 14%, transparent), transparent 60%)",
                }}
              />
              <div className="d3-layer relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div className="max-w-xl">
                  <SectionLabel icon="package" label={t("public.pricing")} anim="rise" accent={ACCENT.price} badge />
                  <h2 className="mt-4 text-2xl font-semibold text-ink sm:text-3xl">{t("public.pricingTeaserTitle")}</h2>
                  <p className="mt-2 text-sm text-ink-muted">{t("public.pricingTeaserDesc")}</p>
                  <div className="mt-6 max-w-xs">
                    <ScaleBars />
                  </div>
                </div>
                <div data-float className="flex flex-col items-start gap-4 md:items-end">
                  {cheapest ? (
                    <div className="md:text-end">
                      <p className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-ink-dim">
                        {t("public.pricingTeaserStartingAt")}
                      </p>
                      <p className="mt-1.5 font-display text-4xl font-semibold tracking-tight text-ink">
                        {cheapest.billingCycle !== "free" && cheapest.priceCents > 0 ? (
                          <CountUp
                            to={cheapest.priceCents / 100}
                            currency={cheapest.currency}
                            suffix={CYCLE_SUFFIX[cheapest.billingCycle] ?? ""}
                          />
                        ) : (
                          formatPrice(cheapest.priceCents, cheapest.currency, cheapest.billingCycle)
                        )}
                      </p>
                    </div>
                  ) : null}
                  <Magnetic>
                    <Link href="/pricing" className="btn btn-primary">
                      {t("public.comparePlans")}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Magnetic>
                </div>
              </div>
            </SpotlightCard>
          </PricingStage>
        </div>
      </section>

      {/* CTA — a push-from-depth portal (see DepthPortal). Owns its own 3D
          arrival, so the site-wide section reveal skips it. */}
      <section data-no-reveal>
        <div className="mx-auto w-full max-w-4xl px-4 py-20 sm:px-6 sm:py-24">
          <DepthPortal>
            <div
              data-portal-card
              className="panel-card beam-card d3 flex flex-col items-center gap-6 p-10 text-center sm:p-14"
            >
              <div data-portal-item className="max-w-xl">
                <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                  {user ? t("public.ctaTitleUser") : t("public.ctaTitleGuest")}
                </h2>
                <p className="mt-3 text-sm text-ink-muted sm:text-base">
                  {user ? t("public.ctaDescUser") : t("public.ctaDescGuest")}
                </p>
              </div>
              <div data-portal-item className="flex flex-wrap items-center justify-center gap-3">
                {user ? (
                  <>
                    <Link href="/dashboard" className="btn btn-primary">
                      <LayoutDashboard className="size-4" />
                      {t("public.goToDashboard")}
                    </Link>
                    <Link href="/pricing" className="btn btn-ghost">
                      {t("public.comparePlans")}
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/auth/register" className="btn btn-primary">
                      {t("public.getStarted")}
                      <ArrowRight className="size-4" />
                    </Link>
                    <Link href="/pricing" className="btn btn-ghost">
                      {t("public.comparePlans")}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </DepthPortal>
        </div>
      </section>
    </div>
  );
}


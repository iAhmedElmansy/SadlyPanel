import type { ReactNode } from "react";
import Link from "next/link";
import { LayoutDashboard, Server } from "lucide-react";
import { getBranding } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { SmoothScroll } from "./fx/smooth-scroll";
import { CustomCursor } from "./fx/custom-cursor";
import { SiteField } from "./fx/site-field";
import { SectionReveal } from "./fx/section-reveal";
import { Preloader } from "./fx/preloader";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const branding = await getBranding();
  const siteName = branding.siteName || "SPanel";
  const user = await getCurrentUser();
  const t = await getT();

  const NAV_LINKS = [
    { href: "/", label: t("public.home") },
    { href: "/pricing", label: t("public.pricing") },
    { href: "/docs", label: t("public.docs") },
    { href: "/status", label: t("public.status") },
  ];

  return (
    <div className="app-shell isolate flex min-h-screen flex-col">
      {/* studiors-style signature FX — scoped to the public site only. */}
      <SiteField />
      <Preloader label={siteName} />
      <SmoothScroll />
      <CustomCursor />
      <SectionReveal />
      <div className="grain" aria-hidden />

      <header className="glass sticky top-0 z-40 border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-display font-semibold tracking-tight text-ink">
            {branding.siteLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.siteLogo} alt={siteName} className="h-7 w-auto" />
            ) : (
              <span className="grid size-8 place-items-center rounded-md border border-brand/40 bg-brand/12 text-brand-soft">
                <Server className="size-4" />
              </span>
            )}
            <span className="truncate">{siteName}</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm text-ink-muted transition hover:bg-surface-2 hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-sm text-ink-muted sm:inline">{user.username}</span>
                <Link href="/dashboard" className="btn btn-primary">
                  <LayoutDashboard className="size-4" />
                  {t("public.dashboard")}
                </Link>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="btn btn-ghost">
                  {t("public.signIn")}
                </Link>
                <Link href="/auth/register" className="btn btn-primary">
                  {t("public.getStarted")}
                </Link>
              </>
            )}
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto border-t border-line-soft px-4 py-2 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-ink-muted transition hover:bg-surface-2 hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="relative isolate overflow-hidden border-t border-line bg-surface">
        {/* Brand hairline + ambient glow tie the footer into the site's 3D depth. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-brand) 55%, transparent), transparent)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(42rem 22rem at 12% -30%, color-mix(in srgb, var(--color-brand) 9%, transparent), transparent 60%)",
          }}
        />
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div className="max-w-sm">
              <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink">
                {branding.siteLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={branding.siteLogo} alt={siteName} className="h-6 w-auto" />
                ) : (
                  <span className="grid size-8 place-items-center rounded-md border border-brand/40 bg-brand/12 text-brand-soft">
                    <Server className="size-4" />
                  </span>
                )}
                <span className="truncate">{siteName}</span>
              </Link>
              <p className="mt-4 text-sm leading-relaxed text-ink-muted">{t("public.footerTagline")}</p>
              <Link
                href="/status"
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-brand/40 hover:text-ink"
              >
                <span className="relative flex size-2">
                  <span
                    className="absolute inline-flex size-full animate-ping rounded-full opacity-75"
                    style={{ backgroundColor: "var(--color-ok)" }}
                  />
                  <span
                    className="relative inline-flex size-2 rounded-full"
                    style={{ backgroundColor: "var(--color-ok)" }}
                  />
                </span>
                {t("public.allSystemsOperational")}
              </Link>
            </div>
            <div>
              <h3 className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-ink-dim">
                {t("public.footerProduct")}
              </h3>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <Link href="/" className="text-sm text-ink-muted transition hover:text-ink">
                    {t("public.home")}
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="text-sm text-ink-muted transition hover:text-ink">
                    {t("public.pricing")}
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-ink-dim">
                {t("public.footerResources")}
              </h3>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <Link href="/docs" className="text-sm text-ink-muted transition hover:text-ink">
                    {t("public.docs")}
                  </Link>
                </li>
                <li>
                  <Link href="/status" className="text-sm text-ink-muted transition hover:text-ink">
                    {t("public.status")}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-ink-dim">
                {t("public.footerAccount")}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {user ? (
                  <li>
                    <Link href="/dashboard" className="text-sm text-ink-muted transition hover:text-ink">
                      {t("public.dashboard")}
                    </Link>
                  </li>
                ) : (
                  <>
                    <li>
                      <Link href="/auth/login" className="text-sm text-ink-muted transition hover:text-ink">
                        {t("public.signIn")}
                      </Link>
                    </li>
                    <li>
                      <Link href="/auth/register" className="text-sm text-ink-muted transition hover:text-ink">
                        {t("public.getStarted")}
                      </Link>
                    </li>
                  </>
                )}
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-line-soft pt-6 text-xs text-ink-dim sm:flex-row sm:items-center">
            <span>
              © {new Date().getFullYear()} {siteName}. {t("public.footerRights")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Server className="size-3.5 text-brand-soft" />
              {siteName}
            </span>
          </div>
        </div>
      </footer>

      {/* Studio signature — a large decorative wordmark sitting below the whole
          footer. Purely presentational: it can neither be selected nor dragged
          (pointer-events off + user-select/​drag none), so it never interferes
          with real content or gets picked up as text/image. */}
      <div
        aria-hidden
        className="brand-signature select-none overflow-hidden border-t border-line bg-surface"
      >
        <span className="brand-signature-text">SadlyStudios</span>
      </div>
    </div>
  );
}

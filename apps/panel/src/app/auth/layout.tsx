import type { ReactNode } from "react";
import { ShieldCheck, ServerCog, Globe2, Boxes } from "lucide-react";
import { getBranding } from "@/lib/settings";
import { getT } from "@/lib/i18n/server";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const branding = await getBranding();
  const t = await getT();

  const HIGHLIGHTS = [
    { icon: ServerCog, title: t("auth.highlightServersTitle"), body: t("auth.highlightServersBody") },
    { icon: Globe2, title: t("auth.highlightDomainsTitle"), body: t("auth.highlightDomainsBody") },
    { icon: Boxes, title: t("auth.highlightControlTitle"), body: t("auth.highlightControlBody") },
  ];

  return (
    <div className="app-shell grid min-h-screen lg:grid-cols-[1.05fr_minmax(420px,0.95fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line px-12 py-12 lg:flex">
        <div
          className="pointer-events-none absolute -left-24 top-1/3 size-[420px] rounded-full opacity-25 blur-3xl"
          style={{ background: branding.siteAccent }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          {branding.siteLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.siteLogo} alt="" className="size-10 rounded-lg object-cover" />
          ) : (
            <div
              className="grid size-10 place-items-center rounded-lg text-sm font-bold text-white"
              style={{ background: branding.siteAccent }}
            >
              {branding.siteName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold">{branding.siteName}</p>
            <p className="text-xs text-ink-dim">{t("auth.layoutTagline")}</p>
          </div>
        </div>

        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-ink-dim">
              <span aria-hidden className="h-px w-6 rounded-full bg-brand/40" />
              {t("auth.layoutEyebrow")}
            </span>
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-ink">
              {t("auth.layoutHeadline")}
            </h1>
            <p className="text-sm leading-relaxed text-ink-muted">
              {branding.siteDescription || t("auth.layoutDescFallback")}
            </p>
          </div>
          <ul className="space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-brand-soft">
                  <item.icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  <p className="text-xs leading-relaxed text-ink-muted">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-xs text-ink-dim">
          <ShieldCheck className="size-3.5" />
          {t("auth.layoutSecurityNote")}
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

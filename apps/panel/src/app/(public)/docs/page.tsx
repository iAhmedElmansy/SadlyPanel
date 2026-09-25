import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { DocsProgress } from "./docs-progress";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("public.metaDocs") };
}

export default async function DocsPage() {
  const t = await getT();

  const SECTIONS = [
    { id: "first-server", title: t("public.docFirstServerTitle") },
    { id: "files", title: t("public.docFilesTitle") },
    { id: "databases", title: t("public.docDatabasesTitle") },
    { id: "backups", title: t("public.docBackupsTitle") },
    { id: "web-hosting", title: t("public.docWebHostingTitle") },
    { id: "support", title: t("public.docSupportTitle") },
  ];

  return (
    <div className="relative overflow-hidden">
      <DocsProgress ids={SECTIONS.map((s) => s.id)} />
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
          <BookOpen className="size-3" />
          {t("public.docsBadge")}
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{t("public.docsTitle")}</h1>
        <p className="mt-3 text-sm text-ink-muted sm:text-base">
          {t("public.docsDesc")}
        </p>
      </div>

      <div className="mt-10 gap-10 lg:grid lg:grid-cols-[220px_1fr]">
        {/* Anchor nav */}
        <nav className="mb-8 lg:mb-0">
          <div className="lg:sticky lg:top-24">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-dim">{t("public.onThisPage")}</p>
            <ul className="mt-3 space-y-1">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block rounded-md px-3 py-1.5 text-sm text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="min-w-0 space-y-12">
          <DocSection id="first-server" title={t("public.docFirstServerTitle")}>
            <p>
              {t("public.docFirstServerP1a")}<strong>{t("public.docCreateServer")}</strong>{t("public.docFirstServerP1b")}
            </p>
            <p>
              {t("public.docFirstServerP2")}
            </p>
          </DocSection>

          <DocSection id="files" title={t("public.docFilesTitle")}>
            <p>
              {t("public.docFilesP1")}
            </p>
            <p>
              {t("public.docFilesP2")}
            </p>
          </DocSection>

          <DocSection id="databases" title={t("public.docDatabasesTitle")}>
            <p>
              {t("public.docDatabasesP1")}
            </p>
            <p>
              {t("public.docDatabasesP2")}
            </p>
          </DocSection>

          <DocSection id="backups" title={t("public.docBackupsTitle")}>
            <p>
              {t("public.docBackupsP1")}
            </p>
            <p>
              {t("public.docBackupsP2")}
            </p>
          </DocSection>

          <DocSection id="web-hosting" title={t("public.docWebHostingTitle")}>
            <p>
              {t("public.docWebHostingP1")}
            </p>
            <p>
              {t("public.docWebHostingP2")}
            </p>
          </DocSection>

          <DocSection id="support" title={t("public.docSupportTitle")}>
            <p>
              {t("public.docSupportP1a")}
              <Link href="/status" className="text-brand-soft underline-offset-2 hover:underline">
                {t("public.docStatusPageLink")}
              </Link>
              {t("public.docSupportP1b")}
            </p>
            <p>
              {t("public.docSupportP2a")}
              <Link href="/auth/register" className="text-brand-soft underline-offset-2 hover:underline">
                {t("public.docCreateAccount")}
              </Link>
              {t("public.docSupportP2b")}
            </p>
          </DocSection>
        </div>
      </div>
      </div>
    </div>
  );
}

function DocSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="panel-card scroll-mt-24 p-6">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { getBranding } from "@/lib/settings";
import { getT } from "@/lib/i18n/server";
import { verifyEmailAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.metaVerify") };
}
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const branding = await getBranding();
  const t = await getT();
  const result = token ? await verifyEmailAction(token) : { ok: false };

  return (
    <div className="panel-card animate-in p-8 text-center">
      <div
        className={`mx-auto mb-4 grid size-11 place-items-center rounded-xl border ${
          result.ok ? "border-ok/40 bg-ok/10 text-ok" : "border-bad/40 bg-bad/10 text-bad"
        }`}
      >
        {result.ok ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
      </div>
      {result.ok ? (
        <>
          <h1 className="text-lg font-semibold text-ink">{t("auth.emailVerified")}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
            {t("auth.emailVerifiedDesc", { name: branding.siteName })}
          </p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold text-ink">{t("auth.verificationInvalid")}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
            {t("auth.verificationInvalidDesc")}
          </p>
        </>
      )}
      <Link href="/auth/login" className="btn btn-primary mx-auto mt-6">
        {t("auth.goToSignIn")}
      </Link>
    </div>
  );
}

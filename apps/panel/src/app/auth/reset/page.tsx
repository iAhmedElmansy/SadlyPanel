import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";
import { SETTING_KEYS } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";
import { ResetForm } from "./reset-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.metaReset") };
}
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const { token } = await searchParams;
  const enabled = (await getSetting(SETTING_KEYS.authPasswordResetEnabled)) === "true";
  const t = await getT();

  if (!enabled || !token) {
    return (
      <div className="panel-card animate-in p-8 text-center">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-ink-muted">
          <KeyRound className="size-5" />
        </div>
        <h1 className="text-lg font-semibold text-ink">{t("auth.resetLinkInvalid")}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
          {enabled ? t("auth.resetLinkMalformedDesc") : t("auth.resetDisabledDesc")}
        </p>
        <Link href="/auth/forgot" className="btn btn-primary mx-auto mt-6">
          {t("auth.requestNewLink")}
        </Link>
      </div>
    );
  }

  return <ResetForm token={token} />;
}

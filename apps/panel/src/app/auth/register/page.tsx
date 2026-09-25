import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { getCurrentUser, isFirstRun } from "@/lib/auth/session";
import { getBranding } from "@/lib/settings";
import { env } from "@/lib/env";
import { getT } from "@/lib/i18n/server";
import { RegisterForm } from "./register-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.metaRegister") };
}

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const firstRun = await isFirstRun();
  const branding = await getBranding();
  const open = branding.registrationOpen || env.openRegistration;
  const t = await getT();

  if (!firstRun && !open) {
    return (
      <div className="panel-card animate-in p-8 text-center">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-ink-muted">
          <Lock className="size-5" />
        </div>
        <h1 className="text-lg font-semibold text-ink">{t("auth.registrationClosed")}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
          {t("auth.registrationClosedDesc", { name: branding.siteName })}
        </p>
        <Link href="/auth/login" className="btn btn-primary mx-auto mt-6">
          {t("auth.backToSignIn")}
        </Link>
      </div>
    );
  }

  return <RegisterForm firstRun={firstRun} siteName={branding.siteName} />;
}

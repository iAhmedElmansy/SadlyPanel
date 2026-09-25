import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser, isFirstRun } from "@/lib/auth/session";
import { getBranding, getSetting } from "@/lib/settings";
import { SETTING_KEYS } from "@/lib/constants";
import { env } from "@/lib/env";
import { getT } from "@/lib/i18n/server";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.metaSignIn") };
}

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  // With an empty database the only sensible destination is the admin setup.
  if (await isFirstRun()) redirect("/auth/register");

  const [branding, passwordResetEnabled] = await Promise.all([
    getBranding(),
    getSetting(SETTING_KEYS.authPasswordResetEnabled),
  ]);
  return (
    <LoginForm
      registrationOpen={branding.registrationOpen || env.openRegistration}
      passwordResetEnabled={passwordResetEnabled === "true"}
      siteName={branding.siteName}
    />
  );
}

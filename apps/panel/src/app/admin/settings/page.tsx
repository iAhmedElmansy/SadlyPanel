import { getAllSettings, getBranding, getSmtpSettings } from "@/lib/settings";
import { SETTING_KEYS } from "@/lib/constants";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsForms } from "./settings-forms";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("admin.settingsMeta") };
}
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const t = await getT();
  const [branding, smtp, all] = await Promise.all([getBranding(), getSmtpSettings(), getAllSettings()]);

  return (
    <>
      <PageHeader
        title={t("admin.settingsTitle")}
        description={t("admin.settingsDesc")}
      />
      <SettingsForms
        branding={{
          siteName: branding.siteName,
          siteUrl: branding.siteUrl,
          siteDescription: branding.siteDescription,
          siteAccent: branding.siteAccent,
          siteLogo: branding.siteLogo,
          siteFavicon: branding.siteFavicon,
          registrationOpen: branding.registrationOpen,
          defaultServerLimit: all[SETTING_KEYS.defaultServerLimit] ?? "2",
          panelUrl: all[SETTING_KEYS.panelUrl] ?? "",
          panelPort: all[SETTING_KEYS.panelPort] ?? "",
        }}
        smtp={{
          enabled: smtp.enabled,
          host: smtp.host,
          port: smtp.port,
          username: smtp.username,
          encryption: smtp.encryption,
          fromAddress: smtp.fromAddress,
          fromName: smtp.fromName,
          hasPassword: smtp.password.length > 0,
        }}
        security={{
          registrationEnabled:
            all[SETTING_KEYS.authRegistrationEnabled] === "true" || all[SETTING_KEYS.registrationOpen] === "true",
          emailVerificationRequired: all[SETTING_KEYS.authEmailVerificationRequired] === "true",
          passwordResetEnabled: all[SETTING_KEYS.authPasswordResetEnabled] === "true",
          maintenanceMode: all[SETTING_KEYS.maintenanceMode] === "true",
          passwordMinLength: all[SETTING_KEYS.passwordMinLength] ?? "8",
          passwordRequireUpper: all[SETTING_KEYS.passwordRequireUpper] === "true",
          passwordRequireLower: all[SETTING_KEYS.passwordRequireLower] === "true",
          passwordRequireNumber: all[SETTING_KEYS.passwordRequireNumber] === "true",
          passwordRequireSymbol: all[SETTING_KEYS.passwordRequireSymbol] === "true",
        }}
      />
    </>
  );
}

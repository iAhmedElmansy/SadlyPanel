"use client";

import { useActionState, useState } from "react";
import { Image as ImageIcon, Mail, Palette, Save, Send, ShieldCheck } from "lucide-react";
import {
  testSmtpAction,
  updateAuthSecurityAction,
  updateBrandingAction,
  updateSmtpAction,
  type SettingsState,
} from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Checkbox, Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";
import { useT } from "@/lib/i18n/preferences";

export interface BrandingValues {
  siteName: string;
  siteUrl: string;
  siteDescription: string;
  siteAccent: string;
  siteLogo: string;
  siteFavicon: string;
  registrationOpen: boolean;
  defaultServerLimit: string;
  panelUrl: string;
  panelPort: string;
}

export interface SmtpValues {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  encryption: string;
  fromAddress: string;
  fromName: string;
  hasPassword: boolean;
}

export interface SecurityValues {
  registrationEnabled: boolean;
  emailVerificationRequired: boolean;
  passwordResetEnabled: boolean;
  maintenanceMode: boolean;
  passwordMinLength: string;
  passwordRequireUpper: boolean;
  passwordRequireLower: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
}

export function SettingsForms({
  branding,
  smtp,
  security,
}: {
  branding: BrandingValues;
  smtp: SmtpValues;
  security: SecurityValues;
}) {
  const t = useT();
  const [brandingState, brandingAction] = useActionState<SettingsState, FormData>(updateBrandingAction, {});
  const [smtpState, smtpAction] = useActionState<SettingsState, FormData>(updateSmtpAction, {});
  const [securityState, securityAction] = useActionState<SettingsState, FormData>(updateAuthSecurityAction, {});
  const [accent, setAccent] = useState(branding.siteAccent);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SettingsState>({});

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader
          title={t("admin.sfBranding")}
          description={t("admin.sfBrandingDesc")}
          action={<Palette className="size-4 text-ink-dim" />}
        />
        <CardBody>
          <form action={brandingAction} className="space-y-4">
            <FormError message={brandingState.error} />
            <FormSuccess message={brandingState.success} />

            <Field label={t("admin.sfSiteName")} required>
              <Input name="siteName" defaultValue={branding.siteName} required maxLength={60} />
            </Field>

            <Field label={t("admin.sfPublicUrl")} hint={t("admin.sfPublicUrlHint")}>
              <Input name="siteUrl" defaultValue={branding.siteUrl} placeholder="https://spanel.sadlystudios.bond" />
            </Field>

            <Field label={t("admin.sfTagline")}>
              <Textarea name="siteDescription" defaultValue={branding.siteDescription} rows={2} maxLength={255} />
            </Field>

            <Field label={t("admin.sfAccent")} hint={t("admin.sfAccentHint")}>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accent}
                  onChange={(event) => setAccent(event.target.value)}
                  aria-label={t("admin.sfAccentPicker")}
                  className="size-9 cursor-pointer rounded-md border border-line bg-canvas"
                />
                <Input name="siteAccent" value={accent} onChange={(event) => setAccent(event.target.value)} className="font-mono" />
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("admin.sfLogo")} hint={t("admin.sfLogoHint")}>
                <div className="space-y-2">
                  {branding.siteLogo ? (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={branding.siteLogo} alt={t("admin.sfCurrentLogo")} className="size-9 rounded-md border border-line object-cover" />
                      <Checkbox name="removeLogo" label={t("common.remove")} />
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-ink-dim">
                      <ImageIcon className="size-3.5" />
                      {t("admin.sfNoLogo")}
                    </p>
                  )}
                  <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="input-base py-1.5 text-xs" />
                </div>
              </Field>

              <Field label={t("admin.sfFavicon")} hint={t("admin.sfFaviconHint")}>
                <div className="space-y-2">
                  {branding.siteFavicon ? (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={branding.siteFavicon} alt={t("admin.sfCurrentFavicon")} className="size-9 rounded-md border border-line object-contain" />
                      <Checkbox name="removeFavicon" label={t("common.remove")} />
                    </div>
                  ) : (
                    <p className="text-xs text-ink-dim">{t("admin.sfNoFavicon")}</p>
                  )}
                  <input type="file" name="favicon" accept="image/x-icon,image/png,image/vnd.microsoft.icon" className="input-base py-1.5 text-xs" />
                </div>
              </Field>
            </div>

            <div className="space-y-3 border-t border-line pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-dim">{t("admin.sfPanelConnection")}</p>
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <Field label={t("admin.sfPanelUrl")} hint={t("admin.sfPanelUrlHint")}>
                  <Input name="panelUrl" defaultValue={branding.panelUrl} placeholder="e.g. http://panel.example.com" />
                </Field>
                <Field label={t("admin.sfPanelPort")} hint={t("admin.sfPanelPortHint")}>
                  <Input name="panelPort" defaultValue={branding.panelPort} placeholder="e.g. 3000" />
                </Field>
              </div>
            </div>

            <div className="space-y-3 border-t border-line pt-4">
              <Checkbox
                name="registrationOpen"
                defaultChecked={branding.registrationOpen}
                label={t("admin.sfAllowRegistration")}
                description={t("admin.sfAllowRegistrationDesc")}
              />
              <Field label={t("admin.sfServersPerUser")} hint={t("admin.sfServersPerUserHint")}>
                <Input name="defaultServerLimit" type="number" min={0} max={1000} defaultValue={branding.defaultServerLimit} />
              </Field>
            </div>

            <SubmitButton pendingLabel={t("common.saving")}>
              <Save className="size-3.5" />
              {t("admin.sfSaveSettings")}
            </SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("admin.sfSmtp")}
          description={t("admin.sfSmtpDesc")}
          action={<Mail className="size-4 text-ink-dim" />}
        />
        <CardBody>
          <form action={smtpAction} className="space-y-4">
            <FormError message={smtpState.error ?? testResult.error} />
            <FormSuccess message={smtpState.success ?? testResult.success} />

            <Checkbox name="enabled" defaultChecked={smtp.enabled} label={t("admin.sfEnableEmail")} />

            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field label={t("admin.sfHost")}>
                <Input name="host" defaultValue={smtp.host} placeholder="smtp.example.com" />
              </Field>
              <Field label={t("admin.sfPort")}>
                <Input name="port" type="number" min={1} max={65535} defaultValue={smtp.port} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("admin.sfUsername")}>
                <Input name="username" defaultValue={smtp.username} autoComplete="off" />
              </Field>
              <Field label={t("admin.sfSmtpPassword")} hint={smtp.hasPassword ? t("admin.sfPasswordKeepHint") : t("admin.sfPasswordStoredHint")}>
                <Input name="password" type="password" autoComplete="new-password" placeholder={smtp.hasPassword ? "••••••••" : ""} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("admin.sfEncryption")}>
                <Select name="encryption" defaultValue={smtp.encryption}>
                  <option value="tls">STARTTLS</option>
                  <option value="ssl">SSL</option>
                  <option value="none">{t("admin.sfEncNone")}</option>
                </Select>
              </Field>
              <Field label={t("admin.sfFromAddress")}>
                <Input name="fromAddress" type="email" defaultValue={smtp.fromAddress} placeholder="no-reply@example.com" />
              </Field>
              <Field label={t("admin.sfFromName")}>
                <Input name="fromName" defaultValue={smtp.fromName} />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <SubmitButton pendingLabel={t("common.saving")}>
                <Save className="size-3.5" />
                {t("admin.sfSaveSmtp")}
              </SubmitButton>
              <Button
                type="button"
                variant="ghost"
                loading={testing}
                onClick={async () => {
                  setTesting(true);
                  setTestResult({});
                  setTestResult(await testSmtpAction());
                  setTesting(false);
                }}
              >
                <Send className="size-3.5" />
                {t("admin.sfSendTest")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader
          title={t("admin.sfAuthTitle")}
          description={t("admin.sfAuthDesc")}
          action={<ShieldCheck className="size-4 text-ink-dim" />}
        />
        <CardBody>
          <form action={securityAction} className="space-y-5">
            <FormError message={securityState.error} />
            <FormSuccess message={securityState.success} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Checkbox
                name="registrationEnabled"
                defaultChecked={security.registrationEnabled}
                label={t("admin.sfAllowRegistration")}
                description={t("admin.sfRegEnabledDesc")}
              />
              <Checkbox
                name="emailVerificationRequired"
                defaultChecked={security.emailVerificationRequired}
                label={t("admin.sfEmailVerify")}
                description={t("admin.sfEmailVerifyDesc")}
              />
              <Checkbox
                name="passwordResetEnabled"
                defaultChecked={security.passwordResetEnabled}
                label={t("admin.sfPwReset")}
                description={t("admin.sfPwResetDesc")}
              />
              <Checkbox
                name="maintenanceMode"
                defaultChecked={security.maintenanceMode}
                label={t("admin.sfMaintenance")}
                description={t("admin.sfMaintenanceDesc")}
              />
            </div>

            <div className="space-y-3 border-t border-line pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-dim">{t("admin.sfPwPolicy")}</p>
              <Field label={t("admin.sfMinLength")} hint={t("admin.sfMinLengthHint")}>
                <Input
                  name="passwordMinLength"
                  type="number"
                  min={1}
                  max={128}
                  defaultValue={security.passwordMinLength}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Checkbox name="passwordRequireLower" defaultChecked={security.passwordRequireLower} label={t("admin.sfReqLower")} />
                <Checkbox name="passwordRequireUpper" defaultChecked={security.passwordRequireUpper} label={t("admin.sfReqUpper")} />
                <Checkbox name="passwordRequireNumber" defaultChecked={security.passwordRequireNumber} label={t("admin.sfReqNumber")} />
                <Checkbox name="passwordRequireSymbol" defaultChecked={security.passwordRequireSymbol} label={t("admin.sfReqSymbol")} />
              </div>
            </div>

            <SubmitButton pendingLabel={t("common.saving")}>
              <Save className="size-3.5" />
              {t("admin.sfSaveSecurity")}
            </SubmitButton>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

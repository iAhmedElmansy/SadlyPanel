"use server";

import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { setSettings } from "@/lib/settings";
import { SETTING_KEYS } from "@/lib/constants";
import { brandingSchema, smtpSchema } from "@/lib/validation";
import { verifySmtp, sendMail, renderBrandedEmail } from "@/lib/mail";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { getSetting } from "@/lib/settings";

export interface SettingsState {
  error?: string;
  success?: string;
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Persists an uploaded image under public/uploads and returns its public path. */
async function storeImage(file: File, prefix: string): Promise<string> {
  const extension = ALLOWED_IMAGE_TYPES[file.type];
  if (!extension) throw new Error("Only PNG, JPEG, WebP, SVG or ICO images are allowed.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Images must be 4 MB or smaller.");

  const directory = path.join(process.cwd(), "public", "uploads");
  await mkdir(directory, { recursive: true });

  const fileName = `${prefix}-${Date.now()}${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(directory, fileName), buffer);
  return `/uploads/${fileName}`;
}

export async function updateBrandingAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const admin = await requireAdmin();

  const parsed = brandingSchema.safeParse({
    siteName: formData.get("siteName"),
    siteUrl: formData.get("siteUrl"),
    siteDescription: formData.get("siteDescription"),
    siteAccent: formData.get("siteAccent"),
    registrationOpen: formData.get("registrationOpen") === "on",
    defaultServerLimit: formData.get("defaultServerLimit"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid values." };

  const values: Record<string, string> = {
    [SETTING_KEYS.siteName]: parsed.data.siteName,
    [SETTING_KEYS.siteUrl]: parsed.data.siteUrl,
    [SETTING_KEYS.siteDescription]: parsed.data.siteDescription,
    [SETTING_KEYS.siteAccent]: parsed.data.siteAccent,
    [SETTING_KEYS.registrationOpen]: String(parsed.data.registrationOpen),
    [SETTING_KEYS.defaultServerLimit]: String(parsed.data.defaultServerLimit),
    [SETTING_KEYS.panelUrl]: String(formData.get("panelUrl") ?? "").trim(),
    [SETTING_KEYS.panelPort]: String(formData.get("panelPort") ?? "").trim(),
  };

  try {
    const logo = formData.get("logo");
    if (logo instanceof File && logo.size > 0) values[SETTING_KEYS.siteLogo] = await storeImage(logo, "logo");

    const favicon = formData.get("favicon");
    if (favicon instanceof File && favicon.size > 0) values[SETTING_KEYS.siteFavicon] = await storeImage(favicon, "favicon");

    if (formData.get("removeLogo") === "on") values[SETTING_KEYS.siteLogo] = "";
    if (formData.get("removeFavicon") === "on") values[SETTING_KEYS.siteFavicon] = "";
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to store the image." };
  }

  await setSettings(values);
  await logActivity({ event: "admin:settings.branding", userId: admin.id });

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { success: "Site settings saved." };
}

export async function updateSmtpAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const admin = await requireAdmin();

  const parsed = smtpSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    host: formData.get("host"),
    port: formData.get("port"),
    username: formData.get("username"),
    password: formData.get("password"),
    encryption: formData.get("encryption"),
    fromAddress: formData.get("fromAddress"),
    fromName: formData.get("fromName"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid SMTP settings." };

  await setSettings({
    [SETTING_KEYS.smtpEnabled]: String(parsed.data.enabled),
    [SETTING_KEYS.smtpHost]: parsed.data.host,
    [SETTING_KEYS.smtpPort]: String(parsed.data.port),
    [SETTING_KEYS.smtpUser]: parsed.data.username,
    [SETTING_KEYS.smtpPass]: parsed.data.password ?? "",
    [SETTING_KEYS.smtpEncryption]: parsed.data.encryption,
    [SETTING_KEYS.smtpFromAddress]: parsed.data.fromAddress,
    [SETTING_KEYS.smtpFromName]: parsed.data.fromName,
  });

  await logActivity({ event: "admin:settings.smtp", userId: admin.id, properties: { host: parsed.data.host } });
  revalidatePath("/admin/settings");
  return { success: "SMTP settings saved." };
}

const authSecuritySchema = z.object({
  registrationEnabled: z.boolean().default(false),
  emailVerificationRequired: z.boolean().default(false),
  passwordResetEnabled: z.boolean().default(false),
  maintenanceMode: z.boolean().default(false),
  passwordMinLength: z.coerce.number().int().min(1).max(128).default(8),
  passwordRequireUpper: z.boolean().default(false),
  passwordRequireLower: z.boolean().default(false),
  passwordRequireNumber: z.boolean().default(false),
  passwordRequireSymbol: z.boolean().default(false),
});

export async function updateAuthSecurityAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const admin = await requireAdmin();

  const parsed = authSecuritySchema.safeParse({
    registrationEnabled: formData.get("registrationEnabled") === "on",
    emailVerificationRequired: formData.get("emailVerificationRequired") === "on",
    passwordResetEnabled: formData.get("passwordResetEnabled") === "on",
    maintenanceMode: formData.get("maintenanceMode") === "on",
    passwordMinLength: formData.get("passwordMinLength"),
    passwordRequireUpper: formData.get("passwordRequireUpper") === "on",
    passwordRequireLower: formData.get("passwordRequireLower") === "on",
    passwordRequireNumber: formData.get("passwordRequireNumber") === "on",
    passwordRequireSymbol: formData.get("passwordRequireSymbol") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid values." };

  const d = parsed.data;
  await setSettings({
    // Keep the legacy registration switch in sync with the new alias so both
    // the branding form and this section always agree.
    [SETTING_KEYS.registrationOpen]: String(d.registrationEnabled),
    [SETTING_KEYS.authRegistrationEnabled]: String(d.registrationEnabled),
    [SETTING_KEYS.authEmailVerificationRequired]: String(d.emailVerificationRequired),
    [SETTING_KEYS.authPasswordResetEnabled]: String(d.passwordResetEnabled),
    [SETTING_KEYS.maintenanceMode]: String(d.maintenanceMode),
    [SETTING_KEYS.passwordMinLength]: String(d.passwordMinLength),
    [SETTING_KEYS.passwordRequireUpper]: String(d.passwordRequireUpper),
    [SETTING_KEYS.passwordRequireLower]: String(d.passwordRequireLower),
    [SETTING_KEYS.passwordRequireNumber]: String(d.passwordRequireNumber),
    [SETTING_KEYS.passwordRequireSymbol]: String(d.passwordRequireSymbol),
  });

  await logActivity({ event: "admin:settings.security", userId: admin.id });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { success: "Authentication & security settings saved." };
}

export async function testSmtpAction(): Promise<SettingsState> {
  const admin = await requireAdmin();
  const verified = await verifySmtp();
  if (!verified.ok) return { error: verified.error ?? "SMTP verification failed." };

  const siteName = (await getSetting(SETTING_KEYS.siteName)) || "SPanel";
  const sent = await sendMail({
    to: admin.email,
    subject: `${siteName} SMTP test`,
    html: renderBrandedEmail(
      siteName,
      "SMTP is working",
      `<p>This is a test message triggered from the admin area by <strong>${admin.username}</strong>.</p>
       <p>If you received this, outbound email is correctly configured.</p>`,
    ),
  });

  return sent.sent ? { success: `Test email sent to ${admin.email}.` } : { error: sent.error ?? "Unable to send the test email." };
}

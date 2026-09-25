import { prisma } from "./db";
import { decrypt, encrypt } from "./crypto";
import { DEFAULT_SETTINGS, ENCRYPTED_SETTING_KEYS, SETTING_KEYS } from "./constants";

export interface BrandingSettings {
  siteName: string;
  siteLogo: string;
  siteFavicon: string;
  siteUrl: string;
  siteAccent: string;
  siteDescription: string;
  registrationOpen: boolean;
}

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: string;
  fromAddress: string;
  fromName: string;
}

/** Reads every setting merged over the defaults. Encrypted values are decrypted. */
export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  const map: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    map[row.key] = row.encrypted ? decrypt(row.value) : row.value;
  }
  return map;
}

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return DEFAULT_SETTINGS[key] ?? fallback;
  return row.encrypted ? decrypt(row.value) : row.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const shouldEncrypt = ENCRYPTED_SETTING_KEYS.includes(key);
  const stored = shouldEncrypt ? encrypt(value) : value;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: stored, encrypted: shouldEncrypt },
    update: { value: stored, encrypted: shouldEncrypt },
  });
}

export async function setSettings(values: Record<string, string | undefined>): Promise<void> {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined) as [string, string][];
  for (const [key, value] of entries) {
    // Never wipe a stored secret when the form submits an empty placeholder.
    if (ENCRYPTED_SETTING_KEYS.includes(key) && value === "") continue;
    await setSetting(key, value);
  }
}

export async function getBranding(): Promise<BrandingSettings> {
  const all = await getAllSettings();
  return {
    siteName: all[SETTING_KEYS.siteName] || "SPanel",
    siteLogo: all[SETTING_KEYS.siteLogo] || "",
    siteFavicon: all[SETTING_KEYS.siteFavicon] || "",
    siteUrl: all[SETTING_KEYS.siteUrl] || "",
    siteAccent: all[SETTING_KEYS.siteAccent] || "#f5f5f3",
    siteDescription: all[SETTING_KEYS.siteDescription] || "",
    registrationOpen: all[SETTING_KEYS.registrationOpen] === "true",
  };
}

export async function getSmtpSettings(): Promise<SmtpSettings> {
  const all = await getAllSettings();
  return {
    enabled: all[SETTING_KEYS.smtpEnabled] === "true",
    host: all[SETTING_KEYS.smtpHost] || "",
    port: Number(all[SETTING_KEYS.smtpPort] || 587),
    username: all[SETTING_KEYS.smtpUser] || "",
    password: all[SETTING_KEYS.smtpPass] || "",
    encryption: all[SETTING_KEYS.smtpEncryption] || "tls",
    fromAddress: all[SETTING_KEYS.smtpFromAddress] || "",
    fromName: all[SETTING_KEYS.smtpFromName] || "SPanel",
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, revokeAllSessions } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { buildPasswordSchema } from "@/lib/validation";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { logActivity } from "@/lib/activity";
import { encrypt, decrypt, randomToken, sha256, shortUuid, uuid as newUuid } from "@/lib/crypto";
import {
  generateSecret,
  otpauthUri,
  verifyToken,
  generateRecoveryCodes,
  normaliseRecoveryCode,
} from "@/lib/auth/totp";
import { API_KEY_SCOPE_KEYS } from "@/lib/constants";

export interface AccountState {
  error?: string;
  success?: string;
}

const TOTP_ISSUER = "SPanel";

export async function updateProfileAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireUser();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!firstName || !lastName) return { error: "First and last name are required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };

  const clash = await prisma.user.findFirst({ where: { email, id: { not: user.id } }, select: { id: true } });
  if (clash) return { error: "That email address is already in use." };

  await prisma.user.update({ where: { id: user.id }, data: { firstName, lastName, email } });
  await logActivity({ event: "account:profile.update", userId: user.id });
  revalidatePath("/dashboard/account");
  return { success: "Profile updated." };
}

export async function changePasswordAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireUser();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next !== confirm) return { error: "The new passwords do not match." };

  const parsed = buildPasswordSchema(await getPasswordPolicy()).safeParse(next);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Password is too weak." };

  const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { password: true } });
  if (!(await verifyPassword(current, record.password))) return { error: "Your current password is incorrect." };

  await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(next) } });
  await revokeAllSessions(user.id);
  await logActivity({ event: "account:password.change", userId: user.id });

  return { success: "Password changed. Other sessions have been signed out." };
}

// ---------------------------------------------------------------------------
// Two-factor authentication (TOTP)
// ---------------------------------------------------------------------------

export interface TotpSetupState extends AccountState {
  /** Present while enrolling: the pending secret + provisioning URI. */
  setup?: { secret: string; otpauthUri: string };
  /** Present right after confirming: one-time recovery codes to show once. */
  recoveryCodes?: string[];
}

async function hashRecoveryCodes(userId: number, codes: string[]): Promise<void> {
  await prisma.recoveryCode.deleteMany({ where: { userId } });
  await prisma.recoveryCode.createMany({
    data: codes.map((code) => ({ userId, code: sha256(normaliseRecoveryCode(code)) })),
  });
}

/** Step 1: generate a pending secret and show it + the otpauth URI. */
export async function beginTotpAction(): Promise<TotpSetupState> {
  const user = await requireUser();
  const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { totpEnabled: true } });
  if (record.totpEnabled) return { error: "Two-factor authentication is already enabled." };

  const secret = generateSecret();
  return { setup: { secret, otpauthUri: otpauthUri(secret, user.email, TOTP_ISSUER) } };
}

/** Step 2: confirm the pending secret with a live code, then enable + issue codes. */
export async function confirmTotpAction(_prev: TotpSetupState, formData: FormData): Promise<TotpSetupState> {
  const user = await requireUser();
  const secret = String(formData.get("secret") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();

  if (!secret) return { error: "Restart the setup flow and try again." };
  if (!verifyToken(secret, token)) {
    return { error: "That code is incorrect. Check your authenticator app and try again.", setup: { secret, otpauthUri: otpauthUri(secret, user.email, TOTP_ISSUER) } };
  }

  const codes = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: encrypt(secret), totpEnabled: true },
  });
  await hashRecoveryCodes(user.id, codes);
  await logActivity({ event: "account:totp.enable", userId: user.id });

  revalidatePath("/dashboard/account");
  return { success: "Two-factor authentication enabled. Save your recovery codes now.", recoveryCodes: codes };
}

/** Disables 2FA. Requires the account password OR a current TOTP code. */
export async function disableTotpAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireUser();
  const password = String(formData.get("password") ?? "");
  const token = String(formData.get("token") ?? "").trim();

  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { password: true, totpSecret: true, totpEnabled: true },
  });
  if (!record.totpEnabled) return { error: "Two-factor authentication is not enabled." };

  const secret = decrypt(record.totpSecret);
  const codeOk = token.length > 0 && secret.length > 0 && verifyToken(secret, token);
  const passwordOk = password.length > 0 && (await verifyPassword(password, record.password));
  if (!codeOk && !passwordOk) return { error: "Enter your password or a valid authenticator code to disable 2FA." };

  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabled: false } });
  await prisma.recoveryCode.deleteMany({ where: { userId: user.id } });
  await logActivity({ event: "account:totp.disable", userId: user.id });

  revalidatePath("/dashboard/account");
  return { success: "Two-factor authentication disabled." };
}

/** Regenerates recovery codes (invalidates old ones). Requires a live TOTP code. */
export async function regenerateRecoveryCodesAction(_prev: TotpSetupState, formData: FormData): Promise<TotpSetupState> {
  const user = await requireUser();
  const token = String(formData.get("token") ?? "").trim();

  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!record.totpEnabled) return { error: "Enable two-factor authentication first." };

  const secret = decrypt(record.totpSecret);
  if (!secret || !verifyToken(secret, token)) return { error: "Enter a valid authenticator code to regenerate codes." };

  const codes = generateRecoveryCodes();
  await hashRecoveryCodes(user.id, codes);
  await logActivity({ event: "account:totp.recovery.regenerate", userId: user.id });

  return { success: "New recovery codes generated. Your old codes no longer work.", recoveryCodes: codes };
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export interface ApiKeyState extends AccountState {
  /** The full token shown exactly once after creation: `<identifier>.<secret>`. */
  createdToken?: { identifier: string; token: string };
}

/** Creates an API key. Returns the full token ONCE; only the hash is stored. */
export async function createApiKeyAction(_prev: ApiKeyState, formData: FormData): Promise<ApiKeyState> {
  const user = await requireUser();
  const memo = String(formData.get("memo") ?? "").trim().slice(0, 120) || null;
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
  const scopes = API_KEY_SCOPE_KEYS.filter((scope) => formData.get(`scope:${scope}`) !== null);

  if (scopes.length === 0) return { error: "Select at least one scope for the key." };

  let expiresAt: Date | null = null;
  if (expiresRaw) {
    const parsed = new Date(expiresRaw);
    if (Number.isNaN(parsed.getTime())) return { error: "Invalid expiry date." };
    if (parsed.getTime() < Date.now()) return { error: "Expiry must be in the future." };
    expiresAt = parsed;
  }

  const count = await prisma.apiKey.count({ where: { userId: user.id } });
  if (count >= 25) return { error: "You have reached the maximum of 25 API keys." };

  const identifier = shortUuid(newUuid());
  const secret = randomToken(32);

  await prisma.apiKey.create({
    data: {
      userId: user.id,
      identifier,
      tokenHash: sha256(secret),
      memo,
      permissions: JSON.stringify(scopes),
      expiresAt,
    },
  });
  await logActivity({ event: "account:apikey.create", userId: user.id, properties: { identifier, scopes } });

  revalidatePath("/dashboard/account");
  return {
    success: "API key created. Copy it now — it will not be shown again.",
    createdToken: { identifier, token: `${identifier}.${secret}` },
  };
}

/** Deletes an API key the caller owns. */
export async function deleteApiKeyAction(keyId: number): Promise<ApiKeyState> {
  const user = await requireUser();
  const key = await prisma.apiKey.findFirst({ where: { id: keyId, userId: user.id }, select: { id: true, identifier: true } });
  if (!key) return { error: "API key not found." };

  await prisma.apiKey.delete({ where: { id: key.id } });
  await logActivity({ event: "account:apikey.delete", userId: user.id, properties: { identifier: key.identifier } });

  revalidatePath("/dashboard/account");
  return { success: "API key revoked." };
}

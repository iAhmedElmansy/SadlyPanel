"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { uuid, decrypt, sha256 } from "@/lib/crypto";
import { hashPassword, verifyPassword } from "@/lib/password";
import { clientIp, createSession, destroySession, isFirstRun, revokeAllSessions } from "@/lib/auth/session";
import { signTwoFactorChallenge, verifyTwoFactorChallenge } from "@/lib/auth/jwt";
import { verifyToken, normaliseRecoveryCode } from "@/lib/auth/totp";
import { buildPasswordSchema, buildRegisterSchema, loginSchema } from "@/lib/validation";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { issueAuthToken, consumeAuthToken, recentTokenCount } from "@/lib/auth/tokens";
import { getSetting, getBranding } from "@/lib/settings";
import { SETTING_KEYS } from "@/lib/constants";
import { renderVerifyEmail, renderResetEmail, sendMail } from "@/lib/mail";
import { logActivity } from "@/lib/activity";

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  /** Set when the password was correct but a 2FA code is now required. */
  twoFactor?: boolean;
  /** Signed short-lived proof that the password step passed. */
  challenge?: string;
  /** Set when login was blocked because the email is not yet verified. */
  unverified?: boolean;
}

/**
 * Consumes a valid TOTP code or one-time recovery code for a 2FA user.
 * Returns true and marks any used recovery code consumed.
 */
async function verifySecondFactor(userId: number, totpSecret: string | null, code: string): Promise<boolean> {
  const trimmed = code.trim();
  if (!trimmed) return false;

  const secret = decrypt(totpSecret);
  if (secret && /^\d{6}$/.test(trimmed.replace(/\s+/g, "")) && verifyToken(secret, trimmed)) return true;

  // Fall back to a one-time recovery code.
  const hashed = sha256(normaliseRecoveryCode(trimmed));
  const match = await prisma.recoveryCode.findFirst({ where: { userId, code: hashed, used: false } });
  if (match) {
    await prisma.recoveryCode.update({ where: { id: match.id }, data: { used: true } });
    return true;
  }
  return false;
}

function collectFieldErrors(issues: { path: (string | number)[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Brute-force guard: max 8 failed attempts per identity+ip within 10 minutes. */
async function isRateLimited(identity: string): Promise<boolean> {
  const ip = await clientIp();
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const attempts = await prisma.activityLog.count({
    where: {
      event: "auth:failed",
      createdAt: { gte: since },
      ...(ip ? { ip } : {}),
      properties: { contains: JSON.stringify(identity).slice(1, -1) },
    },
  });
  return attempts >= 8;
}

/**
 * Whether public registration is currently allowed. Honours the legacy env
 * override, the original `site.registration_open` switch and the newer
 * `auth.registration_enabled` alias — any of them being on opens registration.
 */
async function isRegistrationOpen(): Promise<boolean> {
  if (env.openRegistration) return true;
  const [legacy, alias] = await Promise.all([
    getSetting(SETTING_KEYS.registrationOpen),
    getSetting(SETTING_KEYS.authRegistrationEnabled),
  ]);
  return legacy === "true" || alias === "true";
}

/** Whether email verification is required before a fresh user can sign in. */
async function isEmailVerificationRequired(): Promise<boolean> {
  return (await getSetting(SETTING_KEYS.authEmailVerificationRequired)) === "true";
}

/**
 * Verification is only enforced for the base "user" role. Staff/admin accounts
 * (role support/admin, or rootAdmin) are exempt so enabling the toggle can never
 * lock out administrators or accounts that predate this feature.
 */
function verificationEnforcedFor(role: string, rootAdmin: boolean): boolean {
  return role === "user" && !rootAdmin;
}

/** Best-effort verification email; failures never block the surrounding action. */
async function sendVerificationEmail(userId: number, to: string): Promise<void> {
  try {
    const raw = await issueAuthToken(userId, "email_verify");
    const branding = await getBranding();
    const url = `${env.appUrl}/auth/verify?token=${encodeURIComponent(raw)}`;
    await sendMail({
      to,
      subject: `Confirm your ${branding.siteName} email`,
      html: renderVerifyEmail(branding.siteName, url),
    });
  } catch {
    // Never surface token/SMTP internals to the caller.
  }
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const policy = await getPasswordPolicy();
  const parsed = buildRegisterSchema(buildPasswordSchema(policy)).safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });

  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues), error: "Please fix the highlighted fields." };
  }

  const firstRun = await isFirstRun();
  if (!firstRun && !(await isRegistrationOpen())) {
    return { error: "Registration is closed. Ask an administrator to create your account." };
  }

  const data = parsed.data;
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: data.email }, { username: data.username }] },
    select: { email: true, username: true },
  });
  if (existing) {
    return {
      fieldErrors:
        existing.email === data.email
          ? { email: "That email is already registered." }
          : { username: "That username is taken." },
      error: "An account with those details already exists.",
    };
  }

  // First-run admins are trusted and auto-verified. Everyone else is verified
  // now only if verification is not required; otherwise they must confirm.
  const verificationRequired = !firstRun && (await isEmailVerificationRequired());
  const role = firstRun ? "admin" : "user";
  const mustVerify = verificationRequired && verificationEnforcedFor(role, firstRun);

  const user = await prisma.user.create({
    data: {
      uuid: uuid(),
      email: data.email,
      username: data.username,
      firstName: data.firstName,
      lastName: data.lastName,
      password: await hashPassword(data.password),
      role,
      rootAdmin: firstRun,
      emailVerifiedAt: mustVerify ? null : new Date(),
    },
  });

  await logActivity({
    event: "auth:register",
    userId: user.id,
    ip: await clientIp(),
    properties: { firstRun, role: user.role, verificationRequired: mustVerify },
  });

  if (mustVerify) {
    await sendVerificationEmail(user.id, user.email);
    return {
      success:
        "Account created. Check your inbox for a verification link to activate your account before signing in.",
    };
  }

  await createSession(user.id, user.role);
  redirect(firstRun ? "/admin?welcome=1" : "/dashboard");
}

/** Finalises a successful login: records the event and issues the session. */
async function completeLogin(userId: number, role: string, remember: boolean): Promise<never> {
  const h = await headers();
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date(), lastLoginIp: await clientIp() },
  });
  await logActivity({
    event: "auth:login",
    userId,
    ip: await clientIp(),
    properties: { userAgent: h.get("user-agent")?.slice(0, 160) ?? null, remember },
  });
  await createSession(userId, role);
  redirect("/dashboard");
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Second step of a 2FA login: a signed challenge proves the password already
  // passed, so we only need to verify the authenticator/recovery code here.
  const challenge = String(formData.get("challenge") ?? "");
  if (challenge) {
    const claims = await verifyTwoFactorChallenge(challenge);
    if (!claims) return { error: "Your login session expired. Please sign in again." };

    const user = await prisma.user.findUnique({ where: { id: claims.uid } });
    if (!user || !user.isActive || !user.totpEnabled) {
      return { error: "Your login session expired. Please sign in again." };
    }

    const code = String(formData.get("totp") ?? "");
    if (!(await verifySecondFactor(user.id, user.totpSecret, code))) {
      await logActivity({ event: "auth:failed", ip: await clientIp(), properties: { userId: user.id, stage: "2fa" } });
      return { twoFactor: true, challenge, error: "That authentication code is incorrect." };
    }
    return completeLogin(user.id, user.role, claims.remember);
  }

  const parsed = loginSchema.safeParse({
    identity: formData.get("identity"),
    password: formData.get("password"),
    remember: formData.get("remember") === "on",
  });

  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues), error: "Enter your credentials." };
  }

  const identity = parsed.data.identity.toLowerCase();
  const remember = parsed.data.remember ?? false;

  if (await isRateLimited(identity)) {
    return { error: "Too many failed attempts. Try again in a few minutes." };
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identity }, { username: parsed.data.identity }] },
  });

  const passwordOk = user ? await verifyPassword(parsed.data.password, user.password) : false;

  if (!user || !passwordOk) {
    await logActivity({ event: "auth:failed", ip: await clientIp(), properties: { identity } });
    return { error: "Those credentials do not match our records." };
  }
  if (!user.isActive) {
    return { error: "This account has been disabled." };
  }

  // Block sign-in for unverified accounts, but only when verification is on and
  // only for the enforced "user" role — admins/staff and pre-existing accounts
  // are never locked out.
  if (
    !user.emailVerifiedAt &&
    verificationEnforcedFor(user.role, user.rootAdmin) &&
    (await isEmailVerificationRequired())
  ) {
    return {
      error: "Verify your email address before signing in. Check your inbox for the verification link.",
      unverified: true,
    };
  }

  // 2FA user: issue a short-lived challenge and prompt for the code.
  if (user.totpEnabled) {
    return { twoFactor: true, challenge: await signTwoFactorChallenge(user.id, remember) };
  }

  return completeLogin(user.id, user.role, remember);
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/auth/login");
}

// ---------------------------------------------------------------------------
// Email verification resend
// ---------------------------------------------------------------------------

/** Neutral response used by resend/forgot so account existence never leaks. */
const NEUTRAL_RESEND = "If that account exists and still needs verification, we've sent a new link.";

/**
 * Re-issues a verification link. Always returns a neutral message and is
 * rate-limited (max 3 tokens / 15 min per user) to prevent enumeration/abuse.
 */
export async function resendVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const identity = String(formData.get("identity") ?? "").trim().toLowerCase();
  if (!identity) return { error: "Enter your username or email." };

  if (!(await isEmailVerificationRequired())) return { success: NEUTRAL_RESEND };

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identity }, { username: identity }] },
  });

  if (user && user.isActive && !user.emailVerifiedAt && verificationEnforcedFor(user.role, user.rootAdmin)) {
    const recent = await recentTokenCount(user.id, "email_verify", 15 * 60 * 1000);
    if (recent < 3) {
      await sendVerificationEmail(user.id, user.email);
      await logActivity({ event: "auth:verify.resend", userId: user.id, ip: await clientIp() });
    }
  }

  return { success: NEUTRAL_RESEND };
}

// ---------------------------------------------------------------------------
// Password reset (forgot)
// ---------------------------------------------------------------------------

const NEUTRAL_FORGOT = "If an account matches, we've sent a password reset link.";

/**
 * Starts a password reset. Always returns a neutral message (no user
 * enumeration), respects the password-reset toggle and rate-limits issuance.
 */
export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const identity = String(formData.get("identity") ?? "").trim().toLowerCase();
  if (!identity) return { error: "Enter your username or email." };

  const enabled = (await getSetting(SETTING_KEYS.authPasswordResetEnabled)) === "true";
  if (!enabled) return { success: NEUTRAL_FORGOT };

  // Light IP-scoped throttle reusing the failed-login guard shape.
  if (await isRateLimited(`forgot:${identity}`)) return { success: NEUTRAL_FORGOT };

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identity }, { username: identity }] },
  });

  if (user && user.isActive) {
    const recent = await recentTokenCount(user.id, "password_reset", 15 * 60 * 1000);
    if (recent < 3) {
      try {
        const raw = await issueAuthToken(user.id, "password_reset");
        const branding = await getBranding();
        const url = `${env.appUrl}/auth/reset?token=${encodeURIComponent(raw)}`;
        await sendMail({
          to: user.email,
          subject: `Reset your ${branding.siteName} password`,
          html: renderResetEmail(branding.siteName, url),
        });
        await logActivity({ event: "auth:password.reset.request", userId: user.id, ip: await clientIp() });
      } catch {
        // Swallow token/SMTP errors so timing/behaviour stays uniform.
      }
    }
  } else {
    // Record a failed attempt so repeated probing of an identity is throttled.
    await logActivity({ event: "auth:failed", ip: await clientIp(), properties: { identity: `forgot:${identity}` } });
  }

  return { success: NEUTRAL_FORGOT };
}

/**
 * Completes a password reset: validates the token, enforces the current
 * password policy, sets the new hash, marks the token used and revokes all
 * existing sessions. Returns success so the page can send the user to login.
 */
export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!token) return { error: "This reset link is invalid or has expired. Request a new one." };

  const enabled = (await getSetting(SETTING_KEYS.authPasswordResetEnabled)) === "true";
  if (!enabled) return { error: "Password resets are currently disabled." };

  if (password !== passwordConfirm) {
    return { fieldErrors: { passwordConfirm: "Passwords do not match." }, error: "Please fix the highlighted fields." };
  }

  const policy = await getPasswordPolicy();
  const parsed = buildPasswordSchema(policy).safeParse(password);
  if (!parsed.success) {
    return { fieldErrors: { password: parsed.error.issues[0]?.message ?? "Password is too weak." } };
  }

  // Consume the token first: single-use, expiry and hash checks live here.
  const userId = await consumeAuthToken(token, "password_reset");
  if (userId === null) {
    return { error: "This reset link is invalid or has expired. Request a new one." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { password: await hashPassword(parsed.data) },
  });
  // Reset counts as proof of email ownership — verify the address too.
  await prisma.user.updateMany({
    where: { id: userId, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
  await revokeAllSessions(userId);
  await logActivity({ event: "auth:password.reset.complete", userId, ip: await clientIp() });

  return { success: "Your password has been reset. You can now sign in with your new password." };
}

// ---------------------------------------------------------------------------
// Email verification (token consumption)
// ---------------------------------------------------------------------------

/** Marks a user's email verified from a valid token. Used by /auth/verify. */
export async function verifyEmailAction(rawToken: string): Promise<{ ok: boolean }> {
  const userId = await consumeAuthToken(rawToken, "email_verify");
  if (userId === null) return { ok: false };

  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await logActivity({ event: "auth:verify.confirm", userId, ip: await clientIp() });
  return { ok: true };
}

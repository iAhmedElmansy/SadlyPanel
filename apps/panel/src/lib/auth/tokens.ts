import { prisma } from "../db";
import { randomToken, sha256, safeEqual } from "../crypto";
import type { AuthTokenKind } from "../constants";

/** Lifetimes for each token kind. */
export const TOKEN_TTL_MS: Record<AuthTokenKind, number> = {
  email_verify: 24 * 60 * 60 * 1000, // 24h
  password_reset: 60 * 60 * 1000, // 1h
};

/**
 * Issues a single-use auth token. Only the sha256 hash is stored; the raw token
 * is returned once so it can be emailed. Any earlier unused tokens of the same
 * kind for this user are invalidated so only the latest link works.
 */
export async function issueAuthToken(userId: number, kind: AuthTokenKind): Promise<string> {
  const raw = randomToken(32);
  const now = new Date();
  await prisma.authToken.updateMany({
    where: { userId, kind, usedAt: null },
    data: { usedAt: now },
  });
  await prisma.authToken.create({
    data: {
      userId,
      kind,
      tokenHash: sha256(raw),
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[kind]),
    },
  });
  return raw;
}

/**
 * Validates a raw token: correct kind, unused, unexpired, hash matches. On
 * success the token is atomically marked used and the userId is returned.
 * Consumption is single-use: a second call with the same token fails.
 */
export async function consumeAuthToken(rawToken: string, kind: AuthTokenKind): Promise<number | null> {
  const trimmed = (rawToken ?? "").trim();
  if (!trimmed) return null;

  const hash = sha256(trimmed);
  const record = await prisma.authToken.findUnique({ where: { tokenHash: hash } });
  if (!record) return null;
  if (record.kind !== kind) return null;
  // Constant-time compare of the stored hash against the recomputed hash.
  if (!safeEqual(record.tokenHash, hash)) return null;
  if (record.usedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;

  // Atomically claim the token: updateMany with usedAt=null guards against a
  // concurrent second consumer, so only one caller ever succeeds.
  const claimed = await prisma.authToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) return null;

  return record.userId;
}

/**
 * Rate-limit helper for token issuance (resend verification / forgot password).
 * Returns true when the user has already been issued `max` tokens of this kind
 * within the window, so callers can throttle without leaking existence.
 */
export async function recentTokenCount(userId: number, kind: AuthTokenKind, windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  return prisma.authToken.count({ where: { userId, kind, createdAt: { gte: since } } });
}

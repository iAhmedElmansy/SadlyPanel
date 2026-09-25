import { timingSafeEqual } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "../db";
import { sha256 } from "../crypto";

/**
 * Bearer authentication for the client API surface (/api/client/*).
 *
 * A key is presented as `Authorization: Bearer <identifier>.<secret>`. We look
 * the key up by its public `identifier`, then constant-time compare the sha256
 * of the presented secret against the stored `tokenHash` (mirrors the node
 * token flow in remote-auth.ts). Expiry is enforced and `lastUsedAt` is bumped.
 * Only the hash is ever stored; the secret is shown to the user exactly once.
 */

export class ApiKeyError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message);
    this.name = "ApiKeyError";
  }
}

export interface ApiKeyContext {
  user: User;
  scopes: string[];
  keyId: number;
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function parseScopes(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    /* fall through */
  }
  return [];
}

/**
 * Authenticates a request via its API key and returns the owning user + scopes.
 * Throws `ApiKeyError` with an appropriate status on any failure.
 */
export async function authenticateApiKey(request: Request): Promise<ApiKeyContext> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new ApiKeyError("Missing bearer token.");

  const presented = header.slice(7).trim();
  const separator = presented.indexOf(".");
  if (separator <= 0) throw new ApiKeyError("Malformed API key.");

  const identifier = presented.slice(0, separator);
  const secret = presented.slice(separator + 1);
  if (!identifier || !secret) throw new ApiKeyError("Malformed API key.");

  const key = await prisma.apiKey.findUnique({ where: { identifier }, include: { user: true } });
  if (!key) throw new ApiKeyError("Invalid API credentials.", 403);

  if (!safeCompare(sha256(secret), key.tokenHash)) throw new ApiKeyError("Invalid API credentials.", 403);
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) throw new ApiKeyError("API key has expired.", 403);
  if (!key.user.isActive) throw new ApiKeyError("Account disabled.", 403);

  // Best-effort last-used bump; never block auth on a write failure.
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);

  return { user: key.user, scopes: parseScopes(key.permissions), keyId: key.id };
}

/** True when the key was granted the given scope. */
export function hasScope(context: ApiKeyContext, scope: string): boolean {
  return context.scopes.includes(scope);
}

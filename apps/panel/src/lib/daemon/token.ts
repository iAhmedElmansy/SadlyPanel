import { SignJWT, jwtVerify } from "jose";

/**
 * Tokens the panel mints for the daemon. Signed with the node's daemon token so
 * only that node can validate them, and short-lived so a leaked console token
 * cannot be reused.
 */

export interface DaemonWsClaims {
  serverUuid: string;
  userId: number;
  username: string;
  permissions: string[];
}

const AUDIENCE = "spanel-daemon";
const ISSUER = "spanel-panel";

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signDaemonToken(secret: string, claims: DaemonWsClaims, ttlSeconds = 600): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(crypto.randomUUID())
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key(secret));
}

export async function verifyDaemonToken(secret: string, token: string): Promise<DaemonWsClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISSUER, audience: AUDIENCE });
    if (typeof payload.serverUuid !== "string" || typeof payload.userId !== "number") return null;
    return {
      serverUuid: payload.serverUuid,
      userId: payload.userId,
      username: typeof payload.username === "string" ? payload.username : "",
      permissions: Array.isArray(payload.permissions) ? (payload.permissions as string[]) : [],
    };
  } catch {
    return null;
  }
}

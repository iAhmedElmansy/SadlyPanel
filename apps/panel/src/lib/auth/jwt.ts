import { SignJWT, jwtVerify } from "jose";

/**
 * Edge-safe JWT helpers. This module must not import node-only APIs because it
 * is used from `middleware.ts` (Edge runtime) as well as from server code.
 */

const COOKIE_NAME = process.env.SESSION_COOKIE || "spanel_session";
const DEV_APP_KEY = "spanel-development-key-change-me-0000000000";

function secret(): Uint8Array {
  const key = process.env.APP_KEY || DEV_APP_KEY;
  return new TextEncoder().encode(key);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

export interface SessionClaims {
  /** Session row id. */
  sid: string;
  /** User id. */
  uid: number;
  /** Role snapshot — for cheap edge checks only, never for authorisation. */
  role: string;
}

export async function signSessionJwt(claims: SessionClaims, expiresAt: Date): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer("spanel")
    .setAudience("spanel-panel")
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());
}

export async function verifySessionJwt(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: "spanel",
      audience: "spanel-panel",
    });
    if (typeof payload.sid !== "string" || typeof payload.uid !== "number") return null;
    return { sid: payload.sid, uid: payload.uid, role: typeof payload.role === "string" ? payload.role : "user" };
  } catch {
    return null;
  }
}

/**
 * Short-lived (5 min) challenge issued after a correct password when the user
 * has 2FA enabled. It proves the first factor was passed so the second step
 * never has to resend the password. Bound to the `remember` choice.
 */
export async function signTwoFactorChallenge(uid: number, remember: boolean): Promise<string> {
  return new SignJWT({ uid, remember })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer("spanel")
    .setAudience("spanel-2fa")
    .setExpirationTime("5m")
    .sign(secret());
}

export async function verifyTwoFactorChallenge(token: string): Promise<{ uid: number; remember: boolean } | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "spanel", audience: "spanel-2fa" });
    if (typeof payload.uid !== "number") return null;
    return { uid: payload.uid, remember: payload.remember === true };
  } catch {
    return null;
  }
}

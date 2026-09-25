import { createHmac, timingSafeEqual } from "node:crypto";
import { jwtVerify } from "jose";
import type { IncomingMessage } from "node:http";

/**
 * Authentication for daemon endpoints.
 *
 * Panel → daemon: `Authorization: Bearer <tokenId>.<token>` plus an
 * `X-Spanel-Signature` HMAC over the raw body.
 *
 * Browser → daemon (websocket): a short-lived JWT signed by the panel with the
 * same node token, carrying the server uuid and the user's permissions.
 */

export interface WsClaims {
  serverUuid: string;
  userId: number;
  username: string;
  permissions: string[];
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyPanelRequest(
  request: IncomingMessage,
  rawBody: string,
  expected: { tokenId: string; token: string },
): void {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new AuthError("Missing bearer token.");

  const presented = header.slice(7).trim();
  const separator = presented.indexOf(".");
  if (separator <= 0) throw new AuthError("Malformed token.");

  const tokenId = presented.slice(0, separator);
  const token = presented.slice(separator + 1);

  if (!safeCompare(tokenId, expected.tokenId) || !safeCompare(token, expected.token)) {
    throw new AuthError("Invalid node credentials.", 403);
  }

  const signature = request.headers["x-spanel-signature"];
  if (typeof signature !== "string") throw new AuthError("Missing request signature.", 403);

  const computed = createHmac("sha256", expected.token).update(rawBody).digest("hex");
  if (!safeCompare(signature, computed)) throw new AuthError("Request signature mismatch.", 403);
}

export async function verifyWsToken(token: string, secret: string): Promise<WsClaims> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: "spanel-panel",
      audience: "spanel-daemon",
    });
    if (typeof payload.serverUuid !== "string" || typeof payload.userId !== "number") {
      throw new AuthError("Token is missing required claims.");
    }
    return {
      serverUuid: payload.serverUuid,
      userId: payload.userId,
      username: typeof payload.username === "string" ? payload.username : "",
      permissions: Array.isArray(payload.permissions) ? (payload.permissions as string[]) : [],
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError("Console token is invalid or expired.");
  }
}

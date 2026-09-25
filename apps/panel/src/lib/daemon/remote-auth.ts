import { createHmac, timingSafeEqual } from "node:crypto";
import type { Node } from "@prisma/client";
import { prisma } from "../db";
import { decrypt } from "../crypto";

/**
 * Authentication for the reverse direction: daemon → panel.
 *
 * The daemon presents the same credential pair it uses for inbound requests
 * (`Authorization: Bearer <tokenId>.<token>`) plus `X-Spanel-Signature`, an
 * HMAC-SHA256 of the raw request body keyed with the node token. The panel
 * looks the node up by `daemonTokenId`, decrypts the stored token and compares
 * both values in constant time, so a leaked proxy log cannot be replayed with a
 * modified body and an unknown token id leaks nothing beyond "not found".
 */

export class RemoteAuthError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message);
    this.name = "RemoteAuthError";
  }
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface RemoteRequest {
  node: Node;
  /** Raw request body exactly as signed by the daemon. */
  rawBody: string;
  /** Parsed body, or undefined when the body was empty. */
  body: unknown;
}

/**
 * Verifies a daemon request and returns the calling node with its parsed body.
 * Throws `RemoteAuthError` with an appropriate status on any failure.
 */
export async function authenticateNodeRequest(request: Request): Promise<RemoteRequest> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new RemoteAuthError("Missing bearer token.");

  const presented = header.slice(7).trim();
  const separator = presented.indexOf(".");
  if (separator <= 0) throw new RemoteAuthError("Malformed node token.");

  const tokenId = presented.slice(0, separator);
  const token = presented.slice(separator + 1);
  if (!/^[a-f0-9]{4,64}$/i.test(tokenId)) throw new RemoteAuthError("Malformed node token.");

  const node = await prisma.node.findUnique({ where: { daemonTokenId: tokenId } });
  if (!node) throw new RemoteAuthError("Unknown node credentials.", 403);

  const expected = decrypt(node.daemonToken);
  if (!expected || !safeCompare(token, expected)) throw new RemoteAuthError("Invalid node credentials.", 403);

  const rawBody = await request.text();

  const signature = request.headers.get("x-spanel-signature");
  if (!signature) throw new RemoteAuthError("Missing request signature.", 403);
  const computed = createHmac("sha256", expected).update(rawBody).digest("hex");
  if (!safeCompare(signature, computed)) throw new RemoteAuthError("Request signature mismatch.", 403);

  let body: unknown;
  if (rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new RemoteAuthError("Invalid JSON body.", 400);
    }
  }

  return { node, rawBody, body };
}

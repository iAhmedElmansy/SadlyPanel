import crypto from "node:crypto";
import { env } from "./env";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "spv1";

function deriveKey(): Buffer {
  // APP_KEY may be any length; normalise to a 32-byte key.
  return crypto.createHash("sha256").update(env.appKey, "utf8").digest();
}

/** AES-256-GCM encrypt. Output: spv1:<iv>:<tag>:<ciphertext> (all base64url). */
export function encrypt(plain: string): string {
  if (plain === "") return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

/** Decrypts a value produced by `encrypt`. Returns raw input if not encrypted. */
export function decrypt(payload: string | null | undefined): string {
  if (!payload) return "";
  if (!payload.startsWith(`${PREFIX}:`)) return payload;
  const [, ivPart, tagPart, dataPart] = payload.split(":");
  if (!ivPart || !tagPart || !dataPart) return "";
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function randomHex(bytes = 16): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function uuid(): string {
  return crypto.randomUUID();
}

/** Short 8-char identifier derived from a uuid (Pterodactyl-style). */
export function shortUuid(full: string): string {
  return full.replace(/-/g, "").slice(0, 8);
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Generates a strong password suitable for database users. */
export function generatePassword(length = 24): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%^*_-";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

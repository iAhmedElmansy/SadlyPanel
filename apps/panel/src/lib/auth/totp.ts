import crypto from "node:crypto";

/**
 * Hand-rolled RFC 6238 (TOTP) built on RFC 4226 (HOTP) using Node's crypto.
 * No third-party dependency: authenticator apps (Google Authenticator, Authy,
 * 1Password, …) only need base32 secret + otpauth URI + HMAC-SHA1 6-digit
 * codes on a 30-second step, which is exactly what this implements.
 *
 * The stored `User.totpSecret` is the RAW base32 string encrypted at rest via
 * src/lib/crypto.ts — callers decrypt before passing it to `verifyToken`.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

/** Encodes bytes to RFC 4648 base32 (no padding). */
function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** Decodes an RFC 4648 base32 string (padding/spacing tolerant). */
export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("Invalid base32 character in TOTP secret.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generates a fresh base32 secret (default 20 random bytes = 160 bits). */
export function generateSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

/** Builds the otpauth:// URI an authenticator app scans/imports. */
export function otpauthUri(secret: string, account: string, issuer = "SPanel"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Computes the HOTP/TOTP code for a given counter value. */
function hotp(secret: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  // Big-endian 64-bit counter; JS bitwise is 32-bit so split hi/lo.
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", secret).update(buffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/** Current TOTP code for a base32 secret (used for the RFC test vector check). */
export function generateToken(secret: string, forTime = Date.now()): string {
  const counter = Math.floor(forTime / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secret), counter);
}

/**
 * Verifies a 6-digit token against a base32 secret. Accepts codes within
 * ±`window` steps to tolerate clock drift. Constant-time compare per candidate.
 */
export function verifyToken(secret: string, token: string, window = 1): boolean {
  const normalised = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalised)) return false;
  let key: Buffer;
  try {
    key = base32Decode(secret);
  } catch {
    return false;
  }
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  const target = Buffer.from(normalised);
  for (let error = -window; error <= window; error += 1) {
    const candidate = Buffer.from(hotp(key, counter + error));
    if (candidate.length === target.length && crypto.timingSafeEqual(candidate, target)) return true;
  }
  return false;
}

/**
 * Generates `count` one-time recovery codes as human-friendly hyphenated
 * groups (e.g. "a1b2c-d3e4f"). These are shown ONCE and stored hashed.
 */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = crypto.randomBytes(6).toString("hex"); // 12 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

/** Normalises a recovery code for hashing/compare (lowercase, no spaces). */
export function normaliseRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/\s+/g, "");
}

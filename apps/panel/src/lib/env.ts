/**
 * Centralised, validated environment access for the panel.
 * Missing critical values fail fast in production but fall back to
 * development-safe defaults locally.
 */

function readString(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`[SPanel] Missing required environment variable: ${key}`);
}

function readBool(key: string, fallback = false): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const isProduction = process.env.NODE_ENV === "production";

const DEV_APP_KEY = "spanel-development-key-change-me-0000000000";

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction,
  /** Public panel URL, used for links inside emails and cert requests. */
  appUrl: readString("APP_URL", "https://spanel.sadlystudios.bond").replace(/\/+$/, ""),
  appName: readString("APP_NAME", "SPanel"),
  /** 32+ char secret used for AES-256-GCM at-rest encryption and JWT signing. */
  appKey: isProduction ? readString("APP_KEY") : readString("APP_KEY", DEV_APP_KEY),
  databaseUrl: readString("DATABASE_URL", "file:./dev.db"),
  sessionCookie: readString("SESSION_COOKIE", "spanel_session"),
  sessionTtlDays: Number(readString("SESSION_TTL_DAYS", "14")),
  /** Trust X-Forwarded-For when the panel sits behind a reverse proxy. */
  trustProxy: readBool("TRUST_PROXY", true),
  /** Allows /auth/register to work even after the first admin exists. */
  openRegistration: readBool("OPEN_REGISTRATION", false),
  uploadDir: readString("UPLOAD_DIR", "public/uploads"),
} as const;

if (isProduction && env.appKey.length < 32) {
  throw new Error("[SPanel] APP_KEY must be at least 32 characters in production.");
}

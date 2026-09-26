import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Real daemon version, read from package.json at runtime so the value reported
 * to the panel (heartbeat, /api/system, `version` command) always matches the
 * shipped build instead of a hand-maintained constant.
 *
 * package.json sits one directory above this file in BOTH layouts:
 *   dev  -> apps/daemon/src/version.ts   ->  ../package.json
 *   dist -> apps/daemon/dist/version.js  ->  ../package.json
 */
function readVersion(): string {
  try {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const raw = readFileSync(fileURLToPath(pkgUrl), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // Fall through to the safe default below.
  }
  return "0.0.0";
}

export const VERSION = readVersion();

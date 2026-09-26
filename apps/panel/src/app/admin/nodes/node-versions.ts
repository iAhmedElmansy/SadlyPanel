import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "@/lib/version";

/**
 * Daemon version helpers for the admin nodes area.
 *
 * There is no remote release feed for the daemon: the panel and daemon ship
 * together from this monorepo, so the "latest" daemon build a node could be
 * running is simply the version of `apps/daemon` in this checkout. A node whose
 * reported `daemonVersion` is older than that is behind and can be updated with
 * `spanel-daemon update`. This is a purely LOCAL comparison — nothing is
 * fetched — and it never throws, so a broken checkout just reports "no info".
 * Do not import this into client components.
 */

/** Version of `apps/daemon` in this monorepo — the daemon build this panel ships. */
export function daemonPackageVersion(): string {
  const root = repoRoot();
  if (!root) return "0.0.0";
  try {
    const raw = readFileSync(path.join(root, "apps", "daemon", "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === "string" && parsed.version ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Strip a leading "v" and split into numeric release segments. */
function segments(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, "")
    .split(/[.\-+]/)
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/** True when `reported` is a valid version strictly older than `target`. */
export function isOlder(reported: string | null | undefined, target: string): boolean {
  if (!reported) return false;
  const a = segments(reported);
  const b = segments(target);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

/**
 * The daemon version a node should update to, or `null` when it is up to date,
 * has not reported a version, or the bundled version is unknown.
 */
export function daemonUpdateTarget(reported: string | null | undefined, latest = daemonPackageVersion()): string | null {
  if (latest === "0.0.0") return null;
  return isOlder(reported, latest) ? latest : null;
}

import { execFile } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Server-side version + update helpers.
 *
 * Panel and daemon versions come from their package.json files; "is an update
 * available" is answered from git (how far the local checkout is behind its
 * upstream branch). Everything here is defensive: it never throws, so a broken
 * or non-git deployment simply reports "no update info" instead of crashing the
 * admin dashboard. Do not import this into client components.
 */

const execFileAsync = promisify(execFile);

/** Walk up from `startDir` looking for a directory that contains `marker`. */
function findUp(startDir: string, marker: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readPkgVersion(dir: string | null): string {
  if (!dir) return "0.0.0";
  try {
    const raw = readFileSync(path.join(dir, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === "string" && parsed.version ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Locate the monorepo root (the directory holding the .git folder). */
export function repoRoot(): string | null {
  return findUp(process.cwd(), ".git");
}

/** Version of apps/panel (this app). */
export function panelVersion(): string {
  const root = repoRoot();
  return readPkgVersion(root ? path.join(root, "apps", "panel") : process.cwd());
}

/** Version of the monorepo root package.json (the overall product version). */
export function rootVersion(): string {
  return readPkgVersion(repoRoot());
}

export interface UpdateStatus {
  isRepo: boolean;
  branch: string | null;
  behindBy: number;
  updateAvailable: boolean;
  current: string;
  latest: string | null;
  checkedAt: string;
  error?: string;
}

/**
 * Git-based update check: fetches the upstream branch and reports how many
 * commits the local checkout is behind. `updateAvailable` is true when behind.
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  const root = repoRoot();
  const current = rootVersion();
  const base: UpdateStatus = {
    isRepo: false,
    branch: null,
    behindBy: 0,
    updateAvailable: false,
    current,
    latest: null,
    checkedAt: new Date().toISOString(),
  };
  if (!root) return base;

  const opts = { cwd: root, timeout: 10_000 } as const;
  try {
    const branch = (await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], opts)).stdout.trim();
    // Best-effort fetch; ignore failures (offline, no remote, auth).
    await execFileAsync("git", ["fetch", "--quiet"], opts).catch(() => undefined);
    let behindBy = 0;
    try {
      const out = (await execFileAsync("git", ["rev-list", "--count", "HEAD..@{u}"], opts)).stdout.trim();
      behindBy = Number.parseInt(out, 10) || 0;
    } catch {
      // No upstream configured — treat as up to date.
    }
    return { ...base, isRepo: true, branch, behindBy, updateAvailable: behindBy > 0 };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : "git unavailable" };
  }
}

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Every filesystem operation is confined to a server's data directory.
 * Paths are resolved and then re-checked so `..` traversal and symlink escapes
 * cannot reach outside the volume.
 */

export class PathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathError";
  }
}

export class SafePath {
  constructor(private readonly root: string) {}

  get base(): string {
    return this.root;
  }

  /** Resolves a user-supplied path inside the volume. */
  resolve(relative: string): string {
    const cleaned = relative.replace(/\\/g, "/").replace(/^\/+/, "");
    const target = path.resolve(this.root, cleaned);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (target !== this.root && !target.startsWith(rootWithSep)) {
      throw new PathError(`Path escapes the server directory: ${relative}`);
    }
    return target;
  }

  /** Resolves and rejects symlinks that point outside the volume. */
  async resolveReal(relative: string): Promise<string> {
    const target = this.resolve(relative);
    try {
      const real = await fsp.realpath(target);
      const rootReal = await fsp.realpath(this.root);
      const rootWithSep = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
      if (real !== rootReal && !real.startsWith(rootWithSep)) {
        throw new PathError(`Symlink escapes the server directory: ${relative}`);
      }
      return real;
    } catch (error) {
      if (error instanceof PathError) throw error;
      // Path does not exist yet (e.g. new file) — the resolved path is still safe.
      return target;
    }
  }

  relative(absolute: string): string {
    return `/${path.relative(this.root, absolute).replace(/\\/g, "/")}`;
  }

  ensureRoot(): void {
    fs.mkdirSync(this.root, { recursive: true });
  }
}

/** Rejects file names that would break out of a directory or hit denylisted paths. */
export function assertSafeName(name: string): void {
  if (!name || name === "." || name === "..") throw new PathError("Invalid file name.");
  if (name.includes("/") || name.includes("\\")) throw new PathError("File names cannot contain slashes.");
  if (name.includes("\0")) throw new PathError("Invalid file name.");
}

export function matchesDenylist(relativePath: string, denylist: string[]): boolean {
  const normalised = relativePath.replace(/^\/+/, "");
  return denylist.some((pattern) => {
    const clean = pattern.replace(/^\/+/, "");
    if (clean.endsWith("/**")) return normalised.startsWith(clean.slice(0, -3));
    if (clean.includes("*")) {
      const regex = new RegExp(`^${clean.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
      return regex.test(normalised);
    }
    return normalised === clean;
  });
}

/** Recursively measures a directory, used for disk quota enforcement. */
export async function directorySize(directory: string): Promise<number> {
  let total = 0;
  const stack: string[] = [directory];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        try {
          total += (await fsp.stat(full)).size;
        } catch {
          // file vanished mid-walk
        }
      }
    }
  }
  return total;
}

const MIME_TYPES: Record<string, string> = {
  ".txt": "text/plain",
  ".log": "text/plain",
  ".json": "application/json",
  ".yml": "text/yaml",
  ".yaml": "text/yaml",
  ".toml": "text/plain",
  ".properties": "text/plain",
  ".conf": "text/plain",
  ".cfg": "text/plain",
  ".ini": "text/plain",
  ".env": "text/plain",
  ".md": "text/markdown",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".cjs": "application/javascript",
  ".ts": "application/typescript",
  ".css": "text/css",
  ".html": "text/html",
  ".htm": "text/html",
  ".php": "application/x-php",
  ".sh": "application/x-sh",
  ".xml": "application/xml",
  ".sql": "application/sql",
  ".jar": "application/java-archive",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

export function mimeFor(name: string): string {
  return MIME_TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}

export function modeString(mode: number, isDirectory: boolean): string {
  const permissions = (mode & 0o777).toString(8).padStart(3, "0");
  return `${isDirectory ? "d" : "-"}${permissions}`;
}

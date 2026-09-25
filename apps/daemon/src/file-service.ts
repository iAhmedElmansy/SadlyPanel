import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import tar from "tar-fs";
import { createGzip, createGunzip } from "node:zlib";
import { assertSafeName, matchesDenylist, mimeFor, modeString, SafePath } from "./fs-safe.js";
import type { FileEntry } from "./types.js";
import { createLogger } from "./logger.js";

const log = createLogger("files");

const MAX_EDIT_BYTES = 8 * 1024 * 1024;

export class FileService {
  constructor(
    private readonly safe: SafePath,
    private readonly denylist: string[],
  ) {}

  private assertAllowed(relative: string): void {
    if (matchesDenylist(relative, this.denylist)) {
      throw new Error(`Access to ${relative} is restricted for this service.`);
    }
  }

  async list(directory: string): Promise<FileEntry[]> {
    const absolute = await this.safe.resolveReal(directory);
    const entries = await fsp.readdir(absolute, { withFileTypes: true });

    const results: FileEntry[] = [];
    for (const entry of entries) {
      const full = path.join(absolute, entry.name);
      try {
        const stats = await fsp.lstat(full);
        results.push({
          name: entry.name,
          mode: modeString(stats.mode, entry.isDirectory()),
          size: stats.size,
          isFile: entry.isFile(),
          isSymlink: entry.isSymbolicLink(),
          mimetype: entry.isDirectory() ? "inode/directory" : mimeFor(entry.name),
          modifiedAt: stats.mtime.toISOString(),
        });
      } catch {
        // entry disappeared between readdir and lstat
      }
    }
    return results;
  }

  async read(file: string): Promise<string> {
    this.assertAllowed(file);
    const absolute = await this.safe.resolveReal(file);
    const stats = await fsp.stat(absolute);
    if (!stats.isFile()) throw new Error("Not a file.");
    if (stats.size > MAX_EDIT_BYTES) throw new Error("File is too large to open in the editor.");
    return fsp.readFile(absolute, "utf8");
  }

  async write(file: string, contents: string): Promise<void> {
    this.assertAllowed(file);
    const absolute = this.safe.resolve(file);
    await fsp.mkdir(path.dirname(absolute), { recursive: true });
    await fsp.writeFile(absolute, contents, "utf8");
  }

  async createDirectory(root: string, name: string): Promise<void> {
    assertSafeName(name);
    const absolute = this.safe.resolve(path.posix.join(root, name));
    await fsp.mkdir(absolute, { recursive: true });
  }

  async rename(root: string, files: { from: string; to: string }[]): Promise<void> {
    for (const item of files) {
      assertSafeName(path.basename(item.to));
      const from = await this.safe.resolveReal(path.posix.join(root, item.from));
      const to = this.safe.resolve(path.posix.join(root, item.to));
      this.assertAllowed(this.safe.relative(from));
      await fsp.rename(from, to);
    }
  }

  async delete(root: string, files: string[]): Promise<void> {
    for (const name of files) {
      const relative = path.posix.join(root, name);
      this.assertAllowed(relative);
      const absolute = this.safe.resolve(relative);
      if (absolute === this.safe.base) throw new Error("Refusing to delete the server root.");
      await fsp.rm(absolute, { recursive: true, force: true });
    }
  }

  async copy(location: string): Promise<string> {
    const source = await this.safe.resolveReal(location);
    const directory = path.dirname(source);
    const extension = path.extname(source);
    const stem = path.basename(source, extension);

    let candidate = path.join(directory, `${stem} copy${extension}`);
    let counter = 2;
    while (await this.exists(candidate)) {
      candidate = path.join(directory, `${stem} copy ${counter}${extension}`);
      counter += 1;
    }

    const stats = await fsp.stat(source);
    if (stats.isDirectory()) await fsp.cp(source, candidate, { recursive: true });
    else await fsp.copyFile(source, candidate);

    return this.safe.relative(candidate);
  }

  private async exists(absolute: string): Promise<boolean> {
    try {
      await fsp.access(absolute);
      return true;
    } catch {
      return false;
    }
  }

  async chmod(root: string, files: { file: string; mode: string }[]): Promise<void> {
    for (const item of files) {
      const absolute = await this.safe.resolveReal(path.posix.join(root, item.file));
      const parsed = Number.parseInt(item.mode, 8);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0o777) throw new Error(`Invalid mode: ${item.mode}`);
      await fsp.chmod(absolute, parsed);
    }
  }

  /** Creates a .tar.gz archive of the selected entries inside the same folder. */
  async compress(root: string, files: string[]): Promise<string> {
    const rootAbsolute = await this.safe.resolveReal(root);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const archiveName = `archive-${stamp}.tar.gz`;
    const archivePath = path.join(rootAbsolute, archiveName);

    for (const file of files) assertSafeName(file);

    await pipeline(
      tar.pack(rootAbsolute, { entries: files }),
      createGzip({ level: 6 }),
      createWriteStream(archivePath),
    );

    return archiveName;
  }

  /** Extracts .tar, .tar.gz/.tgz and .zip archives. */
  async decompress(root: string, file: string): Promise<void> {
    const rootAbsolute = await this.safe.resolveReal(root);
    const archive = await this.safe.resolveReal(path.posix.join(root, file));
    const lower = file.toLowerCase();

    if (lower.endsWith(".zip")) {
      await this.runCommand("unzip", ["-o", archive, "-d", rootAbsolute]);
      return;
    }
    if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
      const { createReadStream } = await import("node:fs");
      await pipeline(createReadStream(archive), createGunzip(), tar.extract(rootAbsolute));
      return;
    }
    if (lower.endsWith(".tar")) {
      const { createReadStream } = await import("node:fs");
      await pipeline(createReadStream(archive), tar.extract(rootAbsolute));
      return;
    }
    if (lower.endsWith(".rar") || lower.endsWith(".7z")) {
      await this.runCommand(lower.endsWith(".rar") ? "unrar" : "7z", ["x", "-o" + rootAbsolute, archive]);
      return;
    }
    throw new Error("Unsupported archive format.");
  }

  private runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: "ignore" });
      child.on("error", (error) => reject(new Error(`${command} is not available on this node: ${error.message}`)));
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)),
      );
    });
  }

  /** Downloads a remote file straight into the volume. */
  async pull(root: string, url: string, fileName?: string): Promise<string> {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http(s) URLs are supported.");

    const name = fileName?.trim() || path.basename(parsed.pathname) || "download";
    assertSafeName(name);

    const destination = this.safe.resolve(path.posix.join(root, name));
    await fsp.mkdir(path.dirname(destination), { recursive: true });

    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok || !response.body) throw new Error(`Download failed with status ${response.status}.`);

    const { Readable } = await import("node:stream");
    await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(destination));

    log.info(`Pulled ${url} to ${this.safe.relative(destination)}`);
    return this.safe.relative(destination);
  }
}

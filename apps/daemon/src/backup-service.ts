import fsp from "node:fs/promises";
import path from "node:path";
import { createWriteStream, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";
import { createHash } from "node:crypto";
import tar from "tar-fs";
import type { DaemonConfig } from "./config.js";
import { createLogger } from "./logger.js";

const log = createLogger("backups");

export interface BackupResult {
  uuid: string;
  bytes: number;
  checksum: string;
}

/** Creates and restores tar.gz snapshots of a server volume. */
export class BackupService {
  constructor(
    private readonly config: DaemonConfig,
    private readonly volumePathFor: (uuid: string) => string,
  ) {}

  private archivePath(backupUuid: string): string {
    return path.join(this.config.system.backupDirectory, `${backupUuid}.tar.gz`);
  }

  async create(serverUuid: string, backupUuid: string, ignore: string[]): Promise<BackupResult> {
    await fsp.mkdir(this.config.system.backupDirectory, { recursive: true });
    const source = this.volumePathFor(serverUuid);
    const destination = this.archivePath(backupUuid);

    const ignoreMatchers = ignore.map((pattern) => pattern.replace(/^\/+/, ""));

    await pipeline(
      tar.pack(source, {
        ignore: (name: string) => {
          const relative = path.relative(source, name).replace(/\\/g, "/");
          return ignoreMatchers.some((pattern) => {
            if (pattern.endsWith("/*")) return relative.startsWith(pattern.slice(0, -2));
            if (pattern.includes("*")) {
              const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
              return regex.test(relative);
            }
            return relative === pattern || relative.startsWith(`${pattern}/`);
          });
        },
      }),
      createGzip({ level: 6 }),
      createWriteStream(destination),
    );

    const stats = await fsp.stat(destination);
    const checksum = await this.checksum(destination);
    log.info(`Backup ${backupUuid} created (${(stats.size / 1048576).toFixed(1)} MiB)`);

    return { uuid: backupUuid, bytes: stats.size, checksum };
  }

  async restore(serverUuid: string, backupUuid: string, truncate: boolean): Promise<void> {
    const archive = this.archivePath(backupUuid);
    await fsp.access(archive);

    const target = this.volumePathFor(serverUuid);
    if (truncate) {
      await fsp.rm(target, { recursive: true, force: true });
      await fsp.mkdir(target, { recursive: true });
    }

    await pipeline(createReadStream(archive), createGunzip(), tar.extract(target));
    log.info(`Backup ${backupUuid} restored into ${serverUuid}`);
  }

  async remove(backupUuid: string): Promise<void> {
    await fsp.rm(this.archivePath(backupUuid), { force: true });
  }

  private async checksum(file: string): Promise<string> {
    const hash = createHash("sha256");
    await pipeline(createReadStream(file), hash);
    return hash.digest("hex");
  }
}

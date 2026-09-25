import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { DaemonConfig } from "./config.js";
import { createLogger } from "./logger.js";
import type { ProxySyncRequest } from "./types.js";

const log = createLogger("proxy");

/**
 * Generates nginx vhosts so servers are reachable by hostname instead of
 * ip:port, and writes Minecraft SRV hints for DNS automation.
 *
 * Website (webhost) servers are served directly from their volume:
 *   - static HTML  → nginx root
 *   - PHP          → fastcgi_pass to the server's PHP-FPM container port
 * Everything else is reverse-proxied to the container's primary port.
 */
export class ProxyService {
  constructor(
    private readonly config: DaemonConfig,
    private readonly volumePathFor: (uuid: string) => string,
  ) {}

  private vhostPath(uuid: string): string {
    return path.join(this.config.proxy.configDirectory, `${uuid}.conf`);
  }

  private srvPath(uuid: string): string {
    return path.join(this.config.proxy.configDirectory, `${uuid}.srv.json`);
  }

  async sync(request: ProxySyncRequest): Promise<{ applied: boolean; notes: string[] }> {
    const notes: string[] = [];
    if (!this.config.proxy.enabled) {
      return { applied: false, notes: ["Reverse proxy is disabled on this node."] };
    }

    await fsp.mkdir(this.config.proxy.configDirectory, { recursive: true });

    const httpHostnames = request.hostnames.filter((entry) => entry.kind === "http");
    const srvHostnames = request.hostnames.filter((entry) => entry.kind === "minecraft" || entry.kind === "tcp");

    if (httpHostnames.length === 0) {
      await fsp.rm(this.vhostPath(request.serverUuid), { force: true }).catch(() => undefined);
    } else {
      const blocks = httpHostnames.map((entry) => this.renderHttpBlock(request, entry, notes));
      const header = `# Managed by SPanel — do not edit.\n# Server: ${request.serverUuid}\n\n`;
      await fsp.writeFile(this.vhostPath(request.serverUuid), header + blocks.join("\n\n") + "\n", "utf8");
    }

    // SRV/TCP hostnames are DNS-level; record the intent for the panel/DNS tooling.
    if (srvHostnames.length === 0) {
      await fsp.rm(this.srvPath(request.serverUuid), { force: true }).catch(() => undefined);
    } else {
      const records = srvHostnames.map((entry) => ({
        hostname: entry.hostname,
        kind: entry.kind,
        target: request.upstream?.ip ?? null,
        port: entry.targetPort ?? request.upstream?.port ?? null,
        srv: entry.kind === "minecraft" ? `_minecraft._tcp.${entry.hostname}` : null,
      }));
      await fsp.writeFile(this.srvPath(request.serverUuid), JSON.stringify(records, null, 2), "utf8");
      notes.push(`${records.length} DNS record(s) recorded for ${request.serverUuid}.`);
    }

    const reloaded = await this.reload();
    if (!reloaded.ok) notes.push(reloaded.message);

    return { applied: true, notes };
  }

  async remove(uuid: string): Promise<void> {
    await fsp.rm(this.vhostPath(uuid), { force: true }).catch(() => undefined);
    await fsp.rm(this.srvPath(uuid), { force: true }).catch(() => undefined);
    await this.reload();
  }

  private renderHttpBlock(
    request: ProxySyncRequest,
    entry: ProxySyncRequest["hostnames"][number],
    notes: string[],
  ): string {
    const httpPort = this.config.proxy.httpPort;
    const httpsPort = this.config.proxy.httpsPort;
    const useTls = entry.httpsMode !== "off";
    const certDir = `/etc/letsencrypt/live/${entry.hostname}`;

    if (useTls && entry.httpsMode === "auto" && !this.config.proxy.acmeEmail) {
      notes.push(`No ACME email configured; issue a certificate for ${entry.hostname} manually.`);
    }

    const redirect = entry.forceHttps
      ? `server {
    listen ${httpPort};
    listen [::]:${httpPort};
    server_name ${entry.hostname};

    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}`
      : "";

    const listen = useTls
      ? `    listen ${httpsPort} ssl;
    listen [::]:${httpsPort} ssl;
    http2 on;

    ssl_certificate     ${certDir}/fullchain.pem;
    ssl_certificate_key ${certDir}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:8m;
    ssl_session_timeout 1d;`
      : `    listen ${httpPort};
    listen [::]:${httpPort};`;

    const common = `    server_name ${entry.hostname};

    client_max_body_size ${this.config.api.uploadLimit}m;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    access_log /var/log/nginx/${request.serverUuid}.access.log;
    error_log  /var/log/nginx/${request.serverUuid}.error.log warn;`;

    // Static website served straight from the volume.
    if (request.web && request.web.runtime === "html") {
      const documentRoot = path.posix.join(this.volumePathFor(request.serverUuid), request.web.documentRoot || "/");
      return `${redirect}

server {
${listen}
${common}

    root ${documentRoot};
    index index.html index.htm;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~* \\.(?:css|js|png|jpe?g|gif|svg|webp|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }
}`;
    }

    // PHP website: nginx serves files, PHP-FPM runs inside the container.
    if (request.web && request.web.runtime === "php") {
      const documentRoot = path.posix.join(this.volumePathFor(request.serverUuid), request.web.documentRoot || "/");
      const upstream = `${request.upstream?.ip ?? "127.0.0.1"}:${entry.targetPort ?? request.upstream?.port ?? 9000}`;
      return `${redirect}

server {
${listen}
${common}

    root ${documentRoot};
    index index.php index.html;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \\.php$ {
        try_files $uri =404;
        include fastcgi_params;
        fastcgi_pass ${upstream};
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_read_timeout 120s;
    }

    location ~ /\\.(?!well-known).* { deny all; }
}`;
    }

    // Generic application reverse proxy (Node.js and similar).
    const upstream = `${request.upstream?.ip ?? "127.0.0.1"}:${entry.targetPort ?? request.upstream?.port ?? 80}`;
    return `${redirect}

server {
${listen}
${common}

    location / {
        proxy_pass http://${upstream};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_buffering off;
    }
}`;
  }

  private reload(): Promise<{ ok: boolean; message: string }> {
    return new Promise((resolve) => {
      const [command, ...args] = this.config.proxy.reloadCommand.split(" ").filter(Boolean);
      if (!command) return resolve({ ok: false, message: "No reload command configured." });

      const child = spawn(command, args, { stdio: "ignore" });
      child.on("error", (error) => {
        log.warn(`Proxy reload failed: ${error.message}`);
        resolve({ ok: false, message: `Proxy reload failed: ${error.message}` });
      });
      child.on("close", (code) => {
        if (code === 0) resolve({ ok: true, message: "Proxy reloaded." });
        else resolve({ ok: false, message: `Proxy reload exited with code ${code}.` });
      });
    });
  }
}

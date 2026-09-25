import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { verifyWsToken, type WsClaims } from "./auth.js";
import type { ServerManager } from "./server-manager.js";
import { createLogger } from "./logger.js";
import type { ResourceUsage } from "./types.js";

const log = createLogger("ws");

interface Frame {
  event: string;
  args?: unknown[];
}

interface Client {
  socket: WebSocket;
  serverUuid: string;
  claims?: WsClaims;
  wantsStats: boolean;
}

const AUTH_TIMEOUT_MS = 10_000;

/**
 * Console websocket. The browser connects, sends `auth` with the panel-issued
 * JWT, then receives console output, status changes and stats until it closes.
 */
export class ConsoleGateway {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<Client>();

  constructor(
    server: HttpServer,
    private readonly manager: ServerManager,
    private readonly nodeToken: string,
  ) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const match = url.pathname.match(/^\/api\/servers\/([0-9a-fA-F-]{8,36})\/ws$/);
      if (!match) {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }
      const serverUuid = match[1]!;
      this.wss.handleUpgrade(request, socket, head, (ws) => this.register(ws, serverUuid));
    });

    this.manager.on("console", (uuid: string, line: string) => this.broadcast(uuid, "console output", [line]));
    this.manager.on("install", (uuid: string, line: string) => this.broadcast(uuid, "install output", [line]));
    this.manager.on("status", (uuid: string, state: string) => this.broadcast(uuid, "status", [state]));
    this.manager.on("stats", (uuid: string, usage: ResourceUsage) =>
      this.broadcast(uuid, "stats", [JSON.stringify(usage)], true),
    );
  }

  private register(socket: WebSocket, serverUuid: string): void {
    const client: Client = { socket, serverUuid, wantsStats: false };
    this.clients.add(client);

    const timeout = setTimeout(() => {
      if (!client.claims) {
        this.send(socket, "auth error", ["Authentication timed out."]);
        socket.close();
      }
    }, AUTH_TIMEOUT_MS);

    socket.on("message", (raw) => {
      void this.handleMessage(client, raw.toString()).catch((error) => {
        this.send(socket, "daemon error", [error instanceof Error ? error.message : "unknown error"]);
      });
    });

    socket.on("close", () => {
      clearTimeout(timeout);
      this.clients.delete(client);
    });

    socket.on("error", (error) => {
      log.debug(`Socket error: ${error.message}`);
      this.clients.delete(client);
    });
  }

  private async handleMessage(client: Client, raw: string): Promise<void> {
    let frame: Frame;
    try {
      frame = JSON.parse(raw) as Frame;
    } catch {
      return;
    }

    if (frame.event === "auth") {
      const token = String(frame.args?.[0] ?? "");
      try {
        const claims = await verifyWsToken(token, this.nodeToken);
        const runtime = this.manager.get(client.serverUuid);
        if (!runtime) throw new Error("Server is not registered on this node.");
        if (claims.serverUuid !== runtime.spec.uuid) throw new Error("Token does not match this server.");

        client.claims = claims;
        this.send(client.socket, "auth success", []);
        this.send(client.socket, "status", [runtime.state]);
      } catch (error) {
        this.send(client.socket, "jwt error", [error instanceof Error ? error.message : "invalid token"]);
        client.socket.close();
      }
      return;
    }

    if (!client.claims) {
      this.send(client.socket, "jwt error", ["Not authenticated."]);
      return;
    }

    const can = (permission: string) => client.claims!.permissions.includes(permission);

    switch (frame.event) {
      case "send logs": {
        const history = this.manager.history(client.serverUuid);
        if (history.length > 0) this.send(client.socket, "console output", history);
        break;
      }
      case "send stats": {
        client.wantsStats = true;
        try {
          const usage = await this.manager.usage(client.serverUuid);
          this.send(client.socket, "stats", [JSON.stringify(usage)]);
        } catch {
          // server may not be running yet
        }
        break;
      }
      case "send command": {
        if (!can("control.console")) {
          this.send(client.socket, "daemon error", ["You do not have console permission."]);
          return;
        }
        await this.manager.sendCommand(client.serverUuid, String(frame.args?.[0] ?? ""));
        break;
      }
      case "set state": {
        const action = String(frame.args?.[0] ?? "");
        const permission = { start: "control.start", stop: "control.stop", restart: "control.restart", kill: "control.stop" }[
          action
        ];
        if (!permission || !can(permission)) {
          this.send(client.socket, "daemon error", ["You do not have permission for that action."]);
          return;
        }
        await this.manager.power(client.serverUuid, action);
        break;
      }
      default:
        break;
    }
  }

  private send(socket: WebSocket, event: string, args: unknown[]): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ event, args }));
  }

  private broadcast(uuid: string, event: string, args: unknown[], statsOnly = false): void {
    for (const client of this.clients) {
      if (client.serverUuid !== uuid || !client.claims) continue;
      if (statsOnly && !client.wantsStats) continue;
      this.send(client.socket, event, args);
    }
  }

  close(): void {
    for (const client of this.clients) client.socket.close();
    this.wss.close();
  }
}

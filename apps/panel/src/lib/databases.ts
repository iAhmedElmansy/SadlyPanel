import mysql from "mysql2/promise";
import type { DatabaseHost } from "@prisma/client";
import { decrypt } from "./crypto";

/**
 * Provisions real MySQL/MariaDB databases + scoped users on a configured
 * database host, mirroring Pterodactyl's behaviour.
 *
 * Identifiers are validated against a strict allowlist because MySQL does not
 * support parameter binding for database or user names.
 */

const IDENTIFIER = /^[A-Za-z0-9_]{1,64}$/;

function assertIdentifier(value: string, label: string): void {
  if (!IDENTIFIER.test(value)) throw new Error(`Invalid ${label}: only letters, numbers and underscores are allowed.`);
}

function assertRemote(value: string): void {
  if (!/^[A-Za-z0-9_.:%\-]{1,120}$/.test(value)) throw new Error("Invalid remote host pattern.");
}

async function connect(host: DatabaseHost) {
  return mysql.createConnection({
    host: host.host,
    port: host.port,
    user: host.username,
    password: decrypt(host.password),
    multipleStatements: false,
    connectTimeout: 10_000,
  });
}

export async function testDatabaseHost(host: DatabaseHost): Promise<{ ok: boolean; version?: string; error?: string }> {
  let connection: mysql.Connection | null = null;
  try {
    connection = await connect(host);
    const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT VERSION() AS version");
    return { ok: true, version: String(rows[0]?.version ?? "unknown") };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error." };
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export interface ProvisionRequest {
  host: DatabaseHost;
  database: string;
  username: string;
  password: string;
  remote: string;
  maxConnections?: number;
}

export async function provisionDatabase(req: ProvisionRequest): Promise<void> {
  assertIdentifier(req.database, "database name");
  assertIdentifier(req.username, "database username");
  assertRemote(req.remote);

  let connection: mysql.Connection | null = null;
  try {
    connection = await connect(req.host);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${req.database}\``);
    await connection.query(`CREATE USER ?@? IDENTIFIED BY ?`, [req.username, req.remote, req.password]);
    await connection.query(`GRANT ALL PRIVILEGES ON \`${req.database}\`.* TO ?@? WITH GRANT OPTION`, [
      req.username,
      req.remote,
    ]);
    if (req.maxConnections && req.maxConnections > 0) {
      await connection.query(`ALTER USER ?@? WITH MAX_USER_CONNECTIONS ${Number(req.maxConnections)}`, [
        req.username,
        req.remote,
      ]);
    }
    await connection.query("FLUSH PRIVILEGES");
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export async function rotateDatabasePassword(
  host: DatabaseHost,
  username: string,
  remote: string,
  password: string,
): Promise<void> {
  assertIdentifier(username, "database username");
  assertRemote(remote);
  let connection: mysql.Connection | null = null;
  try {
    connection = await connect(host);
    await connection.query("ALTER USER ?@? IDENTIFIED BY ?", [username, remote, password]);
    await connection.query("FLUSH PRIVILEGES");
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export async function dropDatabase(host: DatabaseHost, database: string, username: string, remote: string): Promise<void> {
  assertIdentifier(database, "database name");
  assertIdentifier(username, "database username");
  assertRemote(remote);
  let connection: mysql.Connection | null = null;
  try {
    connection = await connect(host);
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await connection.query("DROP USER IF EXISTS ?@?", [username, remote]);
    await connection.query("FLUSH PRIVILEGES");
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

/** Builds a deterministic, collision-resistant database name: s{serverId}_{name}. */
export function buildDatabaseName(serverId: number, requested: string): string {
  const safe = requested.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40) || "db";
  return `s${serverId}_${safe}`;
}

export function buildDatabaseUsername(serverId: number, suffix: string): string {
  return `u${serverId}_${suffix.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}`;
}

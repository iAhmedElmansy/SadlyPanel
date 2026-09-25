/* eslint-disable no-console */
/**
 * SPanel background worker.
 *
 * A standalone, long-running Node process — deliberately NOT part of the
 * Next.js request lifecycle. It owns the periodic jobs the panel cannot run
 * inside serverless-style request handlers:
 *
 *   1. Schedule execution — runs due `Schedule` rows (command / power / backup
 *      tasks) via the same DaemonClient paths the UI uses.
 *   2. Node health reconciliation — recomputes `heartbeatStatus` every tick so
 *      a node that stopped beating is marked offline without waiting for an
 *      admin page to load (closes the README background-worker gap).
 *
 * Run it alongside `next start`:
 *
 *   npm run worker --workspace @spanel/panel
 *
 * Configure the cadence with SCHEDULER_INTERVAL_MS (default 30000).
 *
 * The worker is resilient: an unreachable node logs and the loop continues,
 * mirroring how provisioning tolerates daemon outages. Ticks never overlap.
 */

import { prisma } from "../src/lib/db";
import { startScheduler } from "../src/lib/services/scheduler";

const intervalMs = Number(process.env.SCHEDULER_INTERVAL_MS) || 30_000;

async function main(): Promise<void> {
  console.log("SPanel worker starting…");
  const stop = startScheduler(intervalMs);

  const shutdown = async (signal: string) => {
    console.log(`\n[worker] ${signal} received, shutting down.`);
    stop();
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (error) => {
  console.error("[worker] fatal:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});

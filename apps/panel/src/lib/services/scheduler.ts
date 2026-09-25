import type { Schedule, Task } from "@prisma/client";
import { prisma } from "../db";
import { daemonForServer } from "../daemon";
import { logActivity } from "../activity";
import { createServerBackup } from "./backups";
import { nextRun, type CronFields } from "./cron";
import { refreshNodeHealth } from "./heartbeat";
import { runDueChecks } from "./status-monitor";

/**
 * Schedule execution.
 *
 * Design: the runner lives in the panel because the panel owns the database and
 * the DaemonClient — the daemon has no view of the schedule table. Task actions
 * reuse the exact code paths the interactive UI uses:
 *   - power   -> DaemonClient.power (same call as powerAction)
 *   - command -> DaemonClient.sendCommand (same call as sendCommandAction)
 *   - backup  -> createServerBackup (same helper as createBackupAction)
 *
 * The runner is invoked two ways:
 *   1. `runScheduleNow(scheduleId)` — from the "run now" server action.
 *   2. `tick()` — from the standalone worker entry (src/scripts/worker.ts),
 *      NOT from the Next.js request lifecycle.
 *
 * Everything is wrapped so a single unreachable node logs and continues rather
 * than aborting the whole tick, mirroring how provisioning tolerates daemon
 * outages.
 */

function cronOf(schedule: Pick<Schedule, "cronMinute" | "cronHour" | "cronDayMonth" | "cronMonth" | "cronDayWeek">): CronFields {
  return {
    minute: schedule.cronMinute,
    hour: schedule.cronHour,
    dayMonth: schedule.cronDayMonth,
    month: schedule.cronMonth,
    dayWeek: schedule.cronDayWeek,
  };
}

/** Computes the next run for a schedule's cron fields, or null if unsatisfiable. */
export function computeNextRun(
  schedule: Pick<Schedule, "cronMinute" | "cronHour" | "cronDayMonth" | "cronMonth" | "cronDayWeek">,
  from: Date = new Date(),
): Date | null {
  return nextRun(cronOf(schedule), from);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TaskOutcome {
  taskId: number;
  action: string;
  ok: boolean;
  error?: string;
}

/** Executes one task against its server, reusing the existing daemon paths. */
async function executeTask(serverId: number, task: Task): Promise<void> {
  switch (task.action) {
    case "power": {
      const { client, uuid } = await daemonForServer(serverId);
      await client.power(uuid, task.payload.trim());
      return;
    }
    case "command": {
      const { client, uuid } = await daemonForServer(serverId);
      await client.sendCommand(uuid, task.payload);
      return;
    }
    case "backup": {
      await createServerBackup({ serverId, name: task.payload.trim() || undefined });
      return;
    }
    default:
      throw new Error(`Unknown task action "${task.action}".`);
  }
}

/**
 * Runs every task of a schedule in `sequenceId` order. `timeOffset` (seconds)
 * is honoured as a delay applied *before* each task, so a task can wait for the
 * previous one to settle. Respects `continueOnFailure`.
 */
export async function runScheduleTasks(scheduleId: number): Promise<{ ran: number; outcomes: TaskOutcome[] }> {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { tasks: { orderBy: { sequenceId: "asc" } } },
  });
  if (!schedule) throw new Error("Schedule not found.");

  const outcomes: TaskOutcome[] = [];

  for (const task of schedule.tasks) {
    if (task.timeOffset > 0) await sleep(task.timeOffset * 1000);
    try {
      await executeTask(schedule.serverId, task);
      outcomes.push({ taskId: task.id, action: task.action, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Task failed.";
      outcomes.push({ taskId: task.id, action: task.action, ok: false, error: message });
      if (!task.continueOnFailure) break;
    }
  }

  const now = new Date();
  await prisma.schedule.update({
    where: { id: schedule.id },
    data: { lastRunAt: now, nextRunAt: computeNextRun(schedule, now) },
  });

  return { ran: outcomes.length, outcomes };
}

/**
 * Immediately runs a schedule (used by the "run now" action) and records it.
 * `actingUserId` is optional so the worker can call it too.
 */
export async function runScheduleNow(scheduleId: number, actingUserId?: number): Promise<{ ran: number; outcomes: TaskOutcome[] }> {
  const result = await runScheduleTasks(scheduleId);
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId }, select: { serverId: true, name: true } });
  await logActivity({
    event: "server:schedule.run",
    userId: actingUserId ?? null,
    serverId: schedule?.serverId ?? null,
    properties: { schedule: schedule?.name, tasks: result.ran, trigger: actingUserId ? "manual" : "worker" },
  });
  return result;
}

/** True when the server is (as far as the panel knows) running. */
function serverIsOnline(status: string): boolean {
  return status === "running" || status === "starting";
}

/**
 * Finds every active schedule due at or before `now` and runs it. Schedules
 * with `onlyWhenOnline` are skipped (and their next run advanced) when the
 * server is not running. Each schedule is isolated: a failure logs and the
 * loop continues.
 */
export async function runDueSchedules(now: Date = new Date()): Promise<{ processed: number; skipped: number; failed: number }> {
  const due = await prisma.schedule.findMany({
    where: { isActive: true, nextRunAt: { not: null, lte: now } },
    include: { server: { select: { id: true, status: true, suspended: true } } },
    orderBy: { nextRunAt: "asc" },
  });

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const schedule of due) {
    try {
      // Suspended servers never run scheduled work.
      if (schedule.server.suspended) {
        await prisma.schedule.update({
          where: { id: schedule.id },
          data: { nextRunAt: computeNextRun(schedule, now) },
        });
        skipped += 1;
        continue;
      }

      if (schedule.onlyWhenOnline && !serverIsOnline(schedule.server.status)) {
        // Not online — advance the schedule without running it.
        await prisma.schedule.update({
          where: { id: schedule.id },
          data: { nextRunAt: computeNextRun(schedule, now) },
        });
        skipped += 1;
        continue;
      }

      await runScheduleNow(schedule.id);
      processed += 1;
    } catch (error) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.error(`[scheduler] schedule ${schedule.id} (${schedule.name}) failed:`, error instanceof Error ? error.message : error);
      // Still advance so a permanently broken schedule does not spin every tick.
      await prisma.schedule
        .update({ where: { id: schedule.id }, data: { lastRunAt: now, nextRunAt: computeNextRun(schedule, now) } })
        .catch(() => undefined);
    }
  }

  return { processed, skipped, failed };
}

let running = false;

/**
 * A single worker tick. Guards against overlap so a slow run (e.g. a task with
 * a large timeOffset) never stacks with the next interval. Also reconciles node
 * heartbeat health so `heartbeatStatus` no longer lags until an admin page
 * loads (addresses the README background-worker gap).
 */
export async function tick(): Promise<void> {
  if (running) return;
  running = true;
  const startedAt = new Date();
  try {
    await refreshNodeHealth().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[scheduler] node health refresh failed:", error instanceof Error ? error.message : error);
    });
    await runDueChecks(startedAt)
      .then((r) => {
        if (r.checked || r.failed) {
          // eslint-disable-next-line no-console
          console.log(`[status] tick: checked ${r.checked}, failed ${r.failed}`);
        }
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error("[status] monitor tick failed:", error instanceof Error ? error.message : error);
      });
    const result = await runDueSchedules(startedAt);
    if (result.processed || result.failed) {
      // eslint-disable-next-line no-console
      console.log(`[scheduler] tick: ran ${result.processed}, skipped ${result.skipped}, failed ${result.failed}`);
    }
  } finally {
    running = false;
  }
}

/**
 * Starts the tick loop. Returns a stop function. Intended to be called from a
 * long-running Node entry (src/scripts/worker.ts) — never from a request.
 */
export function startScheduler(intervalMs = 30_000): () => void {
  // eslint-disable-next-line no-console
  console.log(`[scheduler] starting, interval ${intervalMs}ms`);
  // Kick off immediately, then on the interval.
  void tick();
  const handle = setInterval(() => void tick(), intervalMs);
  return () => clearInterval(handle);
}

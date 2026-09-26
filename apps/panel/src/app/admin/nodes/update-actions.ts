"use server";

import { spawn } from "node:child_process";
import { requireAdmin } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity";
import { repoRoot } from "@/lib/version";

export interface UpdateResult {
  ok: boolean;
  message: string;
}

export type UpdateTarget = "panel" | "daemon" | "all";

/** Sub-commands of the global `spanel` CLI that perform the actual update. */
const COMMANDS: Record<UpdateTarget, string[]> = {
  panel: ["update-panel"],
  daemon: ["update-daemon"],
  all: ["update"],
};

/**
 * Best-effort, non-blocking trigger for the global `spanel` updater. The child
 * is spawned fully detached with its IO ignored and then `unref()`ed, so the
 * panel process (which the updater itself may restart) does not own its
 * lifecycle and this request returns immediately. We never wait for or stream
 * its output — the admin watches the version badge or their own shell. A
 * missing binary surfaces as an async `error` event, which we swallow so it can
 * never become an unhandled rejection that crashes the admin request.
 */
export async function runUpdateAction(target: UpdateTarget): Promise<UpdateResult> {
  const admin = await requireAdmin();
  const args = COMMANDS[target] ?? COMMANDS.all;

  try {
    const child = spawn("spanel", args, {
      cwd: repoRoot() ?? process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => undefined);
    child.unref();
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not start the updater." };
  }

  await logActivity({ event: "admin:panel.update", userId: admin.id, properties: { target } });
  return {
    ok: true,
    message: `Update started (spanel ${args.join(" ")}). It runs in the background — refresh in a moment.`,
  };
}

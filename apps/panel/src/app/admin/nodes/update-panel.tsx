"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { runUpdateAction } from "./update-actions";
import type { UpdateStatus } from "@/lib/version";

/**
 * Panel version chip + optional "update available" affordance. Rendered from a
 * server component that has already resolved the (git-based) {@link UpdateStatus}
 * — this component only presents it and wires the "Update now" button to the
 * admin-guarded server action. When the checkout is not a git repo the update
 * UI is hidden entirely and only the version chip shows.
 */
export function PanelVersionBadge({
  status,
  panelVersion,
}: {
  status: UpdateStatus;
  panelVersion: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const trigger = () => {
    startTransition(async () => {
      toast.report(await runUpdateAction("all"));
      // The updater is detached; give it a beat, then re-run the server check.
      setTimeout(() => router.refresh(), 1500);
    });
  };

  return (
    <span className="flex items-center gap-1.5">
      <span
        className="badge border-line bg-surface-2 font-mono text-[11px] text-ink-muted"
        title="Panel version"
      >
        v{panelVersion}
      </span>

      {status.isRepo && status.updateAvailable ? (
        <>
          <Badge tone="warn">
            <ArrowUpCircle className="size-3" />
            Update available{status.behindBy > 0 ? ` · ${status.behindBy} behind` : ""}
          </Badge>
          <Button variant="ghost" onClick={trigger} loading={pending} className="px-2 py-1 text-xs">
            {pending ? (
              "Updating…"
            ) : (
              <>
                <ArrowUpCircle className="size-3" />
                Update now
              </>
            )}
          </Button>
        </>
      ) : status.isRepo ? (
        <Badge tone="ok">Up to date</Badge>
      ) : null}
    </span>
  );
}

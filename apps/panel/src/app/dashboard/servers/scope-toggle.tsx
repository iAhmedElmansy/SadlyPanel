"use client";

import { useRouter } from "next/navigation";
import { Users, User } from "lucide-react";
import { useT } from "@/lib/i18n/preferences";
import { cn } from "@/lib/utils";

/**
 * Admin-only toggle (#8) between the viewer's own servers and everyone else's.
 * Rendered only when the server already confirmed the servers.viewOthers
 * permission, so this is purely presentational — the query re-runs server-side
 * from the ?scope= param.
 */
export function ServerScopeToggle({ showingOthers }: { showingOthers: boolean }) {
  const t = useT();
  const router = useRouter();

  const set = (scope: "mine" | "others") => {
    router.push(scope === "others" ? "/dashboard/servers?scope=others" : "/dashboard/servers");
  };

  return (
    <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5 text-xs">
      <button
        type="button"
        onClick={() => set("mine")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 transition-colors",
          !showingOthers ? "bg-surface-3 text-ink" : "text-ink-dim hover:text-ink",
        )}
      >
        <User className="size-3.5" />
        {t("dashboard.serversScopeMine")}
      </button>
      <button
        type="button"
        onClick={() => set("others")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 transition-colors",
          showingOthers ? "bg-surface-3 text-ink" : "text-ink-dim hover:text-ink",
        )}
      >
        <Users className="size-3.5" />
        {t("dashboard.serversScopeOthers")}
      </button>
    </div>
  );
}

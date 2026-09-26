"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches the current (dynamic) route on an interval so the overview tab
 * reflects real heartbeat data live. No new API route: the pages are
 * `force-dynamic`, so router.refresh() re-runs the server components against
 * the database. The interval only runs while the tab is visible and refreshes
 * immediately on return, so a backgrounded tab costs nothing.
 */
export function LiveRefresh({ intervalMs = 1000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        router.refresh();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}

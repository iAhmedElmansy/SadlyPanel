"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches the current (dynamic) route on an interval so the overview tab
 * reflects real heartbeat data live. No new API route: the pages are
 * `force-dynamic`, so router.refresh() re-runs the server components against
 * the database.
 */
export function LiveRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}

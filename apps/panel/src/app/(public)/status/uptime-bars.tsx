"use client";

import { useT } from "@/lib/i18n/preferences";
import { cn } from "@/lib/utils";
import { gsap, useGsap } from "@/lib/motion/gsap";

/** One day's rollup, as produced by services/status-monitor.buildUptimeSeries. */
export interface UptimeDay {
  day: string;
  state: "up" | "down" | "partial" | "none";
  uptime: number | null;
}

const STATE_CLASS: Record<UptimeDay["state"], string> = {
  up: "bg-ok/80",
  down: "bg-bad/80",
  partial: "bg-warn/80",
  none: "bg-surface-3",
};

/**
 * The signature status-page uptime chart: one slim vertical bar per day (oldest
 * first), green when fully up, red on a full outage, yellow on a partial day,
 * neutral when no samples were recorded. Each bar carries an accessible title.
 */
export function UptimeBars({ days }: { days: UptimeDay[] }) {
  const t = useT();

  const ref = useGsap<HTMLDivElement>(({ root }) => {
    const bars = gsap.utils.toArray<HTMLElement>("[data-bar]", root);
    gsap.set(bars, { transformOrigin: "bottom", scaleY: 0 });
    gsap.to(bars, {
      scaleY: 1,
      ease: "power2.out",
      duration: 0.5,
      stagger: 0.008,
      scrollTrigger: { trigger: root, start: "top 90%" },
    });
  }, []);

  const titleFor = (d: UptimeDay): string => {
    switch (d.state) {
      case "up":
        return t("public.uptimeDayUp", { day: d.day });
      case "down":
        return t("public.uptimeDayDown", { day: d.day });
      case "partial":
        return t("public.uptimeDayPartial", { day: d.day, percent: String(d.uptime ?? 0) });
      default:
        return t("public.uptimeDayNone", { day: d.day });
    }
  };

  return (
    <div ref={ref}>
      <div className="flex items-end gap-[2px]" role="img" aria-label={t("public.components")}>
        {days.map((d) => (
          <span
            key={d.day}
            data-bar
            title={titleFor(d)}
            className={cn("h-8 flex-1 rounded-[2px] transition-colors", STATE_CLASS[d.state])}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-dim">
        <span>{t("public.uptime90Days")}</span>
        <span>{t("public.uptimeToday")}</span>
      </div>
    </div>
  );
}

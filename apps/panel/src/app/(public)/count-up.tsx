"use client";

import { useEffect, useRef, useState } from "react";
import { countValue } from "@/lib/motion/count";
import { useReducedMotion } from "@/lib/motion/use-reduced-motion";

/**
 * Animate a number up to its target the first time it scrolls into view.
 *
 * The initial (and reduced-motion / SSR) render shows the final value so the
 * markup always matches the server and there is never a layout jump — the
 * animation only rewinds to 0 and rolls up after mount when motion is allowed.
 * Formatting is deterministic (Intl currency or fixed decimals) so hydration is
 * stable.
 */
export function CountUp({
  to,
  currency,
  decimals = 0,
  prefix = "",
  suffix = "",
  durationMs = 1100,
  className,
}: {
  to: number;
  currency?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);

  const format = (v: number): string => {
    let body: string;
    if (currency) {
      try {
        body = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
      } catch {
        body = v.toFixed(2);
      }
    } else {
      body = v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
    return `${prefix}${body}${suffix}`;
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    if (typeof IntersectionObserver === "undefined") return;

    let raf = 0;
    let started = false;
    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = (now - start) / durationMs;
        setValue(countValue(0, to, p));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true;
          run();
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, durationMs, reduced]);

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}

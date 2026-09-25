"use client";

import { useEffect, useRef } from "react";

/**
 * First-paint preloader in the studiors vein: a mark, a running 0→100 counter
 * and a scrolling wordmark, then the curtain lifts to reveal the page. It lives
 * in the public layout, so it mounts once per hard load and does NOT replay on
 * client-side navigation between public pages.
 *
 * Progressive enhancement is layered two ways:
 *  - No JS: a pure-CSS fallback (`preloader-fallback` keyframe) still lifts the
 *    curtain after a short delay, so content is never trapped behind it.
 *  - JS on: we tag `.is-js` (which cancels that fallback) and orchestrate the
 *    counter + lift ourselves. Under reduced motion the layout CSS hides it.
 */
export function Preloader({ label }: { label: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const count = countRef.current;
    if (!root || !count) return;

    // Under reduced motion the layout CSS already hides the curtain
    // (`.preloader { display: none }`), so there is nothing to drive here.
    // We must NOT imperatively `root.remove()` it: tearing a React-managed
    // node out of app-shell mid-hydration makes React's later insertBefore
    // calls (for the streamed <main>) target a node that is no longer a
    // child, throwing NotFoundError and blanking the whole page.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Take over from the CSS fallback and drive the sequence ourselves.
    root.classList.add("is-js");
    count.textContent = "0";

    const start = performance.now();
    const DURATION = 1600;
    let raf = 0;
    let holdTimer = 0;
    let safetyTimer = 0;
    let lifted = false;

    const lift = () => {
      if (lifted) return;
      lifted = true;
      // Guarantee the final frame reads exactly 100% before the curtain moves.
      count.textContent = "100";
      root.classList.add("is-lift");
      const remove = () => root.remove();
      root.addEventListener("transitionend", remove, { once: true });
      // Safety net in case the transition event is missed.
      safetyTimer = window.setTimeout(remove, 1400);
    };

    const tick = (now: number) => {
      // Clamp progress to [0,1] so the counter can never render a negative or
      // above-100 value on an early/late frame.
      const p = Math.min(1, Math.max(0, (now - start) / DURATION));
      // Ease-out so the number decelerates into 100.
      const eased = 1 - Math.pow(1 - p, 3);
      const value = Math.min(100, Math.max(0, Math.round(eased * 100)));
      count.textContent = String(value);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        // Hold visibly at 100% for a beat, then lift — so the curtain never
        // disappears before the counter has actually reached 100.
        count.textContent = "100";
        holdTimer = window.setTimeout(lift, 500);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(holdTimer);
      window.clearTimeout(safetyTimer);
    };
  }, []);

  return (
    <div ref={rootRef} className="preloader" aria-hidden>
      <div className="preloader__marquee">
        <div className="preloader__track">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i}>
              {label} <em>·</em> {new Date().getFullYear()} <em>·</em>{" "}
            </span>
          ))}
        </div>
      </div>
      <div className="preloader__counter" dir="ltr">
        <span ref={countRef}>0</span>
        <em>%</em>
      </div>
      <div className="preloader__curtain" />
    </div>
  );
}

"use client";

import { gsap, useGsap } from "@/lib/motion/gsap";

/**
 * Pricing motif — an ascending ladder of bars whose heights continuously ripple
 * upward, a literal read of "pricing that scales with you". Its motion vocabulary
 * is unique on the page: a traveling *height* wave across discrete bars, distinct
 * from the horizontal width-breathing meters in Game servers, the pointer-only
 * spotlight on this same card, and every other section.
 *
 * Progressive enhancement: the bars render at their base (already-ascending)
 * heights from markup alone, so with JS off or reduced motion the ladder still
 * reads as a growth chart. GSAP only animates the ripple from that steady state.
 */
export function ScaleBars() {
  const ref = useGsap<HTMLDivElement>(({ root }) => {
    const bars = gsap.utils.toArray<HTMLElement>("[data-bar]", root);
    if (!bars.length) return;
    // A wave of extra height sweeps left→right and loops — each bar lifts a touch
    // above its base then settles, staggered so the crest travels the ladder.
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.4 });
    bars.forEach((bar, i) => {
      const base = 28 + i * 11; // ascending baseline (%), matches the inline style
      const crest = Math.min(base + 22, 100);
      tl.to(
        bar,
        { height: `${crest}%`, duration: 0.42, ease: "sine.out" },
        i * 0.11,
      ).to(bar, { height: `${base}%`, duration: 0.6, ease: "sine.inOut" }, i * 0.11 + 0.42);
    });
  }, []);

  return (
    <div ref={ref} aria-hidden className="flex h-16 items-end gap-1.5">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          data-bar
          className="w-2.5 flex-1 rounded-t-sm"
          style={{
            height: `${28 + i * 11}%`,
            background: "linear-gradient(180deg, var(--color-brand), var(--color-brand-dim))",
            opacity: 0.55 + i * 0.06,
          }}
        />
      ))}
    </div>
  );
}

"use client";

import { type ReactNode } from "react";
import { gsap, useGsap } from "@/lib/motion/gsap";

/**
 * Final CTA — a **push-from-depth portal**. The whole card flies up a
 * perspective tunnel from far back toward the reader (translateZ −900 → 0,
 * scrubbed), and because it rides a shared preserve-3d stage its heading and
 * its actions are nested at their own depths, so the card assembles in real 3D
 * space as it arrives rather than simply fading in. A last, distinct 3D
 * vocabulary after the conveyor / turning device / flip-up platform above.
 *
 * Progressive enhancement: the depth state is set by JS only, so no-JS shows
 * the card in place; the effect no-ops under reduced motion (the stage collapses
 * to a flat projection and preserve-3d is dropped in CSS).
 */
export function DepthPortal({ children }: { children: ReactNode }) {
  const ref = useGsap<HTMLDivElement>(({ root }) => {
    const card = root.querySelector<HTMLElement>("[data-portal-card]");
    const items = gsap.utils.toArray<HTMLElement>("[data-portal-item]", root);
    if (!card) return;

    const st = { trigger: root, start: "top 90%", end: "top 46%", scrub: 0.7 } as const;

    // Heading rides a little forward, the actions further still, so they stand
    // at their own depths above the card face as it arrives.
    if (items.length) gsap.set(items, { z: (i: number) => (i === 0 ? 36 : 80) });

    gsap.fromTo(
      card,
      { autoAlpha: 0, z: -900, rotateX: 14, transformOrigin: "50% 50%" },
      { autoAlpha: 1, z: 0, rotateX: 0, ease: "none", scrollTrigger: st },
    );

    if (items.length) {
      gsap.fromTo(
        items,
        { autoAlpha: 0 },
        { autoAlpha: 1, ease: "none", stagger: 0.16, scrollTrigger: { ...st, start: "top 78%" } },
      );
    }
  }, []);

  return (
    <div ref={ref} className="stage-3d">
      {children}
    </div>
  );
}

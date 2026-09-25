"use client";

import { type ReactNode } from "react";
import { gsap, useGsap } from "@/lib/motion/gsap";

/**
 * Pricing teaser — a **flip-up platform**. The pricing card starts lying tilted
 * back on its bottom edge and stands up to face the reader as the section is
 * scrubbed into view (rotateX → 0 about a bottom origin), while the price + CTA
 * column rides forward on a growing translateZ so it floats above the card
 * surface in shared 3D space. The card keeps its pointer-follow spotlight
 * (SpotlightCard) on top, so the section reads distinctly from the depth
 * conveyor, the turning device and the push-from-depth portal around it.
 *
 * Progressive enhancement: the tilted/floating states are set by JS only, so
 * no-JS shows the card flat and readable; the effect no-ops under reduced
 * motion (the stage collapses to a flat projection and preserve-3d is dropped).
 */
export function PricingStage({ children }: { children: ReactNode }) {
  const ref = useGsap<HTMLDivElement>(({ root }) => {
    const card = root.querySelector<HTMLElement>(".spotlight-card");
    const float = root.querySelector<HTMLElement>("[data-float]");
    if (!card) return;

    const st = { trigger: root, start: "top 84%", end: "top 40%", scrub: 0.7 } as const;

    // The whole card stands up from lying back on its bottom edge.
    gsap.fromTo(
      card,
      { rotateX: 32, transformOrigin: "50% 100%" },
      { rotateX: 0, ease: "none", scrollTrigger: st },
    );

    // The price + CTA column rides forward, floating above the card face.
    if (float) {
      gsap.fromTo(float, { z: -50 }, { z: 76, ease: "none", scrollTrigger: st });
    }
  }, []);

  return (
    <div ref={ref} className="stage-3d">
      {children}
    </div>
  );
}

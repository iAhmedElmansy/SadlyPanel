"use client";

import { useEffect } from "react";
import { ensureGsap, gsap, isRtl, ScrollTrigger } from "@/lib/motion/gsap";

/**
 * Site-wide section reveal — but every section arrives DIFFERENTLY. Each
 * `<section>` opts into a named 3D entrance via `data-reveal`:
 *
 *   rise  — lifts straight up out of the page
 *   hinge — hinges up from its lower edge (a page turning up)
 *   door  — swings in on the Y axis from its leading edge (RTL-aware)
 *   zoom  — scales up out of depth with a slight top-back tilt
 *   fold  — folds down from its upper edge
 *
 * Sections with `[data-reveal-item]` children then stagger those in after the
 * container lands. A section can bow out entirely with `data-no-reveal` (used
 * by the game-servers section, which runs its own pinned choreography).
 *
 * Progressive enhancement: initial hidden state is set by JS only, so no-JS
 * keeps every section visible, and the whole effect no-ops under reduced motion.
 * Sections already in view on load are left untouched — no above-the-fold flash.
 */
type Variant = "rise" | "hinge" | "door" | "zoom" | "fold";

const FROM: Record<Variant, Record<string, number | string>> = {
  rise: { autoAlpha: 0, y: 72 },
  hinge: { autoAlpha: 0, y: 64, rotateX: 8, transformOrigin: "50% 100%", transformPerspective: 1200 },
  door: { autoAlpha: 0, x: 44, rotateY: 14, transformOrigin: "0% 50%", transformPerspective: 1200 },
  zoom: { autoAlpha: 0, scale: 0.9, rotateX: 7, transformOrigin: "50% 50%", transformPerspective: 1200 },
  fold: { autoAlpha: 0, y: -46, rotateX: -11, transformOrigin: "50% 0%", transformPerspective: 1200 },
};

/**
 * Inner `[data-reveal-item]` children arrive with a 3D motion that MATCHES the
 * section's own variant, so each part of the page moves in its own vocabulary:
 * fold-sections drop their items from the top edge, zoom-sections pop them out
 * of depth, rise-sections tilt them up from the floor, doors swing them on Y.
 */
const ITEM_FROM: Record<Variant, Record<string, number | string>> = {
  rise: { autoAlpha: 0, y: 64, rotateX: -38, transformOrigin: "50% 100%", transformPerspective: 1000 },
  hinge: { autoAlpha: 0, y: 40, scale: 0.965, transformPerspective: 1000 },
  door: { autoAlpha: 0, x: 40, rotateY: 46, transformOrigin: "0% 50%", transformPerspective: 1000 },
  zoom: { autoAlpha: 0, z: -320, scale: 0.82, rotateX: 24, transformOrigin: "50% 50%", transformPerspective: 1000 },
  fold: { autoAlpha: 0, y: -44, rotateX: 62, transformOrigin: "50% 0%", transformPerspective: 1000 },
};

export function SectionReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ensureGsap();

    const ctx = gsap.context(() => {
      const sections = gsap.utils.toArray<HTMLElement>("main section");
      const vh = window.innerHeight;

      sections.forEach((section) => {
        // The game-servers section pins & reveals its own cards — leave it be.
        if (section.hasAttribute("data-no-reveal")) return;
        // Anything already on screen stays as-is — reveal only what's below.
        if (section.getBoundingClientRect().top < vh * 0.85) return;

        const variant = ((section.getAttribute("data-reveal") as Variant) || "hinge") as Variant;
        const from = { ...FROM[variant] };
        // Door swings from whichever edge leads in the current writing direction.
        if (variant === "door" && isRtl()) {
          from.x = -(from.x as number);
          from.rotateY = -(from.rotateY as number);
          from.transformOrigin = "100% 50%";
        }

        const items = gsap.utils.toArray<HTMLElement>("[data-reveal-item]", section);
        const tl = gsap.timeline({
          scrollTrigger: { trigger: section, start: "top 82%", once: true },
        });

        tl.from(section, { ...from, duration: 0.8, ease: "power3.out" });

        if (items.length) {
          const itemFrom = { ...ITEM_FROM[variant] };
          // Doors swing their items from the same leading edge as the section.
          if (variant === "door" && isRtl()) {
            itemFrom.x = -(itemFrom.x as number);
            itemFrom.rotateY = -(itemFrom.rotateY as number);
            itemFrom.transformOrigin = "100% 50%";
          }
          tl.from(
            items,
            { ...itemFrom, duration: 0.62, stagger: 0.14, ease: "power3.out" },
            "-=0.45",
          );
        }
      });
    });

    // A late refresh catches fonts/images that shift layout after mount.
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 220);
    return () => {
      window.clearTimeout(id);
      ctx.revert();
    };
  }, []);

  return null;
}

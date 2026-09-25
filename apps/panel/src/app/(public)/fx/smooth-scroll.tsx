"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { ensureGsap, gsap, ScrollTrigger } from "@/lib/motion/gsap";
import { setLenis } from "./lenis-store";

/**
 * Site-wide inertial (smooth) scrolling for the public pages, à la studiors.be.
 * Lenis drives the scroll and we forward its RAF loop to GSAP's ticker so
 * ScrollTrigger stays perfectly in sync (pinning, scrubs, reveals all read the
 * smoothed position). Renders nothing.
 *
 * Progressive enhancement: no-ops entirely under reduced motion and on coarse
 * pointers / small viewports where inertial scroll feels wrong — the browser's
 * native scroll is left untouched, so the page always scrolls.
 */
export function SmoothScroll() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(max-width: 640px)");
    if (mq.matches || coarse.matches) return;

    ensureGsap();

    const lenis = new Lenis({
      duration: 1.4,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.4,
    });

    lenis.on("scroll", ScrollTrigger.update);

    const ticker = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(ticker);
    gsap.ticker.lagSmoothing(0);

    // Expose the instance so the 3D scrollbar can drive smooth scroll on drag.
    setLenis(lenis);

    // Anchor links (e.g. nav → #section) should ride the smooth scroll too.
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement)?.closest?.('a[href^="#"]');
      const hash = link?.getAttribute("href");
      if (!hash || hash === "#") return;
      const target = document.querySelector(hash);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -80 });
    };
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      gsap.ticker.remove(ticker);
      gsap.ticker.lagSmoothing(500, 33);
      setLenis(null);
      lenis.destroy();
    };
  }, []);

  return null;
}

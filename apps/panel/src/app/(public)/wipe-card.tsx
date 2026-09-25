"use client";

import { type ReactNode } from "react";
import { gsap, useGsap } from "@/lib/motion/gsap";
import { cn } from "@/lib/utils";

/**
 * Web-hosting feature card with a distinct rhythm from the game grid: it wipes
 * in via a `clip-path` reveal (bottom → top) when scrolled into view, staggered
 * by its position. Reduced motion: renders fully visible with no wipe.
 */
export function WipeCard({
  children,
  className,
  index = 0,
}: {
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  const ref = useGsap<HTMLDivElement>(({ root }) => {
    gsap.set(root, { clipPath: "inset(0% 0% 100% 0%)", opacity: 0, y: 10 });
    gsap.to(root, {
      clipPath: "inset(0% 0% 0% 0%)",
      opacity: 1,
      y: 0,
      duration: 0.7,
      delay: index * 0.12,
      ease: "power3.out",
      // Reveal once and stay revealed — never reverse the clip on scroll-up, so
      // the card can never be left permanently clipped/invisible.
      scrollTrigger: { trigger: root, start: "top 88%", once: true },
    });
  }, [index]);

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}

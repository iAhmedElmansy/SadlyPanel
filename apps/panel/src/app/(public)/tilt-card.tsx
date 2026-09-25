"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Pointer-reactive tilt card. The surface tips toward the cursor in 3D and a
 * faint platinum specular sheen tracks the pointer, giving the game-server
 * features a tactile, "hardware" feel. Disabled on coarse pointers (touch) and
 * under reduced motion, where it renders as a plain static card.
 */
export function TiltCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rx = (0.5 - py) * 8;
        const ry = (px - 0.5) * 8;
        el.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg)`;
        el.style.setProperty("--mx", `${px * 100}%`);
        el.style.setProperty("--my", `${py * 100}%`);
        el.style.setProperty("--sheen", "1");
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.style.transform = "perspective(700px) rotateX(0deg) rotateY(0deg)";
      el.style.setProperty("--sheen", "0");
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={cn("tilt-card", className)} style={{ transformStyle: "preserve-3d" }}>
      {children}
      <span aria-hidden className="tilt-sheen" />
    </div>
  );
}

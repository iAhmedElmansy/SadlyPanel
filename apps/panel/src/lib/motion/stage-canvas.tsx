"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { useDeviceTier } from "./use-device-tier";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * Lazy, self-managing R3F stage. Renders the cheap `fallback` on the server and
 * on lite-tier devices, and only mounts a real WebGL `<Canvas>` once we've
 * confirmed (client-side) the device can handle it.
 *
 * - Runs the render loop only while the stage is on-screen and the tab is
 *   visible (IntersectionObserver + visibilitychange) to save the battery.
 * - Under reduced motion it renders a single static frame (`frameloop="demand"`)
 *   instead of animating.
 * - Alpha canvas, DPR clamped to 2, high-performance context. The container is
 *   `aria-hidden` + `pointer-events-none`; it never affects layout.
 */
export function StageCanvas({
  children,
  fallback = null,
  className,
  dpr = [1, 2],
}: {
  children: ReactNode;
  fallback?: ReactNode;
  className?: string;
  dpr?: [number, number];
}) {
  const tier = useDeviceTier();
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [mounted]);

  const useWebgl = mounted && tier === "full";
  const active = visible && tabVisible;
  const frameloop: "always" | "demand" | "never" = reduced
    ? "demand"
    : active
      ? "always"
      : "never";

  return (
    <div ref={wrapRef} aria-hidden className={className}>
      {useWebgl ? (
        <Canvas
          frameloop={frameloop}
          dpr={dpr}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          {children}
        </Canvas>
      ) : (
        fallback
      )}
    </div>
  );
}

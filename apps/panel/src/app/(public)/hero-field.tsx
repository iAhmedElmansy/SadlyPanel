"use client";

import dynamic from "next/dynamic";
import { useDeviceTier } from "@/lib/motion/use-device-tier";

/**
 * Hero backdrop gate. Keeps three.js / R3F out of the initial bundle: the heavy
 * WebGL scene is dynamically imported (client-only) and only mounted on
 * full-tier devices. Everything else — SSR, mobile, low-power, no-WebGL — gets
 * the lightweight CSS haze and never downloads the 3D code.
 */
const HeroFieldScene = dynamic(() => import("./hero-field-scene").then((m) => m.HeroFieldScene), {
  ssr: false,
});

function Haze() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      style={{
        background:
          "radial-gradient(38rem 22rem at 72% 20%, color-mix(in srgb, var(--color-brand) 12%, transparent), transparent 62%)",
      }}
    />
  );
}

export function HeroField() {
  const tier = useDeviceTier();
  if (tier !== "full") return <Haze />;
  return <HeroFieldScene />;
}

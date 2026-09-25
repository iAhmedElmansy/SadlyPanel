"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { useDeviceTier } from "@/lib/motion/use-device-tier";

/**
 * Gate for the immersive site-wide WebGL world. Dynamically imports the heavy
 * three.js / R3F scene (client-only) and only mounts it on full-tier devices;
 * everything else gets a lightweight CSS haze so the page never downloads the
 * 3D bundle on mobile / low-power / SSR.
 */
const SiteWorld = dynamic(() => import("./site-world").then((m) => m.SiteWorld), {
  ssr: false,
});

function Haze() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      style={{
        background:
          "radial-gradient(46rem 30rem at 72% 12%, color-mix(in srgb, var(--color-brand) 10%, transparent), transparent 64%)",
      }}
    />
  );
}

/**
 * A decorative background must never take the page down. If the WebGL scene
 * throws — lost context, a texture that failed to load, an unsupported driver —
 * fall back to the cheap CSS haze instead of crashing the whole React tree.
 */
class WorldBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Haze /> : this.props.children;
  }
}

export function SiteField() {
  const tier = useDeviceTier();
  if (tier !== "full") return <Haze />;
  return (
    <WorldBoundary>
      <SiteWorld />
    </WorldBoundary>
  );
}

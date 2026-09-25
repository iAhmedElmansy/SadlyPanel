"use client";

import { useEffect, useState } from "react";

export type DeviceTier = "full" | "lite";

/**
 * Classify the device into `"full"` (run WebGL/GLSL) or `"lite"` (cheap CSS/2D
 * fallback). Decided from coarse-pointer, core count, DPR, viewport width and a
 * one-shot WebGL-availability probe.
 *
 * SSR-safe: returns `"lite"` until mounted so the server render is always the
 * cheap path and heavy canvases only mount after we know the device can cope.
 */
export function useDeviceTier(): DeviceTier {
  const [tier, setTier] = useState<DeviceTier>("lite");

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const cores = navigator.hardwareConcurrency ?? 4;
    const narrow = window.innerWidth < 768;
    const dpr = window.devicePixelRatio || 1;

    let webgl = false;
    try {
      const canvas = document.createElement("canvas");
      webgl = !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
      webgl = false;
    }

    // A phone-class device (coarse pointer + narrow) or a low-core / no-WebGL
    // machine gets the lite path; very high DPR on few cores also degrades.
    const weak = coarse && narrow;
    const underpowered = cores <= 4 && dpr > 2;
    setTier(webgl && !weak && !underpowered ? "full" : "lite");
  }, []);

  return tier;
}

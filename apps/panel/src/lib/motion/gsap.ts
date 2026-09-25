"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;
/** Register GSAP plugins exactly once, on the client only. */
export function ensureGsap() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

export { gsap, ScrollTrigger };

/** True when the document is laid out right-to-left. */
export function isRtl(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dir === "rtl";
}

type GsapSetup = (ctx: { root: HTMLElement; rtl: boolean; self: gsap.Context }) => void;

/**
 * Run `setup` inside a `gsap.context()` scoped to a container ref. The context
 * is reverted on unmount (killing tweens + ScrollTriggers it created), so
 * effects never leak. No-ops entirely under reduced motion — callers should
 * ensure their static markup already reads correctly.
 *
 * Returns the ref to attach to the scoping element.
 */
export function useGsap<T extends HTMLElement = HTMLDivElement>(
  setup: GsapSetup,
  deps: React.DependencyList,
  enabled = true,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ensureGsap();

    const rtl = isRtl();
    const ctx = gsap.context((self) => setup({ root, rtl, self }), root);
    // A late refresh catches fonts/images that shift layout after mount.
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 200);
    return () => {
      window.clearTimeout(id);
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

"use client";

import { useEffect, useState } from "react";

/**
 * Reactive `prefers-reduced-motion` hook. Single source of truth for every
 * effect. Defaults to `true` (motion off) until mounted so the server render
 * and first paint never start an animation the user may have disabled.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}

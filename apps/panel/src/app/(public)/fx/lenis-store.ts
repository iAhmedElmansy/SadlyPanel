import type Lenis from "lenis";

/**
 * Tiny shared handle to the active Lenis instance. SmoothScroll registers it on
 * mount and clears it on unmount; the 3D scrollbar reads it to drive the smooth
 * scroll on drag/track-click, falling back to native scroll when Lenis is off
 * (reduced motion, coarse pointers). Module-scoped so no window pollution.
 */
let current: Lenis | null = null;

export function setLenis(instance: Lenis | null): void {
  current = instance;
}

export function getLenis(): Lenis | null {
  return current;
}

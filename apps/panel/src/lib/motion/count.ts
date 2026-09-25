/**
 * Pure helpers for count-up animations. Kept framework-free so they can be
 * unit-tested and reused by any effect that animates a number into view.
 */

/** Standard ease-out cubic. `t` clamped to 0..1. */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/**
 * Interpolate from `from` to `to` at eased progress `p` (0..1). At p=0 returns
 * `from`, at p>=1 returns exactly `to` (no floating-point drift at the end).
 */
export function countValue(from: number, to: number, p: number): number {
  if (p >= 1) return to;
  return from + (to - from) * easeOutCubic(p);
}

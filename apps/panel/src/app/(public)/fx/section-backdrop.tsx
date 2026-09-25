import type { CSSProperties } from "react";

/**
 * Decorative per-section backdrop. Each section gets its OWN pattern (a grid,
 * a dot field, diagonal beams, or paired glows) tinted by its accent hue, so
 * every part of the page reads as its own space. Purely presentational
 * (aria-hidden) and built from CSS gradients only — no JS, no images — so it
 * costs nothing to render and needs no translation. The `.sbg--*` rules live
 * in globals.css and consume `--section-accent`, set here per instance.
 */
export function SectionBackdrop({
  variant,
  accent,
}: {
  variant: "grid" | "dots" | "beams" | "glow";
  accent: string;
}) {
  return (
    <div
      aria-hidden
      className={`sbg sbg--${variant}`}
      style={{ ["--section-accent"]: accent } as CSSProperties}
    />
  );
}

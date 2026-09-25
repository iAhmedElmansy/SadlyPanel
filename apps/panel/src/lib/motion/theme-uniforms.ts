"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { cssVarToRgb } from "./css-color";

export type ThemeColors = {
  /** Foreground / platinum. */
  ink: THREE.Color;
  /** Background / obsidian. */
  canvas: THREE.Color;
  /** Muted mid grey. */
  muted: THREE.Color;
};

/**
 * Returns stable `THREE.Color` objects tracking the live theme tokens. The
 * objects are mutated in place (never replaced) so shader uniforms holding a
 * reference stay valid, and are re-read whenever `<html data-theme>` flips.
 *
 * Safe to call inside the R3F tree — it only touches DOM computed styles.
 */
export function useThemeColors(): ThemeColors {
  const colors = useMemo<ThemeColors>(
    () => ({ ink: new THREE.Color(), canvas: new THREE.Color(), muted: new THREE.Color() }),
    [],
  );

  useEffect(() => {
    const read = () => {
      const [ir, ig, ib] = cssVarToRgb("--color-ink");
      const [cr, cg, cb] = cssVarToRgb("--color-canvas");
      const [mr, mg, mb] = cssVarToRgb("--color-ink-dim");
      colors.ink.setRGB(ir, ig, ib);
      colors.canvas.setRGB(cr, cg, cb);
      colors.muted.setRGB(mr, mg, mb);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [colors]);

  return colors;
}

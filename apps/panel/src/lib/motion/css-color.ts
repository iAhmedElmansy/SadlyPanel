/**
 * Read a CSS custom property (e.g. `--color-ink`) and parse it to a normalised
 * RGB triple in the 0..1 range for feeding into WebGL/GLSL uniforms.
 *
 * Works with hex (`#rgb`, `#rrggbb`) and `rgb()/rgba()` values — the two forms
 * our theme tokens resolve to. Falls back to a neutral grey if parsing fails so
 * a shader never receives NaN. Pure aside from reading computed styles.
 */
export type Rgb = [number, number, number];

const FALLBACK: Rgb = [0.5, 0.5, 0.5];

/** Parse any CSS color string we emit (hex or rgb/rgba) to 0..1 RGB. */
export function parseCssColor(value: string): Rgb {
  const v = value.trim();
  if (!v) return FALLBACK;

  if (v.startsWith("#")) {
    let hex = v.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    if (hex.length !== 6) return FALLBACK;
    const int = Number.parseInt(hex, 16);
    if (Number.isNaN(int)) return FALLBACK;
    return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
  }

  const match = v.match(/rgba?\(([^)]+)\)/i);
  if (match) {
    const parts = match[1].split(/[,/\s]+/).filter(Boolean).slice(0, 3);
    if (parts.length === 3) {
      const nums = parts.map((p) => {
        const n = p.endsWith("%") ? (Number.parseFloat(p) / 100) * 255 : Number.parseFloat(p);
        return Number.isNaN(n) ? 128 : n;
      });
      return [nums[0] / 255, nums[1] / 255, nums[2] / 255];
    }
  }

  return FALLBACK;
}

/**
 * Resolve a CSS variable on an element (defaults to <html> so it picks up the
 * active `data-theme`) and parse it to 0..1 RGB. Returns the fallback grey when
 * called on the server or when the variable is unset.
 */
export function cssVarToRgb(name: string, el?: Element | null): Rgb {
  if (typeof window === "undefined") return FALLBACK;
  const target = el ?? document.documentElement;
  const raw = getComputedStyle(target).getPropertyValue(name);
  return parseCssColor(raw);
}

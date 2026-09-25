/* eslint-disable no-console */
/**
 * Unit checks for the pure motion helpers (no DOM needed).
 * Usage (from apps/panel):  tsx scripts/motion-test.ts
 */

import { parseCssColor } from "../src/lib/motion/css-color";
import { easeOutCubic, countValue } from "../src/lib/motion/count";

let failures = 0;
let total = 0;

function check(name: string, ok: boolean, detail = ""): void {
  total += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const rgbApprox = (a: number[], b: number[]) => a.every((v, i) => approx(v, b[i], 1e-3));

// parseCssColor -----------------------------------------------------------
check("hex #fff → white", rgbApprox(parseCssColor("#fff"), [1, 1, 1]));
check("hex #000000 → black", rgbApprox(parseCssColor("#000000"), [0, 0, 0]));
check("hex #f5f5f3 parses", rgbApprox(parseCssColor("#f5f5f3"), [245 / 255, 245 / 255, 243 / 255]));
check("rgb() parses", rgbApprox(parseCssColor("rgb(255, 128, 0)"), [1, 128 / 255, 0]));
check("rgba() ignores alpha", rgbApprox(parseCssColor("rgba(10, 20, 30, 0.5)"), [10 / 255, 20 / 255, 30 / 255]));
check("garbage → grey fallback", rgbApprox(parseCssColor("not-a-color"), [0.5, 0.5, 0.5]));
check("empty → grey fallback", rgbApprox(parseCssColor(""), [0.5, 0.5, 0.5]));

// easeOutCubic ------------------------------------------------------------
check("ease(0) = 0", approx(easeOutCubic(0), 0));
check("ease(1) = 1", approx(easeOutCubic(1), 1));
check("ease clamps below 0", approx(easeOutCubic(-1), 0));
check("ease clamps above 1", approx(easeOutCubic(2), 1));
check("ease is eased (0.5 > linear)", easeOutCubic(0.5) > 0.5);

// countValue --------------------------------------------------------------
check("count at p=0 → from", approx(countValue(10, 20, 0), 10));
check("count at p>=1 → exact to", approx(countValue(10, 20, 1), 20));
check("count past 1 → exact to (no drift)", approx(countValue(0, 9.99, 1.4), 9.99));
check("count midway between", countValue(0, 100, 0.5) > 50);

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);

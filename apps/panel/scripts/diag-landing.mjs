import puppeteer from "puppeteer-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = process.env.URL || "http://localhost:3110/";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-gl=angle", "--ignore-gpu-blocklist"],
  defaultViewport: { width: 1440, height: 1600, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
const errors = [];
const consoles = [];
page.on("console", (m) => consoles.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("requestfailed", (r) => errors.push(`REQFAIL: ${r.url()} ${r.failure()?.errorText}`));

await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

const probe = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const canvas = q("canvas");
  const tilt = q(".tilt-card");
  const beam = q("[data-beam]");
  const spotlight = q(".spotlight-card");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let webgl = false;
  try {
    const c = document.createElement("canvas");
    webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {}
  return {
    hasCanvas: !!canvas,
    canvasSize: canvas ? `${canvas.width}x${canvas.height}` : null,
    tiltCards: document.querySelectorAll(".tilt-card").length,
    beam: !!beam,
    spotlight: !!spotlight,
    reducedMotion,
    webgl,
    cores: navigator.hardwareConcurrency,
    dpr: window.devicePixelRatio,
    coarse: window.matchMedia("(pointer: coarse)").matches,
    innerWidth: window.innerWidth,
  };
});

console.log("=== PROBE ===");
console.log(JSON.stringify(probe, null, 2));
console.log("=== PAGE ERRORS ===");
console.log(errors.length ? errors.join("\n") : "(none)");
console.log("=== CONSOLE (last 20) ===");
console.log(consoles.slice(-20).join("\n") || "(none)");

await page.screenshot({ path: "scripts/diag-landing.png", fullPage: true });
console.log("screenshot -> scripts/diag-landing.png");

await browser.close();

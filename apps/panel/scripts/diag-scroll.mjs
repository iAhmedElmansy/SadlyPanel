import puppeteer from "puppeteer-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = process.env.URL || "http://localhost:3110/";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-gl=angle", "--ignore-gpu-blocklist"],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });

// Scroll through the whole page slowly so every ScrollTrigger / IntersectionObserver fires.
await page.evaluate(async () => {
  const h = document.body.scrollHeight;
  const step = window.innerHeight * 0.5;
  for (let y = 0; y <= h; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 180));
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 400));
});

// Now measure computed opacity of the animated islands after they've been scrolled into view.
const report = await page.evaluate(() => {
  const rows = [];
  const check = (label, els) => {
    els.forEach((el, i) => {
      const cs = getComputedStyle(el);
      rows.push({
        label: `${label}[${i}]`,
        opacity: cs.opacity,
        clip: cs.clipPath,
        visible: cs.opacity !== "0" && cs.visibility !== "hidden",
        text: (el.textContent || "").trim().slice(0, 40),
      });
    });
  };
  check("reveal", [...document.querySelectorAll(".reveal")]);
  check("tilt", [...document.querySelectorAll(".tilt-card")]);
  check("spotlight", [...document.querySelectorAll(".spotlight-card")]);
  return rows;
});

console.log("=== ANIMATED ELEMENT VISIBILITY (after full scroll) ===");
const hidden = report.filter((r) => !r.visible);
console.log(`total tracked: ${report.length}, hidden: ${hidden.length}`);
report.forEach((r) =>
  console.log(`${r.visible ? "OK " : "!! "} ${r.label} op=${r.opacity} clip=${r.clip} "${r.text}"`),
);

await page.evaluate(() => window.scrollTo(0, 0));
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: "scripts/diag-scrolled.png", fullPage: true });
console.log("screenshot -> scripts/diag-scrolled.png");

await browser.close();

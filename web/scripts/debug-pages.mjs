// Walk through every route + a scrolled landing view, capture screenshots
// and console output to /tmp/debug-shots/.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = "/tmp/debug-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

const pages = [
  { name: "01-landing-top", path: "/", scrollY: 0 },
  { name: "02-landing-scroll-1", path: "/", scrollY: 800 },
  { name: "03-landing-scroll-2", path: "/", scrollY: 1800 },
  { name: "04-landing-scroll-3", path: "/", scrollY: 3500 },
  { name: "05-explore", path: "/explore" },
  { name: "06-explore-crypto", path: "/explore?w=crypto" },
  { name: "07-race", path: "/race" },
  { name: "08-gallery", path: "/gallery" },
];

const report = [];
for (const target of pages) {
  const page = await ctx.newPage();
  const consoleMsgs = [];
  const errors = [];
  const failed = [];
  page.on("console", (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${e.name}: ${e.message}`));
  page.on("requestfailed", (r) =>
    failed.push(`${r.url()} -> ${r.failure()?.errorText}`)
  );

  const url = `${BASE}${target.path}`;
  console.log(`>>> ${target.name}: ${url}`);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    if (target.scrollY) {
      await page.evaluate((y) => window.scrollTo(0, y), target.scrollY);
      await page.waitForTimeout(800);
    } else {
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: `${OUT}/${target.name}.png` });
  } catch (e) {
    errors.push(`navigation: ${e.message}`);
  }

  const focal = await page
    .evaluate(() => document.querySelector(".focal-word")?.textContent ?? null)
    .catch(() => null);
  const heading = await page
    .evaluate(() => document.querySelector("h1")?.textContent ?? null)
    .catch(() => null);

  report.push({
    name: target.name,
    url,
    heading,
    focal,
    errors,
    failed,
    consoleTail: consoleMsgs.slice(-5),
  });
  await page.close();
}

await browser.close();

console.log("\n=== summary ===");
for (const r of report) {
  console.log(
    `${r.name}\n  h1: ${r.heading}\n  focal: ${r.focal}\n  errors: ${r.errors.length}  failed: ${r.failed.length}`
  );
  for (const e of r.errors) console.log(`    ! ${e}`);
  for (const f of r.failed) console.log(`    x ${f}`);
}
writeFileSync(`${OUT}/_report.json`, JSON.stringify(report, null, 2));
console.log(`\nscreenshots: ${OUT}/`);

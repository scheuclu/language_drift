import { chromium } from "playwright";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const FRAMES_DIR = "/tmp/space_frames";
const URL = process.argv[2] ?? "http://localhost:3000/space";

if (existsSync(FRAMES_DIR)) rmSync(FRAMES_DIR, { recursive: true });
mkdirSync(FRAMES_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // give time for space.bin + 19K vec fetches to settle

const slider = page.locator('input[type="range"]');
await slider.waitFor();
const max = parseInt(await slider.getAttribute("max") ?? "12", 10);
console.log(`year slider max=${max}`);

let frame = 0;
async function shoot(label) {
  const path = join(FRAMES_DIR, `f${String(frame).padStart(3, "0")}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`frame ${frame} ${label} -> ${path}`);
  frame++;
}

// initial frame at year 0
await slider.evaluate((el, v) => {
  const input = /** @type {HTMLInputElement} */ (el);
  input.value = String(v);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, 0);
await page.waitForTimeout(400);
await shoot("yi=0 start");

// step through years, capture 2 frames per transition (mid + settle)
for (let yi = 1; yi <= max; yi++) {
  await slider.evaluate((el, v) => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.value = String(v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, yi);
  await page.waitForTimeout(350); // mid-tween
  await shoot(`yi=${yi} mid`);
  await page.waitForTimeout(400); // settled
  await shoot(`yi=${yi} settled`);
}

// loop back to first year for a clean cycle
await slider.evaluate((el, v) => {
  const input = /** @type {HTMLInputElement} */ (el);
  input.value = String(v);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, 0);
await page.waitForTimeout(400);
await shoot("yi=0 loop");

console.log(`captured ${frame} frames to ${FRAMES_DIR}`);
await browser.close();

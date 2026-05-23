// Drives a headless Chromium against the local dev server and dumps
// console messages, network failures, and a screenshot to help diagnose
// the "nothing loads" report.
import { chromium } from "playwright";

const TARGET = process.argv[2] ?? "http://localhost:3000/";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleMsgs = [];
page.on("console", (msg) => {
  consoleMsgs.push({ type: msg.type(), text: msg.text() });
});

const pageerrors = [];
page.on("pageerror", (err) => {
  pageerrors.push({ name: err.name, message: err.message, stack: err.stack });
});

const failed = [];
page.on("requestfailed", (req) => {
  failed.push({ url: req.url(), failure: req.failure()?.errorText });
});

const slowRequests = [];
page.on("response", (resp) => {
  if (resp.status() >= 400) {
    slowRequests.push({ url: resp.url(), status: resp.status() });
  }
});

console.log(`navigating to ${TARGET}…`);
await page.goto(TARGET, { waitUntil: "networkidle", timeout: 30000 }).catch((e) => {
  console.log(`goto threw: ${e.message}`);
});

await page.waitForTimeout(1500);

const title = await page.title();
const bodyHtml = await page.evaluate(() => document.body.innerText.slice(0, 800));
const constellationVisible = await page.evaluate(() => {
  const focal = document.querySelector(".focal-word");
  return focal ? focal.textContent : null;
});

await page.screenshot({ path: "/tmp/debug-page.png", fullPage: false });

console.log(`title: ${title}`);
console.log(`focal-word text: ${constellationVisible}`);
console.log(`\n=== body text (first 800 chars) ===\n${bodyHtml}`);
console.log(`\n=== console messages (${consoleMsgs.length}) ===`);
for (const m of consoleMsgs) console.log(`[${m.type}] ${m.text}`);
console.log(`\n=== page errors (${pageerrors.length}) ===`);
for (const e of pageerrors) console.log(`${e.name}: ${e.message}`);
console.log(`\n=== failed requests (${failed.length}) ===`);
for (const r of failed) console.log(`${r.url} -> ${r.failure}`);
console.log(`\n=== 4xx/5xx responses (${slowRequests.length}) ===`);
for (const r of slowRequests) console.log(`${r.status} ${r.url}`);

await browser.close();

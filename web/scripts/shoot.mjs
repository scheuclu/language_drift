import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3000/ternary";
const out = process.argv[3] ?? "/tmp/shot.png";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", (msg) => console.log(`[browser ${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: true });
console.log(`screenshot -> ${out}`);
await browser.close();

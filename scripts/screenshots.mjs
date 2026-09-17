// node scripts/screenshots.mjs --base http://localhost:3101 --out <dir> [--pages /,/train]
// Signs in as the demo user and captures full-page phone screenshots.
import { chromium, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv;
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const base = opt("base", "http://localhost:3101");
const out = path.resolve(opt("out", ".data/screens"));
const pages = opt(
  "pages",
  "/,/checkin,/tonight,/train,/train/progress,/coach,/coach/rules,/train/history,/train/measure,/plan,/plan/goals,/calendar,/journal,/settings,/login",
).split(",");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const context = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 1, colorScheme: "dark" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(`${base}/login`);
await page.getByLabel("Email").fill("demo@lockdin.test");
await page.getByLabel("Password").fill("stencil-plate-rack-42");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(`${base}/`);

for (const p of pages) {
  if (p === "/login") {
    await context.clearCookies();
  }
  await page.goto(`${base}${p}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const name = p === "/" ? "home" : p.slice(1).replaceAll("/", "_");
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${p} → ${name}.png${overflow > 0 ? ` (horizontal overflow ${overflow}px)` : ""}`);
}
if (errors.length) console.log("Errors:\n" + errors.join("\n"));
await browser.close();

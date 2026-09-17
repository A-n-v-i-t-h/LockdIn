// node scripts/make-icons.mjs — renders public/icons/icon.svg to the PNG sizes
// the manifest and iOS need, using the locally installed Chrome.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const svg = fs.readFileSync(path.resolve("public/icons/icon.svg"), "utf8");
const targets = [
  { file: "icon-192.png", size: 192, pad: 0 },
  { file: "icon-512.png", size: 512, pad: 0 },
  { file: "apple-touch-icon.png", size: 180, pad: 0 },
  // Maskable icons need the artwork inside the 80% safe zone.
  { file: "icon-maskable-512.png", size: 512, pad: 0.1 },
];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const page = await browser.newPage();
for (const t of targets) {
  const inner = Math.round(t.size * (1 - 2 * t.pad));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:#131313;display:grid;place-items:center;width:${t.size}px;height:${t.size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: path.resolve("public/icons", t.file), omitBackground: false });
  console.log("wrote", t.file);
}
await browser.close();

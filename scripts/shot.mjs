/**
 * Screenshot the display and host views against a running server.
 *   npm run shot -- [outDir] [port]
 * The display is the shared surface, so being able to look at it without
 * booting a meeting is worth a script.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const outDir = process.argv[2] ?? "screenshots";
const port = process.argv[3] ?? process.env.PORT ?? 5173;
const base = `http://127.0.0.1:${port}`;

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();

for (const [name, path, size] of [
  ["display", "/display", { width: 1920, height: 1080 }],
  ["host", "/host", { width: 1440, height: 1200 }],
  ["host-phone", "/host", { width: 430, height: 1400 }],
]) {
  const page = await browser.newPage({ viewport: size });
  await page.goto(`${base}${path}`, { waitUntil: "load" });
  // Wait for the first server state push rather than a fixed delay.
  await page.waitForFunction(() => !document.querySelector("#board")?.matches(":empty"), { timeout: 10000 })
    .catch(() => console.warn(`[shot] ${name}: no state arrived, capturing anyway`));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  await page.close();
  console.log(`  ${outDir}/${name}.png`);
}

await browser.close();

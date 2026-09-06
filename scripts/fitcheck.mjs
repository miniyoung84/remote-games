/**
 * Verify the display stage lands centered and fully on screen at every plausible
 * monitor size. Run against a running server:  npm run fit -- [port]
 *
 * This exists because a misplaced stage is invisible when you only ever look at
 * one window size: the original bug only appeared when the viewport was smaller
 * than 1920x1080, which is every Windows machine at 125% or 150% display scaling.
 */
import { chromium } from "playwright";

const port = process.argv[2] ?? process.env.PORT ?? 5173;

const CASES = [
  ["1920x1080 exact 16:9", 1920, 1080, 1],
  ["1920x950  browser chrome", 1920, 950, 1],
  ["1920x1200 16:10", 1920, 1200, 1],
  ["1280x1024 5:4", 1280, 1024, 1],
  ["3440x1440 ultrawide", 3440, 1440, 1],
  ["3840x2160 4K", 3840, 2160, 1],
  ["1536x864  125% scaling", 1536, 864, 1.25],
  ["1280x720  150% scaling", 1280, 720, 1.5],
  ["2560x1440 QHD", 2560, 1440, 1],
];

const browser = await chromium.launch();
let failed = 0;

console.log("case                        scale  gap L/R      gap T/B      verdict");
for (const [name, width, height, deviceScaleFactor] of CASES) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor });
  await page.goto(`http://127.0.0.1:${port}/display`, { waitUntil: "load" });
  await page.waitForTimeout(300);

  const m = await page.evaluate(() => {
    const r = document.getElementById("stage").getBoundingClientRect();
    const el = document.documentElement;
    return { x: r.x, y: r.y, w: r.width, h: r.height, vw: el.clientWidth, vh: el.clientHeight,
             sw: el.scrollWidth, sh: el.scrollHeight };
  });
  await page.close();

  const gapL = m.x, gapR = m.vw - (m.x + m.w);
  const gapT = m.y, gapB = m.vh - (m.y + m.h);
  const problems = [];
  // Letterbox bars must be equal on opposite sides, never negative (which means
  // the stage is hanging off the edge), and the page must never scroll.
  if (Math.abs(gapL - gapR) > 1.5) problems.push("HORIZONTALLY OFF-CENTER");
  if (Math.abs(gapT - gapB) > 1.5) problems.push("VERTICALLY OFF-CENTER");
  if (gapL < -0.5 || gapT < -0.5) problems.push("STAGE OVERFLOWS VIEWPORT");
  if (m.sw > m.vw + 1 || m.sh > m.vh + 1) problems.push("PAGE SCROLLS");

  if (problems.length) failed++;
  console.log(
    `${name.padEnd(26)} ${(m.w / 1920).toFixed(3)}  ` +
    `${gapL.toFixed(0).padStart(5)}/${gapR.toFixed(0).padStart(5)}  ` +
    `${gapT.toFixed(0).padStart(5)}/${gapB.toFixed(0).padStart(5)}  ` +
    (problems.length ? problems.join(", ") : "ok"),
  );
}

await browser.close();
console.log(failed ? `\n${failed} of ${CASES.length} sizes FAILED` : `\nall ${CASES.length} sizes ok`);
process.exit(failed ? 1 : 0);

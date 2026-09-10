import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
const ids = process.argv.slice(3);
const sets = await Promise.all(ids.map(async (id) => JSON.parse(await readFile(`data/sets/${id}.json`, "utf8"))));
const html = `<style>body{margin:0;background:#0a0c0f;color:#f5f2ea;font:14px system-ui;padding:22px}
 h2{font-size:21px;margin:22px 0 10px;color:#ffc02e}.g{display:grid;grid-template-columns:repeat(8,1fr);gap:10px}
 .c{background:#12161c;border:2px solid #232a34;border-radius:9px;padding:8px;text-align:center}
 .c img{width:100%;aspect-ratio:1;object-fit:cover;background:#0a0c0f;border-radius:6px}
 .n{font-weight:800;margin-top:6px;font-size:13px}.l{color:#7c879a;font-size:10px}
 .miss{color:#ff3d7f;font-size:11px;padding:26px 0}</style>` +
 sets.map((s) => `<h2>${s.title}</h2><div class="g">` + s.items.map((i) => {
  const label = typeof i === "string" ? i : i.label, art = typeof i === "string" ? null : i.art;
  return `<div class="c">${art?.image ? `<img src="/images/${art.image}.webp">` : `<div class="miss">none</div>`}<div class="n">${label}</div><div class="l">${art?.license ?? ""}</div></div>`;
 }).join("") + "</div>").join("");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 800 } });
await p.goto("http://127.0.0.1:5199/host", { waitUntil: "load" });
await p.setContent(`<base href="http://127.0.0.1:5199/">${html}`, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.screenshot({ path: process.argv[2], fullPage: true });
await b.close();

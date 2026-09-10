import { chromium } from "playwright";
const send = (a) => new Promise((r) => { const w = new WebSocket("ws://127.0.0.1:5199/ws?role=host");
  w.addEventListener("open", () => { w.send(JSON.stringify({type:"action",action:a})); setTimeout(() => { w.close(); r(); }, 180); }); });
const state = () => new Promise((r) => { const w = new WebSocket("ws://127.0.0.1:5199/ws?role=host");
  w.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.type === "state") { w.close(); r(m.state); } }); });
const [out, setId, mode, n] = process.argv.slice(2);
await send({ type: "game/reset" });
let s = await state();
if (!s.roster.length) for (const nm of ["Chase","Priya","Dana","Yuki"]) await send({ type: "roster/add", name: nm });
await send({ type: "game/start", setId, kind: "tierlist", shuffle: false, mode });
const tiers = ["s","a","b","a","c","s","b","d","f","c","a","b","s","d","c","b"];
for (let i = 0; i < Number(n); i++) {
  s = await state();
  const item = s.game.board.current ?? s.game.board.unplaced[0];
  if (!item) break;
  await send({ type: "roster/setCurrent", id: s.roster[i % 4].id });
  await send({ type: "tier/place", itemId: item.id, tierId: tiers[i] });
}
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto("http://127.0.0.1:5199/display", { waitUntil: "load" });
await p.waitForTimeout(2600);
const clipped = await p.evaluate(() => [...document.querySelectorAll(".chip-label")].filter((e) => e.scrollHeight > e.clientHeight + 2).map((e) => e.textContent));
console.log("  clipped labels:", clipped.length ? clipped : "none");
await p.screenshot({ path: out });
await b.close();

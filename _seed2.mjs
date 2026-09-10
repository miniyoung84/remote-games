import { chromium } from "playwright";
const PORT = 5199;
const ok = (c, m) => { console.log(c ? "  ok   " : "  FAIL ", m); if (!c) process.exitCode = 1; };
const send = (a) => new Promise((r) => { const w = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=host`);
  w.addEventListener("open", () => { w.send(JSON.stringify({type:"action",action:a})); setTimeout(() => { w.close(); r(); }, 180); }); });
const state = () => new Promise((r) => { const w = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=host`);
  w.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.type === "state") { w.close(); r(m.state); } }); });

const b = await chromium.launch();
// The host must default shuffle OFF for a bracket, or the seeding is thrown away.
const host = await b.newPage({ viewport: { width: 1400, height: 1200 } });
await host.goto(`http://127.0.0.1:${PORT}/host?game=bracket`, { waitUntil: "load" });
await host.waitForTimeout(800);
ok((await host.$$eval("#sets .set input[type=checkbox]", (n) => n.filter((c) => c.checked).length)) === 0,
   "bracket: shuffle defaults off, so the seeding is kept");
await host.goto(`http://127.0.0.1:${PORT}/host?game=tierlist`, { waitUntil: "load" });
await host.waitForTimeout(700);
ok((await host.$$eval("#sets .set input[type=checkbox]", (n) => n.every((c) => c.checked))),
   "tier list: shuffle defaults on, no seeding to preserve");

await send({ type: "game/reset" });
let s = await state();
if (!s.roster.length) for (const n of ["Chase","Priya"]) await send({ type: "roster/add", name: n });
await send({ type: "game/start", setId: "best-fruit", kind: "bracket", shuffle: false });
s = await state();
const seeds = Object.fromEntries(s.game.bracket.rounds[0].flatMap((m) => [m.a, m.b]).filter(Boolean).map((e) => [e.seed, e.label]));
ok(seeds[1] === "Apple", `Apple is the 1 seed (got ${seeds[1]})`);
ok(seeds[16] === "Coconut", `Coconut is the 16 seed (got ${seeds[16]})`);
ok(seeds[2] === "Banana", `Banana is the 2 seed (got ${seeds[2]})`);
console.log("  first round:", s.game.bracket.rounds[0].map((m) => `${m.a.seed}${m.a.label.slice(0,3)}v${m.b.seed}${m.b.label.slice(0,3)}`).join(" "));

for (let i = 0; i < 4; i++) {
  s = await state();
  await send({ type: "roster/setCurrent", id: s.roster[i % 2].id });
  await send({ type: "bracket/decide", matchId: s.game.currentMatchId, winner: i % 3 ? "a" : "b" });
}
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(`http://127.0.0.1:${PORT}/display`, { waitUntil: "load" });
await p.waitForTimeout(2600);
await p.screenshot({ path: process.argv[2] });
await b.close();
console.log(process.exitCode ? "\nFAILED" : "\nseeding ok");

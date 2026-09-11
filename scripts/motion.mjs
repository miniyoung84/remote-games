/**
 * Rendering check for the display, against a running server. Where the smoke
 * suite proves the games are right, this proves they *look* right: chips are
 * sized to the room they have, labels don't truncate, a placement flies once,
 * a draft pick is announced before it lands, and nothing is animating once the
 * board has settled. Drops screenshots of each stage in screenshots/motion/.
 *
 *   npm start                # in another terminal, ideally on a spare port
 *   npm run motion -- 5199
 *
 * It plays through real games, so run it on a server nobody is sharing.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const PORT = process.argv[2] ?? process.env.PORT ?? 5173;
const OUT = "screenshots/motion";
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log(c ? "  ok   " : "  FAIL ", m); if (!c) fails++; };

// One long-lived host socket; state pushes are read off it.
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=host`);
let latest = null;
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.type === "state") latest = m.state; if (m.type === "error") console.log("  server error:", m.message); });
await new Promise((r) => ws.addEventListener("open", r));
const act = (a) => ws.send(JSON.stringify({ type: "action", action: a }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (latest && pred(latest)) return true; await wait(40); } return false; };

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.log("  PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("  console:", m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/display`, { waitUntil: "load" });
await page.waitForFunction(() => !document.querySelector("#board")?.matches(":empty"));

// ---- roster (reused if the names are already there)
act({ type: "game/reset" });
await wait(200);
const NAMES = ["Chase", "Priya", "Marco"];
for (const name of NAMES) if (!latest?.roster.some((p) => p.name === name)) act({ type: "roster/add", name });
await until((s) => NAMES.every((n) => s.roster.some((p) => p.name === n)));
const ids = NAMES.map((n) => latest.roster.find((p) => p.name === n).id);
for (const id of ids) act({ type: "roster/setPresent", id, present: true });
await wait(200);

// ================= TIER LIST =================
console.log("tier list");
act({ type: "game/start", setId: "office-snacks", kind: "tierlist", shuffle: false, mode: "queue" });
await until((s) => s.game?.kind === "tierlist");
await wait(900);
const readChip = () => page.evaluate(() => ({
  w: getComputedStyle(document.querySelector("#board")).getPropertyValue("--chip-w").trim(),
  density: document.querySelector("#board").dataset.density,
}));

// Place six into S; chips should stay at full width.
for (let i = 0; i < 6; i++) {
  act({ type: "roster/setCurrent", id: ids[i % 3] });
  await wait(60);
  act({ type: "tier/place", itemId: latest.game.board.current.id, tierId: "s" });
  await until((s) => s.game.board.placed === i + 1);
  await wait(60);
}
await wait(2400);
let c = await readChip();
ok(c.w === "190px", `six in a row keeps full-width chips (${c.w}, ${c.density})`);
await page.screenshot({ path: `${OUT}/tier-six.png` });

// Track the seventh placement frame by frame: one flight, then nothing.
act({ type: "roster/setCurrent", id: ids[0] });
await wait(80);
const seventh = latest.game.board.current.id;
act({ type: "tier/place", itemId: seventh, tierId: "a" });
const samples = [];
const t0 = Date.now();
while (Date.now() - t0 < 2600) {
  const s = await page.evaluate((id) => {
    const n = document.querySelector(`#board [data-item="${id}"]`);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), flying: n.classList.contains("in-flight"), landed: n.classList.contains("landed") };
  }, seventh);
  samples.push({ t: Date.now() - t0, ...s });
  if (samples.length === 5) await page.screenshot({ path: `${OUT}/tier-flight.png` });
  await wait(50);
}
const moving = samples.filter((s, i) => i > 0 && s.x !== null && samples[i - 1].x !== null && (Math.abs(s.x - samples[i - 1].x) > 2 || Math.abs(s.y - samples[i - 1].y) > 2));
const lastMove = moving.length ? moving[moving.length - 1].t : 0;
const firstMove = moving.length ? moving[0].t : 0;
ok(moving.length > 0, `chip flew (${moving.length} moving samples, ${firstMove}–${lastMove}ms)`);
ok(lastMove < 1200, `no second flight after the hold (last movement at ${lastMove}ms)`);
ok(samples.some((s) => s.landed), "landing beat played");
await page.screenshot({ path: `${OUT}/tier-seven.png` });

// Labels: nothing truncated by the clamp.
const clipped = await page.evaluate(() => [...document.querySelectorAll(".chip-label")].filter((l) => l.scrollHeight > l.clientHeight + 1).map((l) => l.textContent));
ok(clipped.length === 0, `no clipped chip labels (${clipped.join(", ") || "none"})`);

// Pile the rest into S and A to see the width step down.
for (let i = 7; i < 18; i++) {
  act({ type: "roster/setCurrent", id: ids[i % 3] });
  await wait(40);
  act({ type: "tier/place", itemId: latest.game.board.current.id, tierId: i % 2 ? "s" : "a" });
  await until((s) => s.game.board.placed === i + 1);
  await wait(30);
}
const sRow = latest.game.board.rows[0].items.length;
const tCatch = Date.now();
await page.waitForFunction((n) => document.querySelectorAll("#board .tier:first-child .chip:not(.art)").length === n, sRow, { timeout: 12000 }).catch(() => {});
console.log(`  display caught up after ${Date.now() - tCatch}ms`);
await wait(1800);
c = await readChip();
ok(parseInt(c.w) < 190 && parseInt(c.w) >= 64, `${sRow} in S steps the width down to ${c.w} (${c.density})`);
const clipped2 = await page.evaluate(() => [...document.querySelectorAll(".chip-label")].filter((l) => l.scrollHeight > l.clientHeight + 1).map((l) => l.textContent));
ok(clipped2.length === 0, `still no clipped labels at ${c.w} (${clipped2.join(", ") || "none"})`);
const overflow = await page.evaluate(() => [...document.querySelectorAll(".tier-items")].some((r) => r.scrollWidth > r.clientWidth + 1));
ok(!overflow, "no row overflows");
await page.screenshot({ path: `${OUT}/tier-dense.png` });

// Tier list open mode: tray.
act({ type: "game/start", setId: "office-snacks", kind: "tierlist", shuffle: false, mode: "open" });
await until((s) => s.game?.board?.mode === "open");
await wait(900);
const tray = await page.evaluate(() => ({
  w: document.querySelector(".tier-tray")?.style.getPropertyValue("--tray-w"),
  clipped: [...document.querySelectorAll(".tray-label")].filter((l) => l.scrollHeight > l.clientHeight + 1).length,
  overflow: (document.querySelector(".tier-tray")?.scrollWidth ?? 0) > (document.querySelector(".tier-tray")?.clientWidth ?? 0) + 1,
}));
ok(tray.w && tray.clipped === 0 && !tray.overflow, `tray sized ${tray.w}, ${tray.clipped} clipped, overflow=${tray.overflow}`);
await page.screenshot({ path: `${OUT}/tier-open.png` });

// ================= DRAFT =================
console.log("draft");
act({ type: "game/reset" });
await wait(300);
act({ type: "draft/start", topic: "Desert island snacks", subtitle: "three each", rounds: 3 });
await until((s) => s.game?.kind === "draft");
await wait(700);

// Sample decodes in the browser.
const decoded = await page.evaluate(async () => {
  const res = await fetch("/sounds/draft-pick.ogg");
  const buf = await res.arrayBuffer();
  const ctx = new AudioContext();
  const audio = await ctx.decodeAudioData(buf);
  return { status: res.status, seconds: Math.round(audio.duration * 100) / 100, channels: audio.numberOfChannels };
});
ok(decoded.status === 200 && decoded.seconds > 4.9, `sting decodes: ${decoded.seconds}s, ${decoded.channels}ch`);

act({ type: "roster/setCurrent", id: ids[0] });
await wait(80);
act({ type: "draft/pick", label: "Salt and vinegar chips" });
await wait(1400);
const card = await page.evaluate(() => ({
  shown: !document.querySelector("#champion").hidden,
  cls: document.querySelector("#champion").className,
  num: document.querySelector(".announce-pick .n")?.textContent,
  who: document.querySelector(".announce-who")?.textContent,
  what: document.querySelector(".announce-label")?.textContent,
  boardHas: Boolean(document.querySelector(".draft-pick")),
}));
ok(card.shown && card.cls === "announce" && card.num === "1.01", `announcement card up: Pick ${card.num}`);
ok(card.who === "Chase selects" && card.what === "Salt and vinegar chips", `${card.who} ${card.what}`);
ok(!card.boardHas, "board waits for the card");
await page.screenshot({ path: `${OUT}/draft-announce.png` });
await wait(1900); // 3.3s
await page.screenshot({ path: `${OUT}/draft-flight.png` });
const mid = await page.evaluate(() => ({ hidden: document.querySelector("#champion").hidden, chip: document.querySelector(".draft-pick")?.className }));
ok(mid.hidden && mid.chip, `card down, chip on board (${mid.chip})`);
await wait(900);
const landed = await page.evaluate(() => ({
  num: document.querySelector(".draft-pick .pick-num")?.textContent,
  label: document.querySelector(".draft-pick .pick-label")?.textContent,
  h: document.querySelector("#board").style.getPropertyValue("--pick-h"),
  depth: document.querySelector("#board").dataset.depth,
}));
ok(landed.num === "1.01" && landed.label === "Salt and vinegar chips", `pick ${landed.num} on the board at ${landed.h} (${landed.depth})`);
await page.screenshot({ path: `${OUT}/draft-one.png` });

// Second drafter: 1.02. Then first again: 2.01.
act({ type: "roster/setCurrent", id: ids[1] });
await wait(80);
act({ type: "draft/pick", label: "Mango" });
await wait(4200);
act({ type: "roster/setCurrent", id: ids[0] });
await wait(80);
act({ type: "draft/pick", label: "Cold pizza" });
await wait(4200);
const nums = await page.evaluate(() => [...document.querySelectorAll(".draft-pick .pick-num")].map((n) => n.textContent));
ok(JSON.stringify(nums) === JSON.stringify(["1.01", "2.01", "1.02"]), `numbers: ${nums.join(" ")}`);

// Art on a pick, applied mid-game.
const pickId = latest.game.board.columns[0].picks[0].id;
act({ type: "draft/setArt", pickId, art: { emoji: "🥨" } });
await until((s) => s.game.board.columns[0].picks[0].art);
await wait(500);
const art = await page.evaluate(() => {
  const chip = document.querySelector(".draft-pick.has-art");
  return { has: Boolean(chip), emoji: chip?.querySelector(".art-emoji")?.textContent, num: chip?.querySelector(".pick-num")?.textContent };
});
ok(art.has && art.emoji === "🥨", `pick shows its art (num ${art.num})`);
await page.screenshot({ path: `${OUT}/draft-art.png` });

// ================= BRACKET =================
console.log("bracket");
act({ type: "game/reset" });
await wait(300);
act({ type: "game/start", setId: "best-fruit", kind: "bracket", shuffle: false });
await until((s) => s.game?.kind === "bracket");
await wait(900);
act({ type: "roster/setCurrent", id: ids[2] });
await wait(80);
act({ type: "bracket/decide", matchId: latest.game.currentMatchId, winner: "a" });
await wait(650);
const arrived = await page.evaluate(() => ({
  arrived: document.querySelector(".slot.arrived")?.textContent?.trim(),
  live: document.querySelector(".round.live .round-name span")?.textContent,
  lost: document.querySelector(".duel-side.lost") ? getComputedStyle(document.querySelector(".duel-side.lost")).transform : null,
}));
ok(arrived.arrived, `winner wiped into next round: ${arrived.arrived}`);
ok(arrived.lost && arrived.lost !== "none", "loser slid off");
await page.screenshot({ path: `${OUT}/bracket-decided.png` });
await wait(1200);
// Play it out.
for (let i = 0; i < 20 && latest.game.phase !== "complete"; i++) {
  act({ type: "roster/setCurrent", id: ids[i % 3] });
  await wait(60);
  act({ type: "bracket/decide", matchId: latest.game.currentMatchId, winner: i % 2 ? "a" : "b" });
  await until((s) => s.game.phase === "complete" || s.game.currentMatchId !== null);
  await wait(1650);
}
await wait(350);
await page.screenshot({ path: `${OUT}/champion-wipe.png` });
await wait(1200);
await page.screenshot({ path: `${OUT}/champion.png` });
const champ = await page.evaluate(() => ({ cls: document.querySelector("#champion").className, hidden: document.querySelector("#champion").hidden }));
ok(champ.cls === "champion" && !champ.hidden, "champion takeover up");

// Nothing running once settled.
await wait(1500);
const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
ok(running === 0, `nothing animating once settled (${running})`);

await browser.close();
ws.close();
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);

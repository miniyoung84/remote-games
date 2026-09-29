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
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await ctx.newPage();
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
// Only these three are present; anyone else left over from another run steps out.
for (const p of latest.roster) act({ type: "roster/setPresent", id: p.id, present: ids.includes(p.id) });
await wait(200);

// A draft first, so the tier list mounts on a board another game has used.
// Leftover layout attributes from the previous game once laid tier rows out
// as draft columns.
act({ type: "draft/start", topic: "Warm-up", subtitle: "", rounds: 1 });
await until((s) => s.game?.kind === "draft");
await wait(400);
act({ type: "game/reset" });
await until((s) => s.game === null);
await wait(300);

// ================= TIER LIST =================
console.log("tier list");
act({ type: "game/start", setId: "office-snacks", kind: "tierlist", shuffle: false, mode: "queue" });
await until((s) => s.game?.kind === "tierlist");
await wait(900);
const attrs = await page.evaluate(() => [...document.querySelector("#board").attributes].map((a) => a.name).filter((n) => n.startsWith("data-")));
ok(JSON.stringify(attrs) === '["data-density"]', `board carries only its own layout attribute (${attrs.join(", ")})`);
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
const chaseCol = (st) => st.game.board.columns.find((c) => c.name === "Chase");
const pickId = chaseCol(latest).picks[0].id;
act({ type: "draft/setArt", pickId, art: { emoji: "🥨" } });
await until((s) => chaseCol(s).picks[0].art);
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

// ================= DRAFT, FROM THE HOST SIDE =================
// Topic shelf, editing a pick, changing rounds, the finish nudge, the finale
// card, copying results, and a topic long enough to threaten the header.
console.log("draft (host)");
act({ type: "game/reset" });
await wait(300);
const host = await ctx.newPage();
await host.setViewportSize({ width: 1440, height: 1300 });
host.on("pageerror", (e) => console.log("  PAGE ERROR (host):", e.message));
await host.goto(`http://127.0.0.1:${PORT}/host`, { waitUntil: "load" });
await wait(600);
const display = page;
// ---- topic shelf fills the form
await host.click('button[class*="pick"]:has-text("Draft")');
await wait(200);
const chips = await host.evaluate(() => [...document.querySelectorAll(".topic-chip")].map((c) => c.textContent));
ok(chips.length >= 20, `topic shelf shows ${chips.length} prompts`);
await host.click('.topic-chip:has-text("Heist crew")');
const form = await host.evaluate(() => ({ topic: document.querySelector("#draft-topic").value, sub: document.querySelector("#draft-subtitle").value, rounds: document.querySelector("#draft-rounds").value }));
ok(form.topic === "Heist crew" && form.rounds === "3" && form.sub.length > 0, `chip filled the form: ${form.topic} / ${form.sub} / ${form.rounds}`);
await host.fill("#draft-rounds", "2");
await host.click("#draft-go");
await until((s) => s.game?.kind === "draft" && s.game.board.rounds === 2);
await wait(800);

// ---- picks, then a typo fix from the board
const pick = async (i, label) => { act({ type: "roster/setCurrent", id: ids[i] }); await wait(100); act({ type: "draft/pick", label }); await until((s) => s.game.board.total === (latest.game.board.total + 1)); };
act({ type: "roster/setCurrent", id: ids[0] }); await wait(100); act({ type: "draft/pick", label: "Danny Ocaen" }); await until((s) => s.game.board.total === 1);
act({ type: "roster/setCurrent", id: ids[1] }); await wait(100); act({ type: "draft/pick", label: "A getaway driver" }); await until((s) => s.game.board.total === 2);
await wait(600);
await host.click('.h-chip:has-text("Danny Ocaen")');
await wait(200);
const editing = await host.evaluate(() => ({ label: document.querySelector(".draft-edit-label")?.textContent, value: document.querySelector(".draft-edit-row input")?.value, focused: document.activeElement === document.querySelector(".draft-edit-row input") }));
ok(editing.label === "Editing 1.01" && editing.value === "Danny Ocaen" && editing.focused, `clicking a pick opens the editor (${editing.label}, "${editing.value}", focused=${editing.focused})`);
await host.screenshot({ path: `${OUT}/host-edit.png` });
await host.fill(".draft-edit-row input", "Danny Ocean");
await host.keyboard.press("Enter");
await until((s) => s.game.board.columns.find((c) => c.name === "Chase").picks[0].label === "Danny Ocean");
await wait(200);
const after = await host.evaluate(() => ({ editor: Boolean(document.querySelector(".draft-edit")), chip: document.querySelector('.h-chip:has(.h-pick-num)')?.textContent }));
ok(!after.editor && /Danny Ocean$/.test(after.chip ?? ""), `saved: editor closed, board says "${after.chip}"`);
ok(latest.game.board.total === 2 && latest.game.board.last.label === "A getaway driver", "rename didn't count as a pick");

// ---- +1 round from the host, board grows a slot
await host.click('button:has-text("+1 round")');
await until((s) => s.game.board.rounds === 3);
await display.waitForFunction(() => document.querySelectorAll(".draft-slot").length === 7, null, { timeout: 12000 }).catch(() => {});
const slots = await display.evaluate(() => ({ slots: document.querySelectorAll(".draft-slot").length, sub: document.querySelector("#title .sub")?.textContent, h: document.querySelector("#board").style.getPropertyValue("--pick-h") }));
ok(slots.slots === 7 && slots.sub === "Who's cracking the safe?", `display now shows 3 rounds: ${slots.slots} empty slots, subtitle kept "${slots.sub}", cards ${slots.h}`);

// ---- everyone picks: band says so, host nudges
await host.click('button:has-text("−1 round")');
await until((s) => s.game.board.rounds === 2);
const remaining = [[2, "Rusty"], [0, "Linus"], [1, "Basher"], [2, "Yen"]];
for (const [i, label] of remaining) { const n = latest.game.board.total; act({ type: "roster/setCurrent", id: ids[i] }); await wait(100); act({ type: "draft/pick", label }); await until((s) => s.game.board.total === n + 1); await wait(3900); }
await wait(600);
const done = await display.evaluate(() => ({ clock: document.querySelector(".clock-name")?.textContent, pill: document.querySelector(".clock-round .band-round")?.textContent, owed: document.querySelector(".owed")?.textContent }));
ok(done.clock === "Everyone has picked" && done.pill === "All rounds" && !done.owed, `display band: "${done.pill}" · "${done.clock}"`);
const nudge = await host.evaluate(() => ({ line: document.querySelector(".picker-line")?.textContent, finish: [...document.querySelectorAll("button")].find((b) => b.textContent.startsWith("Finish the draft"))?.className }));
ok(/Everyone has picked/.test(nudge.line ?? "") && nudge.finish === "primary", `host nudges to finish (${nudge.finish})`);
await display.screenshot({ path: `${OUT}/draft-everyone.png` });

// ---- finish: finale card, then the board without slots
await host.click('button:has-text("Finish the draft")');
await until((s) => s.game.board.phase === "final");
await wait(1100);
const finale = await display.evaluate(() => ({ shown: !document.querySelector("#champion").hidden, who: document.querySelector(".announce-who")?.textContent, what: document.querySelector(".announce-label")?.textContent, meta: document.querySelector(".announce-meta")?.textContent }));
ok(finale.shown && finale.who === "That's the draft" && finale.what === "Heist crew" && finale.meta === "6 picks · 3 drafters", `finale card: ${finale.who} · ${finale.what} · ${finale.meta}`);
await display.screenshot({ path: `${OUT}/draft-finale.png` });
await wait(2200);
const final = await display.evaluate(() => ({ hidden: document.querySelector("#champion").hidden, slots: document.querySelectorAll(".draft-slot").length, band: document.querySelector(".band-final")?.textContent, h: document.querySelector("#board").style.getPropertyValue("--pick-h") }));
ok(final.hidden && final.slots === 0 && final.band === "Final · Heist crew", `final board: no empty slots, band "${final.band}", cards ${final.h}`);
await display.screenshot({ path: `${OUT}/draft-final.png` });

// ---- copy results
await host.click('button:has-text("Copy results")');
await wait(400);
const clip = await host.evaluate(() => navigator.clipboard.readText());
ok(clip.startsWith("Heist crew — Who's cracking the safe?\n") && clip.includes("Chase: Danny Ocean (1.01), Linus (2.01)"), `clipboard:\n    ${clip.split("\n").join("\n    ")}`);
const toast = await host.evaluate(() => document.querySelector("#toast")?.textContent);
ok(/Copied/.test(toast ?? ""), `toast: ${toast}`);

// ---- long topic can't push the counter off
act({ type: "game/reset" }); await wait(200);
act({ type: "draft/start", topic: "The definitive, absolutely final and never to be repeated list of things we would bring to a very long meeting", subtitle: "", rounds: 2 });
await until((s) => s.game?.kind === "draft"); await wait(600);
const header = await display.evaluate(() => { const p = document.querySelector("#progress").getBoundingClientRect(); const s = document.querySelector("#stage").getBoundingClientRect(); return { right: Math.round(p.right), stage: Math.round(s.right), visible: p.width > 0 }; });
ok(header.visible && header.right <= header.stage, `long topic: counter still on stage (${header.right} <= ${header.stage})`);
await display.screenshot({ path: `${OUT}/draft-long-topic.png` });


await browser.close();
ws.close();
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);

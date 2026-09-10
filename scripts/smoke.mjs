/**
 * End-to-end check against a running server. Exercises all three games plus
 * images, suggestions and packs over the real websocket and HTTP surfaces.
 *
 *   npm start          # in another terminal
 *   npm run smoke -- 5173
 *
 * Set counts are derived, never hardcoded, so adding sets can't break it.
 */
const PORT = process.argv[2] ?? process.env.PORT ?? 5173;
let failures = 0;
const ok = (cond, msg) => {
  console.log(cond ? "  ok   " : "  FAIL ", msg);
  if (!cond) failures++;
};

/** The server pushes state on connect, so buffer from the first message. */
function open(role) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=${role}`);
  const buffer = [];
  let waiter = null;
  ws.addEventListener("message", (e) => {
    buffer.push(JSON.parse(e.data));
    waiter?.();
  });
  const take = (match) =>
    new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error("timed out waiting for the server")), 15000);
      const scan = () => {
        for (let i = 0; i < buffer.length; i++) {
          const value = match(buffer[i]);
          if (value !== undefined && value !== false) {
            buffer.splice(0, i + 1);
            waiter = null;
            clearTimeout(timer);
            return res(value);
          }
        }
        waiter = scan;
      };
      scan();
    });
  return {
    ready: new Promise((res, rej) => {
      ws.addEventListener("open", () => res(), { once: true });
      ws.addEventListener("error", rej, { once: true });
    }),
    close: () => ws.close(),
    act: (action) => ws.send(JSON.stringify({ type: "action", action })),
    state: (pred = () => true) => take((m) => (m.type === "state" && pred(m.state) ? m.state : undefined)),
    error: () => take((m) => (m.type === "error" ? m.message : undefined)),
    notice: () => take((m) => (m.type === "notice" ? m.message : undefined)),
  };
}

const host = open("host");
const display = open("display");
await host.ready;
await display.ready;
await host.state();

host.act({ type: "game/reset" });
let h = await host.state((s) => s.game === null);
if (h.roster.length) {
  for (const p of h.roster) host.act({ type: "roster/remove", id: p.id });
  h = await host.state((s) => s.roster.length === 0);
}
host.act({ type: "roster/add", name: "Smoke Tester" });
h = await host.state((s) => s.roster.length === 1);
const picker = h.roster[0].id;
ok(true, "roster add");
host.act({ type: "roster/add", name: "smoke tester" });
ok((await host.error()).includes("already"), "duplicate name rejected");

display.act({ type: "game/reset" });
ok((await display.error()).includes("Read-only"), "display refuses writes");

const baseline = h.sets.length;
host.act({ type: "sets/save", set: { id: "smoke", title: "Smoke", subtitle: "", items: Array.from({ length: 10 }, (_, i) => `E${i + 1}`), updatedAt: 0 } });
h = await host.state((s) => s.sets.length === baseline + 1);

/* ---------- bracket ---------- */
host.act({ type: "game/start", setId: "smoke", kind: "bracket", shuffle: false });
h = await host.state((s) => s.game?.kind === "bracket");
ok(h.currentPickerId === null, "starting a game clears the clock");
ok(h.game.bracket.rounds[0].length === 8, "10 entrants -> 16-slot bracket");
ok(h.sets.find((s) => s.id === "smoke")?.lastPlayedAt > 0, "start records lastPlayedAt");
host.act({ type: "roster/setCurrent", id: picker });
h = await host.state((s) => s.currentPickerId === picker);

let d = await display.state((s) => s.game?.kind === "bracket");
ok(!("roster" in d) && !("sets" in d), "display projection omits roster and sets");
const first = d.game.bracket.rounds[0][0];
ok(first.a?.seed === 1 && first.b === null && first.bye, "top seed gets the bye");
ok(d.game.bracket.rounds[0].filter((m) => m.a && m.b).every((m) => m.a.seed + m.b.seed === 17), "pairings sum to 17");

host.act({ type: "bracket/decide", matchId: h.game.currentMatchId, winner: "a" });
h = await host.state((s) => s.canUndo);
ok(h.game.bracket.rounds.flat().some((m) => m.decidedBy === "Smoke Tester"), "pick attributed");
host.act({ type: "game/undo" });
h = await host.state((s) => !s.canUndo);
ok(h.currentPickerId === picker, "undo restores the picker");
for (let guard = 0; h.game.phase !== "complete" && guard < 40; guard++) {
  host.act({ type: "bracket/decide", matchId: h.game.currentMatchId, winner: "a" });
  h = await host.state((s) => s.game.currentMatchId !== null || s.game.phase === "complete");
}
ok(h.game.bracket.champion?.label === "E1", `champion resolved (${h.game.bracket.champion?.label})`);

/* ---------- tier list ---------- */
host.act({ type: "game/start", setId: "smoke", kind: "tierlist", shuffle: false, mode: "queue" });
h = await host.state((s) => s.game?.kind === "tierlist");
ok(h.game.board.rows.length === 6, "six tiers, S through F");
ok(h.game.board.current?.id === "i0", "queue mode hands out the first item");
host.act({ type: "roster/setCurrent", id: picker });
await host.state((s) => s.currentPickerId === picker);
host.act({ type: "tier/place", itemId: "i0", tierId: "f" });
h = await host.state((s) => s.game.board.placed === 1);
ok(h.game.board.rows.find((r) => r.id === "f").items[0].id === "i0", "F tier accepts placements");
host.act({ type: "roster/setCurrent", id: picker });
await host.state((s) => s.currentPickerId === picker);
host.act({ type: "tier/place", itemId: "i0", tierId: "s" });
h = await host.state((s) => s.game.board.last.from === "f");
ok(h.game.board.placed === 1, "a move is not a new placement");
host.act({ type: "tier/place", itemId: "i0", tierId: "s" });
ok((await host.error()).includes("already in that tier"), "same-tier move rejected");

host.act({ type: "game/start", setId: "smoke", kind: "tierlist", shuffle: false, mode: "open" });
h = await host.state((s) => s.game?.kind === "tierlist" && s.game.board.mode === "open");
ok(h.game.board.current === null && h.game.board.unplaced.length === 10, "open mode offers nothing but lists everything");

/* ---------- draft ---------- */
host.act({ type: "draft/start", topic: "", subtitle: "", rounds: 2 });
ok((await host.error()).includes("topic"), "a draft needs a topic");
host.act({ type: "draft/start", topic: "Squad", subtitle: "", rounds: 99 });
h = await host.state((s) => s.game?.kind === "draft");
ok(h.game.board.rounds === 12, `rounds clamped (${h.game.board.rounds})`);
host.act({ type: "draft/pick", label: "Crowbar" });
ok((await host.error()).includes("Nobody is on the clock"), "unattributed pick refused");
host.act({ type: "roster/setCurrent", id: picker });
await host.state((s) => s.currentPickerId === picker);
host.act({ type: "draft/pick", label: "  Crowbar  " });
h = await host.state((s) => s.game.board.total === 1);
ok(h.game.board.columns[0].picks[0].label === "Crowbar", "pick trimmed and attributed");
host.act({ type: "roster/setCurrent", id: picker });
await host.state((s) => s.currentPickerId === picker);
host.act({ type: "draft/pick", label: "Crowbar" });
h = await host.state((s) => s.game.board.total === 2);
ok(true, "duplicates allowed — nothing limits what people pick");
host.act({ type: "draft/finish" });
await host.state((s) => s.game.board.phase === "final");
host.act({ type: "draft/pick", label: "Late" });
ok((await host.error()).includes("finished"), "a finished draft refuses picks");
host.act({ type: "game/reset" });
h = await host.state((s) => s.game === null);

/* ---------- images, suggestions, packs ---------- */
const IMG = "a".repeat(32);
const WEBP = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
host.act({ type: "images/put", id: "not-a-hash", data: WEBP });
ok((await host.error()).includes("Bad image id"), "malformed image id rejected");
host.act({ type: "images/put", id: IMG, data: WEBP });
ok((await fetch(`http://127.0.0.1:${PORT}/images/${IMG}.webp`)).status === 200, "uploaded image is served");
ok((await fetch(`http://127.0.0.1:${PORT}/images/../package.json`)).status === 404, "path traversal refused");

for (const [name, url, want] of [
  ["loopback refused", "http://127.0.0.1/", "not allowed"],
  ["cloud metadata refused", "http://169.254.169.254/", "not allowed"],
  ["ipv6 loopback refused", "http://[::1]/", "not allowed"],
  ["file scheme refused", "file:///etc/passwd", "http and https"],
]) {
  const r = await fetch(`http://127.0.0.1:${PORT}/fetch-image?url=${encodeURIComponent(url)}`);
  ok(r.status === 400 && (await r.text()).includes(want), name);
}

const pack = await (await fetch(`http://127.0.0.1:${PORT}/pack.json?name=Smoke&sets=smoke`)).json();
ok(pack.format === "remote-games-pack" && pack.sets.length === 1, "pack export returns the requested set");
host.act({ type: "packs/import", pack });
h = await host.state((s) => s.sets.length === baseline + 2);
ok(h.sets.filter((s) => s.title === "Smoke").length === 2, "import renames rather than overwrites");
host.act({ type: "sets/delete", id: h.sets.find((s) => s.id !== "smoke" && s.title === "Smoke").id });
h = await host.state((s) => s.sets.length === baseline + 1);
host.act({ type: "sets/delete", id: "smoke" });
h = await host.state((s) => s.sets.length === baseline);
host.act({ type: "images/prune" });
ok((await host.notice()).includes("Removed"), "prune removes the orphaned image");
ok((await fetch(`http://127.0.0.1:${PORT}/images/${IMG}.webp`)).status === 404, "pruned image is gone");

host.act({ type: "game/reset" });
await host.state((s) => s.game === null);
host.close();
display.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nsmoke passed");
process.exit(failures ? 1 : 0);

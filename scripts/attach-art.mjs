/**
 * Fill in missing item art on a set from Wikimedia Commons, in bulk.
 *
 *   npm start                                  # server must be running
 *   npm run art -- <setId> [--hint word] [--port 5173] [--force]
 *
 * Uses exactly the path the host UI uses — Commons search, the /fetch-image
 * proxy, then resize and hash in a real browser — so nothing here is a second
 * implementation that can drift from what the app does.
 *
 * Commons returns 429 for bursts, so requests are sequential and paced. Bulk
 * art is not something to be impatient about.
 */
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const setId = args.find((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const force = args.includes("--force");
/**
 * Bulk search gets most items right and is confidently wrong about a few, so
 * --fixes takes a JSON map of {label: "better search"} and redoes just those.
 * Faster than arguing with the ranking heuristic.
 */
const fixesPath = flag("fixes", "");
const hint = flag("hint", "");
const port = flag("port", process.env.PORT ?? 5199);

if (!setId) {
  console.error("usage: npm run art -- <setId> [--hint word] [--port 5173] [--force]");
  process.exit(1);
}

const PACE_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const path = `data/sets/${setId}.json`;
const set = JSON.parse(await readFile(path, "utf8"));
const fixes = fixesPath ? JSON.parse(await readFile(fixesPath, "utf8"))[setId] ?? {} : null;

const send = (action) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?role=host`);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "action", action }));
      setTimeout(() => { ws.close(); resolve(); }, 200);
    });
    ws.addEventListener("error", reject);
  });

/**
 * Commons is not curated for a workplace audience, and the top hit for an
 * innocuous query is sometimes explicit. Blocking obviously adult filenames is
 * the floor, not the ceiling — everything still gets eyeballed before it ships.
 */
const BLOCKED = /\b(nude|nudity|naked|topless|erotic|porn|nsfw|fetish|footjob|bdsm|bondage|upskirt|genital|penis|vagina|breasts?|nipple|lingerie|underwear|panties|striptease|sex(ual|y)?)\b/i;

/**
 * Subjects that name the right thing but aren't a usable picture of it: a
 * skeleton of a dachshund, a drawing of a loafer, a statue of a seahorse, an
 * engraving of a narwhal. All real results from the first pass.
 */
const NOT_A_PHOTO = /\b(drawing|drawn|sketch|engraving|etching|illustration|diagram|schematic|icon|logo|skeleton|skull|bones?|fossil|statue|sculpture|figurine|carving|toy|model|replica|coat of arms|stamps?|banknote|map|graph|chart|poster|packaging|label|silhouette|clipart|pictogram)\b/i;

/**
 * Relevance: how much of the label actually appears in the file's title. The
 * top hit for "Violin" was a rock formation called Bow Fiddle Rock, so a
 * candidate that never names the thing is treated as a miss.
 */
function relevance(candidate, label) {
  const title = candidate.title.toLowerCase();
  const words = label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
  if (!words.length) return 0;
  return words.filter((w) => title.includes(w)).length / words.length;
}

/**
 * `trust` is set for hand-written queries: relevance is still scored against
 * the label (a long query could never appear in a title), but a best-effort
 * pick is returned instead of declining, since a human chose the search.
 */
function bestOf(results, label, trust = false) {
  const safe = results.filter((r) => !BLOCKED.test(r.title));
  const blocked = results.length - safe.length;

  const ranked = safe
    .map((r) => {
      let score = relevance(r, label);
      if (score === 0) return { r, score: 0 };
      // Photographs read far better than diagrams at chip size, and a set of
      // photos with three pen drawings in it looks broken.
      if (NOT_A_PHOTO.test(r.title)) score -= 0.6;
      if (r.mime === "image/jpeg") score += 0.15;
      if (r.mime === "image/png") score -= 0.1;
      if (r.width && r.width < 400) score -= 0.15;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  // A non-positive best means nothing named the thing, or everything on offer
  // was a drawing. Decline — unless the query was hand-written.
  const usable = best && (best.score > 0 || (trust && !NOT_A_PHOTO.test(best.r.title)));
  return { pick: usable ? best.r : null, score: best?.score ?? 0, blocked };
}

async function search(query) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`http://127.0.0.1:${port}/suggest-images?q=${encodeURIComponent(query)}&n=14`);
    if (response.ok) return response.json();
    const message = await response.text();
    if (!/rate-limit|429/i.test(message)) throw new Error(message);
    const backoff = 4000 * (attempt + 1);
    console.log(`    rate-limited, waiting ${backoff / 1000}s`);
    await sleep(backoff);
  }
  throw new Error("still rate-limited after backing off");
}

const browser = await chromium.launch();
const page = await browser.newPage();
// Same origin as the app, so /fetch-image is reachable and the canvas is clean.
await page.goto(`http://127.0.0.1:${port}/host`, { waitUntil: "load" });

let added = 0;
let skipped = 0;
let filtered = 0;
const weak = [];
const chosen = [];

for (const [index, raw] of set.items.entries()) {
  const label = typeof raw === "string" ? raw : raw.label;
  const existing = typeof raw === "string" ? undefined : raw.art;
  if (fixes && !(label in fixes)) {
    skipped++;
    continue;
  }
  if (!fixes && existing && !force) {
    skipped++;
    continue;
  }

  const query = fixes ? fixes[label] : hint ? `${label} ${hint}` : label;
  process.stdout.write(`  ${label} … `);
  let results;
  try {
    results = await search(query);
  } catch (err) {
    console.log(`search failed (${err.message})`);
    continue;
  }
  const { pick, score, blocked } = bestOf(results, label, Boolean(fixes));
  if (!pick) {
    console.log(`nothing usable${blocked ? ` (${blocked} filtered)` : ""}`);
    continue;
  }
  if (score <= 0 && !fixes) {
    // Nothing named the thing, so anything chosen here is a guess.
    console.log(`WEAK MATCH — skipped (best was "${pick.title.slice(0, 40)}")`);
    weak.push(label);
    continue;
  }

  const stored = await page.evaluate(async (thumb) => {
    const response = await fetch(`/fetch-image?url=${encodeURIComponent(thumb)}`);
    if (!response.ok) throw new Error(await response.text());
    const bitmap = await createImageBitmap(await response.blob());
    const SIZE = 320;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    const scale = Math.min(SIZE / bitmap.width, SIZE / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.85));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const id = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { id, data: btoa(binary), size: bytes.length };
  }, pick.thumb);

  await send({ type: "images/put", id: stored.id, data: stored.data });
  set.items[index] = { label, art: { image: stored.id, source: pick.source, license: pick.license } };
  chosen.push({ label, title: pick.title, license: pick.license });
  added++;
  filtered += blocked;
  console.log(`${pick.title.slice(0, 40)} (${pick.license}, ${Math.round(stored.size / 1024)}KB)`);
  await sleep(PACE_MS);
}

await browser.close();

const items = set.items
  .map((i) => (typeof i === "string" ? JSON.stringify(i) : `\n    ${JSON.stringify(i)}`))
  .join(", ");
await writeFile(
  path,
  `{\n  "id": ${JSON.stringify(set.id)},\n  "title": ${JSON.stringify(set.title)},\n` +
    `  "subtitle": ${JSON.stringify(set.subtitle)},\n  "items": [${items}\n  ],\n` +
    `  "updatedAt": ${set.updatedAt ?? 0}\n}\n`,
);

console.log(`\n${added} attached, ${skipped} already had art → ${path}`);
if (filtered) console.log(`${filtered} candidate(s) filtered as unsuitable`);
if (weak.length) console.log(`no confident match, left blank: ${weak.join(", ")}`);

/**
 * Regenerate the exclusion list inside docs/generating-bracket-sets.md.
 * The round-two prompt tells the AI what NOT to propose, so it goes stale and
 * actively wrong the moment sets are added or removed. Run after changing them:
 *   npm run sets
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SETS_DIR = "data/sets";
const DOC = "docs/generating-bracket-sets.md";
const START = "overlaps with any of these:\n\n";
const END = "\n\nThese categories are FULL.";

const files = (await readdir(SETS_DIR)).filter((f) => f.endsWith(".json"));
const sets = await Promise.all(
  files.map(async (f) => JSON.parse(await readFile(join(SETS_DIR, f), "utf8"))),
);
sets.sort((a, b) => a.title.localeCompare(b.title));

const listing = sets.map((s) => `- ${s.title} — ${s.items.slice(0, 4).join(", ")}…`).join("\n");

const doc = await readFile(DOC, "utf8");
const from = doc.indexOf(START);
const to = doc.indexOf(END);
if (from === -1 || to === -1) {
  console.error(`[sets] anchors not found in ${DOC} — regenerate by hand`);
  process.exit(1);
}

await writeFile(DOC, doc.slice(0, from + START.length) + listing + doc.slice(to));
console.log(`[sets] ${DOC} updated with ${sets.length} sets`);

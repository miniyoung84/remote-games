import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppState, BracketSet } from "../shared/types.js";

const DATA_DIR = join(process.cwd(), "data");
const SETS_DIR = join(DATA_DIR, "sets");
const STATE_FILE = join(DATA_DIR, "state.json");

export const emptyState = (): AppState => ({
  roster: [],
  playedAt: {},
  currentPickerId: null,
  selectedMatchId: null,
  game: null,
});

function ensureDirs(): void {
  mkdirSync(SETS_DIR, { recursive: true });
}

/**
 * Written via a temp file and rename so an interrupted save can't leave a
 * truncated state.json behind — this file is the only copy of a multi-day
 * bracket.
 */
function writeJson(path: string, value: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

export function loadState(): AppState {
  ensureDirs();
  if (!existsSync(STATE_FILE)) return emptyState();
  try {
    return { ...emptyState(), ...JSON.parse(readFileSync(STATE_FILE, "utf8")) };
  } catch (err) {
    console.warn(`[store] ignoring unreadable state.json: ${String(err)}`);
    return emptyState();
  }
}

export function saveState(state: AppState): void {
  ensureDirs();
  writeJson(STATE_FILE, state);
}

export function loadSets(): BracketSet[] {
  ensureDirs();
  const sets: BracketSet[] = [];
  for (const file of readdirSync(SETS_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      sets.push(JSON.parse(readFileSync(join(SETS_DIR, file), "utf8")) as BracketSet);
    } catch (err) {
      console.warn(`[store] skipping malformed set ${file}: ${String(err)}`);
    }
  }
  return sets.sort((a, b) => a.title.localeCompare(b.title));
}

export function saveSet(set: BracketSet): void {
  ensureDirs();
  writeJson(join(SETS_DIR, `${set.id}.json`), set);
}

export function deleteSet(id: string): void {
  const path = join(SETS_DIR, `${id}.json`);
  if (existsSync(path)) rmSync(path);
}

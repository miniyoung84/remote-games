import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppState, ItemSet, DraftTopic } from "../shared/types.js";

const DATA_DIR = join(process.cwd(), "data");
const SETS_DIR = join(DATA_DIR, "sets");
const IMAGES_DIR = join(DATA_DIR, "images");
const STATE_FILE = join(DATA_DIR, "state.json");

export const emptyState = (): AppState => ({
  roster: [],
  playedAt: {},
  currentPickerId: null,
  soundOn: false,
  game: null,
});

function ensureDirs(): void {
  mkdirSync(SETS_DIR, { recursive: true });
  mkdirSync(IMAGES_DIR, { recursive: true });
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

/** Draft prompts. A missing or broken file just means an empty shelf. */
export function loadDraftTopics(): DraftTopic[] {
  const path = join(DATA_DIR, "draft-topics.json");
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((t): t is DraftTopic => Boolean(t) && typeof t.topic === "string" && t.topic.trim().length > 0)
      .map((t) => ({ topic: t.topic.trim(), subtitle: String(t.subtitle ?? "").trim(), rounds: Math.min(12, Math.max(1, Math.round(Number(t.rounds)) || 2)) }));
  } catch (err) {
    console.warn(`[store] ignoring unreadable draft-topics.json: ${String(err)}`);
    return [];
  }
}

export function loadSets(): ItemSet[] {
  ensureDirs();
  const sets: ItemSet[] = [];
  for (const file of readdirSync(SETS_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      sets.push(JSON.parse(readFileSync(join(SETS_DIR, file), "utf8")) as ItemSet);
    } catch (err) {
      console.warn(`[store] skipping malformed set ${file}: ${String(err)}`);
    }
  }
  return sets.sort((a, b) => a.title.localeCompare(b.title));
}

export function saveSet(set: ItemSet): void {
  ensureDirs();
  writeJson(join(SETS_DIR, `${set.id}.json`), set);
}

export function deleteSet(id: string): void {
  const path = join(SETS_DIR, `${id}.json`);
  if (existsSync(path)) rmSync(path);
}

/* ---------- images ---------- */

/**
 * Images are content-addressed: the id is a hash of the bytes, computed by the
 * uploader. Identical images dedupe for free, ids can't collide across packs,
 * and nothing has to invent filenames. The strict id shape is also what keeps
 * a crafted id from walking out of the directory.
 */
const IMAGE_ID = /^[a-f0-9]{32}$/;

export const isImageId = (id: string): boolean => IMAGE_ID.test(id);

export function saveImage(id: string, bytes: Buffer): boolean {
  if (!isImageId(id)) return false;
  ensureDirs();
  const path = join(IMAGES_DIR, `${id}.webp`);
  if (existsSync(path)) return true; // same bytes, same id — nothing to do
  writeFileSync(path, bytes);
  return true;
}

export function readImage(id: string): Buffer | null {
  if (!isImageId(id)) return null;
  const path = join(IMAGES_DIR, `${id}.webp`);
  return existsSync(path) ? readFileSync(path) : null;
}

export function hasImage(id: string): boolean {
  return isImageId(id) && existsSync(join(IMAGES_DIR, `${id}.webp`));
}

export function deleteImage(id: string): void {
  if (!isImageId(id)) return;
  const path = join(IMAGES_DIR, `${id}.webp`);
  if (existsSync(path)) rmSync(path);
}

export function listImages(): string[] {
  ensureDirs();
  return readdirSync(IMAGES_DIR)
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.replace(/\.webp$/, ""));
}

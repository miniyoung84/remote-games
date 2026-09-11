import { readItems } from "../shared/items.js";
import type { Game, ItemSet, Pack, RawItem } from "../shared/types.js";
import { deleteImage, hasImage, isImageId, listImages, loadSets, readImage, saveImage, saveSet } from "./store.js";

export const PACK_FORMAT = "remote-games-pack";
export const PACK_VERSION = 1;

/** Every image id referenced by a set's item art. */
function imageIds(items: RawItem[]): string[] {
  return readItems(items)
    .map((i) => (i.art && "image" in i.art ? i.art.image : null))
    .filter((id): id is string => Boolean(id) && isImageId(id!));
}

/**
 * A pack is one self-contained JSON file: the sets plus the bytes of every
 * image they reference. No zip, no external files, so it survives being emailed
 * or dropped in a chat.
 */
export function buildPack(name: string, setIds: string[] | null): Pack {
  const all = loadSets();
  const sets = setIds ? all.filter((s) => setIds.includes(s.id)) : all;

  const images: Pack["images"] = {};
  for (const set of sets) {
    for (const id of imageIds(set.items)) {
      if (images[id]) continue;
      const bytes = readImage(id);
      if (bytes) images[id] = bytes.toString("base64");
    }
  }

  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    name: name.trim() || "remote-games pack",
    createdAt: Date.now(),
    sets,
    images,
  };
}

export type ImportResult = { sets: number; renamed: number; images: number; skipped: number };

function uniqueId(desired: string, taken: Set<string>): string {
  if (!taken.has(desired)) return desired;
  for (let n = 2; n < 500; n++) {
    const candidate = `${desired}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${desired}-${Date.now().toString(36)}`;
}

/**
 * Importing never overwrites an existing set — a clashing id is renamed, so
 * someone else's pack can't quietly replace a set you've edited.
 */
export function importPack(pack: Pack): ImportResult {
  const result: ImportResult = { sets: 0, renamed: 0, images: 0, skipped: 0 };
  const taken = new Set(loadSets().map((s) => s.id));

  for (const [id, base64] of Object.entries(pack.images ?? {})) {
    if (!isImageId(id)) {
      result.skipped++;
      continue;
    }
    if (hasImage(id)) continue;
    if (saveImage(id, Buffer.from(base64, "base64"))) result.images++;
  }

  for (const raw of pack.sets ?? []) {
    if (!raw?.id || !raw.title || !Array.isArray(raw.items) || readItems(raw.items).length < 2) {
      result.skipped++;
      continue;
    }
    const id = uniqueId(raw.id, taken);
    if (id !== raw.id) result.renamed++;
    taken.add(id);

    const set: ItemSet = {
      id,
      title: String(raw.title),
      subtitle: String(raw.subtitle ?? ""),
      items: raw.items,
      updatedAt: Date.now(),
    };
    saveSet(set);
    result.sets++;
  }

  return result;
}

/** Image files on disk that no set references any more. */
/**
 * Stored images nothing references. The running game counts: a picture found
 * mid-game lives only on the game's copy of the item, and pruning it while
 * that game is up would strip it off the board.
 */
export function orphanImages(game: Game | null = null): string[] {
  const used = new Set(loadSets().flatMap((s) => imageIds(s.items)));
  const live = game?.kind === "draft" ? game.picks : game ? game.items : [];
  for (const id of imageIds(live)) used.add(id);
  return listImages().filter((id) => !used.has(id));
}

/** Delete images nothing references. Returns how many went. */
export function pruneImages(game: Game | null = null): number {
  const orphans = orphanImages(game);
  for (const id of orphans) deleteImage(id);
  return orphans.length;
}

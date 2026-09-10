import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readItems } from "../shared/items.js";
import type { Pack } from "../shared/types.js";
import { hasImage, isImageId, loadSets, saveImage } from "./store.js";

const PACKS_DIR = join(process.cwd(), "packs");

/**
 * Restore image bytes that the committed sets reference but that aren't on
 * disk, pulling them out of any pack in packs/.
 *
 * data/images/ is gitignored — images people drop in themselves have unknown
 * provenance and shouldn't be republished — so a fresh clone gets sets with art
 * ids pointing at nothing. Since images are content-addressed, the ids already
 * match, and restoring is just writing the bytes; no set is touched and nothing
 * is renamed or duplicated.
 *
 * Idempotent, and does nothing at all once everything is present.
 */
export function restoreMissingImages(): number {
  const wanted = new Set<string>();
  for (const set of loadSets()) {
    for (const item of readItems(set.items)) {
      const art = item.art;
      if (art && "image" in art && isImageId(art.image) && !hasImage(art.image)) wanted.add(art.image);
    }
  }
  if (!wanted.size || !existsSync(PACKS_DIR)) return 0;

  let restored = 0;
  for (const file of readdirSync(PACKS_DIR)) {
    if (!file.endsWith(".json") || !wanted.size) continue;
    let pack: Pack;
    try {
      pack = JSON.parse(readFileSync(join(PACKS_DIR, file), "utf8")) as Pack;
    } catch {
      console.warn(`[restore] skipping unreadable pack ${file}`);
      continue;
    }
    for (const [id, base64] of Object.entries(pack.images ?? {})) {
      // Only ids a set actually asks for, so a pack can't drop in loose files.
      if (!wanted.has(id)) continue;
      if (saveImage(id, Buffer.from(base64, "base64"))) {
        wanted.delete(id);
        restored++;
      }
    }
  }

  if (restored) console.log(`[restore] recovered ${restored} image${restored === 1 ? "" : "s"} from packs/`);
  if (wanted.size) console.warn(`[restore] ${wanted.size} image(s) referenced by a set are missing from every pack`);
  return restored;
}

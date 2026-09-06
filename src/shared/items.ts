import type { Item, RawItem } from "./types.js";

/**
 * Set files accept either a bare string or an object with art, so the 28 sets
 * written before art existed keep working untouched and art is added only where
 * it earns its place.
 */
export function readItems(raw: RawItem[]): Item[] {
  return raw
    .map((entry, i) =>
      typeof entry === "string"
        ? { id: `i${i}`, label: entry.trim() }
        : { id: `i${i}`, label: entry.label.trim(), art: entry.art },
    )
    .filter((item) => item.label.length > 0);
}

export function itemLabels(raw: RawItem[]): string[] {
  return readItems(raw).map((i) => i.label);
}

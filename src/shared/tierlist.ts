import type { Item, Person, Tier, TierBoard, TierGame, TierRow } from "./types.js";

/** Classic tier colors — flat, saturated, and unmistakable under compression. */
export const DEFAULT_TIERS: Tier[] = [
  { id: "s", label: "S", color: "#ff5d5d" },
  { id: "a", label: "A", color: "#ff9f45" },
  { id: "b", label: "B", color: "#ffd93d" },
  { id: "c", label: "C", color: "#6bd968" },
  { id: "d", label: "D", color: "#5aa9e6" },
  { id: "f", label: "F", color: "#a78bfa" },
];

/**
 * Rebuild the board from the ordered placement log, the same way the bracket
 * replays its decisions. An item's tier is simply its most recent placement, so
 * moving something is just another placement and undo is "drop the last one".
 */
export function buildBoard(game: TierGame, roster: Person[]): TierBoard {
  const byId = new Map(game.items.map((i) => [i.id, i]));

  const tierOf = new Map<string, string>();
  const landedAt = new Map<string, number>();
  game.placements.forEach((p, index) => {
    tierOf.set(p.itemId, p.tierId);
    landedAt.set(p.itemId, index);
  });

  // Within a row, order by when each item landed there, so a moved item joins
  // the end of its new tier rather than teleporting into the middle.
  const rows: TierRow[] = game.tiers.map((tier) => ({
    ...tier,
    items: game.items
      .filter((i) => tierOf.get(i.id) === tier.id)
      .sort((a, b) => (landedAt.get(a.id) ?? 0) - (landedAt.get(b.id) ?? 0)),
  }));

  const unplaced = game.order
    .map((id) => byId.get(id))
    .filter((i): i is Item => i !== undefined && !tierOf.has(i.id));

  const lastIndex = game.placements.length - 1;
  const last = lastIndex >= 0 ? game.placements[lastIndex] : null;
  let from: string | null = null;
  if (last) {
    for (let i = lastIndex - 1; i >= 0; i--) {
      if (game.placements[i].itemId === last.itemId) {
        from = game.placements[i].tierId;
        break;
      }
    }
  }

  return {
    title: game.title,
    subtitle: game.subtitle,
    mode: game.mode,
    rows,
    unplaced,
    // In open mode the picker chooses; there is no item on offer.
    current: game.mode === "open" ? null : (unplaced[0] ?? null),
    phase: game.finished ? "final" : unplaced.length ? "placing" : "revising",
    last:
      last && byId.has(last.itemId)
        ? {
            item: byId.get(last.itemId)!,
            tierId: last.tierId,
            by: roster.find((p) => p.id === last.by)?.name ?? null,
            from,
          }
        : null,
    placed: tierOf.size,
    total: game.items.length,
  };
}

/** Items already on the board, for the host's move picker. */
export function placedItems(board: TierBoard): { item: Item; tierId: string }[] {
  return board.rows.flatMap((row) => row.items.map((item) => ({ item, tierId: row.id })));
}

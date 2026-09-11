import type { BoardPick, DraftBoard, DraftColumn, DraftGame, Person } from "./types.js";

/**
 * Build the board from the pick log, the way the other games rebuild from
 * theirs. Undo stays "drop the last pick".
 *
 * Columns cover everyone present *plus* anyone who has already drafted, so a
 * person leaving the meeting never erases what they picked. Absent drafters are
 * marked rather than removed.
 */
export function buildDraftBoard(game: DraftGame, roster: Person[]): DraftBoard {
  const byPerson = new Map<string, BoardPick[]>();
  const slotsInRound = new Map<number, number>();
  const numbered: BoardPick[] = [];
  for (const pick of game.picks) {
    const list = byPerson.get(pick.by) ?? [];
    const round = list.length + 1;
    const slot = (slotsInRound.get(round) ?? 0) + 1;
    slotsInRound.set(round, slot);
    const entry = { ...pick, round, slot };
    list.push(entry);
    byPerson.set(pick.by, list);
    numbered.push(entry);
  }

  const columns: DraftColumn[] = roster
    .filter((person) => person.present || byPerson.has(person.id))
    .map((person) => ({
      personId: person.id,
      name: person.name,
      present: person.present,
      picks: byPerson.get(person.id) ?? [],
    }));

  const last = numbered[numbered.length - 1] ?? null;

  return {
    topic: game.topic,
    subtitle: game.subtitle,
    rounds: game.rounds,
    columns,
    last: last
      ? { ...last, byName: roster.find((p) => p.id === last.by)?.name ?? "someone" }
      : null,
    total: game.picks.length,
    target: game.rounds * columns.filter((c) => c.present).length,
    phase: game.finished ? "final" : "drafting",
  };
}

/** "1.01", "2.10" — the number a pick is announced by. */
export function pickNumber(pick: { round: number; slot: number }): string {
  return `${pick.round}.${String(pick.slot).padStart(2, "0")}`;
}

/** Drafters with the fewest picks — who the host should call on next. */
export function behindInPicks(board: DraftBoard): string[] {
  const active = board.columns.filter((c) => c.present);
  if (!active.length) return [];
  const fewest = Math.min(...active.map((c) => c.picks.length));
  return active.filter((c) => c.picks.length === fewest).map((c) => c.personId);
}

/** Case-insensitive match, so the host can be warned before drafting a dupe. */
export function alreadyDrafted(board: DraftBoard, label: string): string | null {
  const needle = label.trim().toLowerCase();
  if (!needle) return null;
  for (const column of board.columns) {
    if (column.picks.some((p) => p.label.toLowerCase() === needle)) return column.name;
  }
  return null;
}

import type { Bracket, BracketGame, Entrant, Item, Match, Person } from "./types.js";

/** Smallest power of two >= n, minimum 2. */
export function bracketSize(n: number): number {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

/**
 * Seed numbers in bracket-position order, paired strongest-against-weakest and
 * running straight down the board: 1v16, 2v15, 3v14, and so on. Every
 * first-round pairing sums to size + 1, and adjacent pairs count inward, so the
 * board reads in order instead of jumping about.
 *
 * This is not the standard tournament layout, which interleaves the halves
 * (1v16, 8v9, 4v13, 5v12, ...) so the top two seeds cannot meet before the
 * final. That protection is worth nothing here: sets are shuffled by default,
 * so seed 1 is whoever happened to be drawn first, and there is no strength for
 * the structure to preserve. Legibility on a screen a dozen people are squinting
 * at is worth more.
 *
 * It also puts the byes where people expect them. Byes fall on the highest
 * seeds, so with this order they cluster at the top of the board rather than
 * scattering through it.
 */
export function seedOrder(size: number): number[] {
  const order: number[] = [];
  for (let seed = 1; seed <= size / 2; seed++) order.push(seed, size + 1 - seed);
  return order;
}

function shuffled<T>(input: T[]): T[] {
  const out = input.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Lay entrants out into bracket positions. Sets that aren't a power of two are
 * padded with byes, and standard seeding puts every bye against a real entrant
 * — a bye never faces another bye, so no match is ever empty on both sides.
 */
export function seedPositions(entrants: Item[], shuffle: boolean): (string | null)[] {
  const ordered = shuffle ? shuffled(entrants) : entrants.slice();
  const size = bracketSize(ordered.length);
  return seedOrder(size).map((seed) => ordered[seed - 1]?.id ?? null);
}

export function matchId(round: number, slot: number): string {
  return `r${round}m${slot}`;
}

/**
 * Rebuild the whole board from seeding + the decision log. Pure and
 * deterministic: the same game always produces the same bracket.
 */
export function buildBracket(game: BracketGame, roster: Person[]): Bracket {
  // Attach each entrant's true tournament seed. `positions` is in bracket
  // order, so the seed living at position i is seedOrder()[i] — NOT i + 1,
  // which is merely where it sits on the page.
  const order = seedOrder(game.positions.length);
  const seedOf = new Map<string, number>();
  game.positions.forEach((id, index) => {
    if (id) seedOf.set(id, order[index]);
  });
  const byId = new Map<string, Entrant>(game.items.map((e) => [e.id, { ...e, seed: seedOf.get(e.id) }]));
  const nameOf = (id: string | null) =>
    id ? (roster.find((p) => p.id === id)?.name ?? null) : null;

  const size = game.positions.length;
  const rounds: Match[][] = [];
  for (let round = 0, count = size / 2; count >= 1; round++, count /= 2) {
    const matches: Match[] = [];
    for (let slot = 0; slot < count; slot++) {
      matches.push({
        id: matchId(round, slot),
        round,
        slot,
        a: null,
        b: null,
        winner: null,
        decidedBy: null,
        bye: false,
      });
    }
    rounds.push(matches);
  }

  for (const match of rounds[0]) {
    match.a = byId.get(game.positions[match.slot * 2] ?? "") ?? null;
    match.b = byId.get(game.positions[match.slot * 2 + 1] ?? "") ?? null;
  }

  const advance = (match: Match) => {
    const winner = match.winner === "a" ? match.a : match.b;
    const next = rounds[match.round + 1];
    if (!next) return;
    const target = next[Math.floor(match.slot / 2)];
    if (match.slot % 2 === 0) target.a = winner;
    else target.b = winner;
  };

  // Byes resolve themselves before anyone picks anything.
  for (const match of rounds[0]) {
    if (match.a && !match.b) match.winner = "a";
    else if (!match.a && match.b) match.winner = "b";
    else continue;
    match.bye = true;
    advance(match);
  }

  const all = new Map(rounds.flat().map((m) => [m.id, m]));
  for (const decision of game.decisions) {
    const match = all.get(decision.matchId);
    if (!match || match.winner) continue;
    match.winner = decision.winner;
    match.decidedBy = nameOf(decision.by);
    advance(match);
  }

  const final = rounds[rounds.length - 1][0];
  const champion = final.winner ? (final.winner === "a" ? final.a : final.b) : null;

  return { title: game.title, subtitle: game.subtitle, rounds, champion };
}

/** Matches with both competitors known and no winner yet, in bracket order. */
export function readyMatches(bracket: Bracket): Match[] {
  return bracket.rounds.flat().filter((m) => m.a && m.b && !m.winner);
}

/**
 * The matchup on screen: whatever the host explicitly selected, falling back to
 * the next one in bracket order. A stale or already-decided selection falls
 * back too, so the display can never get stuck on a finished match.
 */
export function resolveCurrentMatch(bracket: Bracket, selectedId: string | null): Match | null {
  const ready = readyMatches(bracket);
  if (selectedId) {
    const picked = ready.find((m) => m.id === selectedId);
    if (picked) return picked;
  }
  return ready[0] ?? null;
}

export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 1) return "Final";
  if (fromEnd === 2) return "Semifinals";
  if (fromEnd === 3) return "Quarterfinals";
  return `Round of ${2 ** fromEnd}`;
}

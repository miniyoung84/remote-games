import assert from "node:assert/strict";
import { test } from "node:test";
import { bracketSize, buildBracket, readyMatches, seedOrder, seedPositions } from "./bracket.js";
import type { BracketGame, Decision, Item } from "./types.js";

const entrants = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i}`, label: `Item ${i + 1}` }));

const gameOf = (n: number, decisions: Decision[] = []): BracketGame => ({
  kind: "bracket",
  setId: "test",
  title: "Test",
  subtitle: "",
  items: entrants(n),
  positions: seedPositions(entrants(n), false),
  decisions,
  selectedMatchId: null,
  startedAt: 0,
});

test("bracketSize rounds up to a power of two", () => {
  assert.equal(bracketSize(2), 2);
  assert.equal(bracketSize(5), 8);
  assert.equal(bracketSize(8), 8);
  assert.equal(bracketSize(9), 16);
});

test("seedOrder pairs strongest against weakest, running down the board", () => {
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedOrder(8), [1, 8, 2, 7, 3, 6, 4, 5]);
  // Deliberately not the interleaved tournament layout — see seedOrder.
  assert.deepEqual(seedOrder(16), [1, 16, 2, 15, 3, 14, 4, 13, 5, 12, 6, 11, 7, 10, 8, 9]);
});

test("a full bracket has n-1 matchups and no byes", () => {
  const bracket = buildBracket(gameOf(16), []);
  assert.equal(bracket.rounds.length, 4);
  assert.equal(bracket.rounds[0].length, 8);
  assert.equal(bracket.rounds.flat().filter((m) => m.bye).length, 0);
  assert.equal(readyMatches(bracket).length, 8);
});

test("byes land on the top seeds and cluster at the top of the board", () => {
  // 11 entrants in a 16 slot bracket: seeds 12-16 are byes, so the top five
  // pairings should each be a walkover and they should be the first five.
  const first = buildBracket(gameOf(11), []).rounds[0];
  assert.deepEqual(first.map((m) => m.bye), [true, true, true, true, true, false, false, false]);
  assert.deepEqual(
    first.filter((m) => m.bye).map((m) => m.a?.seed),
    [1, 2, 3, 4, 5],
    "the byes go to the highest seeds",
  );
});

test("byes resolve themselves and never face each other", () => {
  // Every non-power-of-two size, not just a convenient one.
  for (let n = 3; n <= 64; n++) {
    const bracket = buildBracket(gameOf(n), []);
    for (const match of bracket.rounds[0]) {
      assert.ok(match.a || match.b, `size ${n}: match with two byes`);
      if (!match.a || !match.b) {
        assert.ok(match.winner, `size ${n}: unresolved bye`);
        assert.ok(match.bye);
      }
    }
    // A bracket of n entrants always takes exactly n-1 real decisions.
    assert.equal(readyMatches(bracket).length + countDecidable(bracket), n - 1);
  }
});

function countDecidable(bracket: ReturnType<typeof buildBracket>): number {
  // Matches not yet reachable because an upstream match is undecided.
  return bracket.rounds.flat().filter((m) => !m.winner && !(m.a && m.b)).length;
}

test("playing every matchup produces a champion, and undo takes it back", () => {
  const decisions: Decision[] = [];
  let game = gameOf(11);

  for (let guard = 0; guard < 50; guard++) {
    const bracket = buildBracket(game, []);
    const next = readyMatches(bracket)[0];
    if (!next) break;
    decisions.push({ matchId: next.id, winner: "a", by: null, at: 0 });
    game = { ...game, decisions: decisions.slice() };
  }

  const finished = buildBracket(game, []);
  assert.ok(finished.champion, "expected a champion");
  assert.equal(decisions.length, 10, "11 entrants should take 10 picks");

  const undone = buildBracket({ ...game, decisions: decisions.slice(0, -1) }, []);
  assert.equal(undone.champion, null);
  assert.equal(readyMatches(undone).length, 1);
});

test("decisions are attributed to the roster person who made them", () => {
  const game = gameOf(4, [{ matchId: "r0m0", winner: "a", by: "p1", at: 0 }]);
  const bracket = buildBracket(game, [{ id: "p1", name: "Chase", present: true }]);
  assert.equal(bracket.rounds[0][0].decidedBy, "Chase");
});

test("slots carry true tournament seeds, not page positions", () => {
  const bracket = buildBracket(gameOf(16), []);
  const first = bracket.rounds[0];
  // Standard seeding: the top seed draws the bottom seed, and every first-round
  // pairing sums to 17. Page position is deliberately not the seed.
  assert.deepEqual(
    first.map((m) => [m.a?.seed, m.b?.seed]),
    [[1, 16], [2, 15], [3, 14], [4, 13], [5, 12], [6, 11], [7, 10], [8, 9]],
  );
  for (const m of first) assert.equal((m.a?.seed ?? 0) + (m.b?.seed ?? 0), 17);
});

test("seeds follow list order when unshuffled, and survive into later rounds", () => {
  const game = gameOf(8);
  assert.equal(game.items[0].label, "Item 1");
  const bracket = buildBracket(game, []);
  // Seed 1 is the first item in the set file.
  assert.equal(bracket.rounds[0][0].a?.label, "Item 1");
  assert.equal(bracket.rounds[0][0].a?.seed, 1);

  const played = buildBracket(
    { ...game, decisions: [{ matchId: "r0m0", winner: "a", by: null, at: 0 }] },
    [],
  );
  assert.equal(played.rounds[1][0].a?.seed, 1, "seed carries into the next round");
});

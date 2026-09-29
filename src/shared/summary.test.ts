import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDraftBoard } from "./draft.js";
import { buildBoard, DEFAULT_TIERS } from "./tierlist.js";
import { summarize } from "./summary.js";
import type { DraftGame, Person, TierGame } from "./types.js";

const people: Person[] = [
  { id: "p0", name: "Chase", present: true },
  { id: "p1", name: "Dana", present: true },
  { id: "p2", name: "Yuki", present: true },
];

test("a draft summarizes as one line per drafter, numbered", () => {
  const game: DraftGame = {
    kind: "draft",
    topic: "Heist crew",
    subtitle: "2 each",
    rounds: 2,
    picks: [
      { id: "d0", label: "Danny Ocean", by: "p1", at: 0 },
      { id: "d1", label: "A getaway driver", by: "p0", at: 1 },
      { id: "d2", label: "Rusty", by: "p1", at: 2 },
    ],
    finished: true,
    startedAt: 0,
  };
  const text = summarize({ kind: "draft", board: buildDraftBoard(game, people), actionCount: 3 });
  assert.equal(
    text,
    ["Heist crew — 2 each", "Chase: A getaway driver (1.02)", "Dana: Danny Ocean (1.01), Rusty (2.01)"].join("\n"),
    "Yuki picked nothing and is left out",
  );
});

test("a tier list summarizes by row, skipping empty rows", () => {
  const game: TierGame = {
    kind: "tierlist",
    mode: "queue",
    setId: "x",
    title: "Best Fruit",
    subtitle: "",
    items: [
      { id: "a", label: "Apple" },
      { id: "b", label: "Banana" },
      { id: "c", label: "Cherry" },
    ],
    order: ["a", "b", "c"],
    tiers: DEFAULT_TIERS,
    placements: [
      { itemId: "a", tierId: "s", by: "p0", at: 0 },
      { itemId: "b", tierId: "s", by: "p1", at: 1 },
    ],
    finished: false,
    startedAt: 0,
  };
  const board = buildBoard(game, people);
  assert.equal(summarize({ kind: "tierlist", board, remaining: 1 }), ["Best Fruit", "S: Apple, Banana", "Unplaced: Cherry"].join("\n"));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { alreadyDrafted, behindInPicks, buildDraftBoard } from "./draft.js";
import type { DraftGame, DraftPick, Person } from "./types.js";

const people = (...names: string[]): Person[] =>
  names.map((name, i) => ({ id: `p${i}`, name, present: true }));

const pick = (label: string, by: string, i = 0): DraftPick => ({ id: `d${i}`, label, by, at: i });

const gameOf = (picks: DraftPick[] = [], rounds = 2, finished = false): DraftGame => ({
  kind: "draft",
  topic: "Zombie apocalypse squad",
  subtitle: "",
  rounds,
  picks,
  finished,
  startedAt: 0,
});

test("every present person gets a column, empty to start", () => {
  const board = buildDraftBoard(gameOf(), people("Chase", "Dana", "Yuki"));
  assert.equal(board.columns.length, 3);
  assert.ok(board.columns.every((c) => c.picks.length === 0));
  assert.equal(board.total, 0);
  assert.equal(board.target, 6, "rounds x drafters");
  assert.equal(board.phase, "drafting");
});

test("picks land in their drafter's column, in order", () => {
  const board = buildDraftBoard(
    gameOf([pick("Crowbar", "p0", 0), pick("Dog", "p1", 1), pick("Rope", "p0", 2)]),
    people("Chase", "Dana"),
  );
  assert.deepEqual(board.columns[0].picks.map((p) => p.label), ["Crowbar", "Rope"]);
  assert.deepEqual(board.columns[1].picks.map((p) => p.label), ["Dog"]);
  assert.equal(board.total, 3);
  assert.equal(board.last?.byName, "Chase");
  assert.equal(board.last?.label, "Rope");
});

test("someone who leaves keeps their column and their picks", () => {
  const roster = people("Chase", "Dana");
  roster[1].present = false;
  const board = buildDraftBoard(gameOf([pick("Dog", "p1")]), roster);
  assert.equal(board.columns.length, 2, "absent drafter is kept");
  assert.equal(board.columns[1].present, false, "but marked away");
  assert.deepEqual(board.columns[1].picks.map((p) => p.label), ["Dog"]);
  assert.equal(board.target, 2, "and no longer counted toward the target");
});

test("an absent person with no picks gets no column", () => {
  const roster = people("Chase", "Dana");
  roster[1].present = false;
  assert.equal(buildDraftBoard(gameOf(), roster).columns.length, 1);
});

test("behindInPicks names whoever the host should call on", () => {
  const roster = people("Chase", "Dana", "Yuki");
  assert.deepEqual(behindInPicks(buildDraftBoard(gameOf(), roster)), ["p0", "p1", "p2"]);
  const board = buildDraftBoard(gameOf([pick("Crowbar", "p0"), pick("Dog", "p1")]), roster);
  assert.deepEqual(behindInPicks(board), ["p2"], "only the person with fewest");
});

test("duplicates are reported, not prevented", () => {
  const board = buildDraftBoard(gameOf([pick("Crowbar", "p0")]), people("Chase", "Dana"));
  assert.equal(alreadyDrafted(board, "crowbar"), "Chase", "case-insensitive");
  assert.equal(alreadyDrafted(board, "  CROWBAR "), "Chase", "and trimmed");
  assert.equal(alreadyDrafted(board, "Machete"), null);
  assert.equal(alreadyDrafted(board, "  "), null);
});

test("undo is dropping the last pick", () => {
  const picks = [pick("Crowbar", "p0", 0), pick("Dog", "p1", 1)];
  const after = buildDraftBoard(gameOf(picks.slice(0, -1)), people("Chase", "Dana"));
  assert.equal(after.total, 1);
  assert.equal(after.columns[1].picks.length, 0);
  assert.equal(after.last?.label, "Crowbar");
});

test("finishing marks the board final", () => {
  assert.equal(buildDraftBoard(gameOf([], 2, true), people("Chase")).phase, "final");
});

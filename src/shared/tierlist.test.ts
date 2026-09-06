import assert from "node:assert/strict";
import { test } from "node:test";
import { readItems } from "./items.js";
import { DEFAULT_TIERS, buildBoard, placedItems } from "./tierlist.js";
import type { Item, Placement, TierGame } from "./types.js";

const items = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: `i${i}`, label: `Item ${i + 1}` }));

const gameOf = (n: number, placements: Placement[] = [], finished = false): TierGame => ({
  kind: "tierlist",
  setId: "test",
  title: "Test",
  subtitle: "",
  items: items(n),
  order: items(n).map((i) => i.id),
  tiers: DEFAULT_TIERS,
  placements,
  finished,
  startedAt: 0,
});

const place = (itemId: string, tierId: string, by: string | null = null): Placement => ({
  itemId,
  tierId,
  by,
  at: 0,
});

test("items start unplaced and are offered in queue order", () => {
  const board = buildBoard(gameOf(6), []);
  assert.equal(board.unplaced.length, 6);
  assert.equal(board.current?.id, "i0");
  assert.equal(board.placed, 0);
  assert.equal(board.phase, "placing");
  assert.ok(board.rows.every((r) => r.items.length === 0));
});

test("placing an item removes it from the queue and fills a row", () => {
  const board = buildBoard(gameOf(3, [place("i0", "s")]), []);
  assert.deepEqual(board.rows.find((r) => r.id === "s")?.items.map((i) => i.id), ["i0"]);
  assert.equal(board.current?.id, "i1", "the queue advances");
  assert.equal(board.placed, 1);
});

test("a second placement moves an item rather than duplicating it", () => {
  const board = buildBoard(gameOf(3, [place("i0", "d"), place("i0", "s")]), []);
  assert.deepEqual(board.rows.find((r) => r.id === "s")?.items.map((i) => i.id), ["i0"]);
  assert.equal(board.rows.find((r) => r.id === "d")?.items.length, 0, "left its old tier");
  assert.equal(board.placed, 1, "a move is not a new placement");
  assert.equal(board.last?.from, "d", "the move records where it came from");
});

test("a first placement reports no origin, so the display can tell them apart", () => {
  const board = buildBoard(gameOf(3, [place("i0", "b")]), []);
  assert.equal(board.last?.from, null);
});

test("placements are attributed to the roster person who made them", () => {
  const board = buildBoard(gameOf(3, [place("i0", "a", "p1")]), [
    { id: "p1", name: "Chase", present: true },
  ]);
  assert.equal(board.last?.by, "Chase");
});

test("a moved item joins the end of its new row", () => {
  const board = buildBoard(
    gameOf(3, [place("i0", "s"), place("i1", "s"), place("i2", "d"), place("i2", "s")]),
    [],
  );
  assert.deepEqual(board.rows.find((r) => r.id === "s")?.items.map((i) => i.id), ["i0", "i1", "i2"]);
});

test("the board enters revising once everything is placed, and final when called", () => {
  const all = items(3).map((i, n) => place(i.id, DEFAULT_TIERS[n].id));
  assert.equal(buildBoard(gameOf(3, all), []).phase, "revising");
  assert.equal(buildBoard(gameOf(3, all, true), []).phase, "final");
  assert.equal(buildBoard(gameOf(3, all.slice(0, 2)), []).phase, "placing");
});

test("undo is dropping the last placement", () => {
  const placements = [place("i0", "d"), place("i0", "s")];
  const moved = buildBoard(gameOf(2, placements), []);
  const undone = buildBoard(gameOf(2, placements.slice(0, -1)), []);
  assert.equal(moved.rows.find((r) => r.id === "s")?.items.length, 1);
  assert.equal(undone.rows.find((r) => r.id === "d")?.items.length, 1, "back where it was");
  assert.equal(undone.rows.find((r) => r.id === "s")?.items.length, 0);
});

test("placedItems lists everything on the board with its tier", () => {
  const board = buildBoard(gameOf(3, [place("i0", "s"), place("i2", "c")]), []);
  assert.deepEqual(placedItems(board), [
    { item: board.rows[0].items[0], tierId: "s" },
    { item: board.rows[3].items[0], tierId: "c" },
  ]);
});

test("set items may be plain strings or objects with art", () => {
  const parsed = readItems(["Mango", { label: "Teal", art: { color: "#14b8a6" } }, "  ", ""]);
  assert.equal(parsed.length, 2, "blank entries are dropped");
  assert.deepEqual(parsed[0], { id: "i0", label: "Mango" });
  assert.deepEqual(parsed[1].art, { color: "#14b8a6" });
});

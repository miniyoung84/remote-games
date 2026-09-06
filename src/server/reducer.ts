import { buildBracket, readyMatches, resolveCurrentMatch, seedPositions } from "../shared/bracket.js";
import { readItems } from "../shared/items.js";
import { DEFAULT_TIERS, buildBoard } from "../shared/tierlist.js";
import type { Action } from "../shared/protocol.js";
import type { AppState, Item, ItemSet } from "../shared/types.js";
import { deleteSet, isImageId, loadSets, saveImage, saveSet } from "./store.js";
import { importPack, pruneImages } from "./packs.js";

function slug(input: string): string {
  const base = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return base || `set-${Date.now().toString(36)}`;
}

function personId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function shuffled<T>(input: T[]): T[] {
  const out = input.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type ReduceResult = { state: AppState; setsChanged: boolean; error?: string; notice?: string };

export function reduce(state: AppState, action: Action): ReduceResult {
  const ok = (next: AppState, setsChanged = false): ReduceResult => ({ state: next, setsChanged });
  const fail = (message: string): ReduceResult => ({ state, setsChanged: false, error: message });

  switch (action.type) {
    case "roster/add": {
      const name = action.name.trim();
      if (!name) return fail("Name is required.");
      if (state.roster.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        return fail(`${name} is already on the roster.`);
      }
      return ok({ ...state, roster: [...state.roster, { id: personId(), name, present: true }] });
    }

    case "roster/remove":
      return ok({
        ...state,
        roster: state.roster.filter((p) => p.id !== action.id),
        currentPickerId: state.currentPickerId === action.id ? null : state.currentPickerId,
      });

    case "roster/setPresent":
      return ok({
        ...state,
        roster: state.roster.map((p) => (p.id === action.id ? { ...p, present: action.present } : p)),
        currentPickerId:
          !action.present && state.currentPickerId === action.id ? null : state.currentPickerId,
      });

    case "roster/setCurrent":
      return ok({ ...state, currentPickerId: action.id });

    case "game/start": {
      const set = loadSets().find((s) => s.id === action.setId);
      if (!set) return fail("That set no longer exists.");
      const items = readItems(set.items);
      if (items.length < 2) return fail("A game needs at least 2 entries.");

      const playedAt = { ...state.playedAt, [set.id]: Date.now() };
      const shared = { setId: set.id, title: set.title, subtitle: set.subtitle, items, startedAt: Date.now() };

      if (action.kind === "tierlist") {
        return ok({
          ...state,
          playedAt,
          currentPickerId: null,
          game: {
            kind: "tierlist",
            ...shared,
            order: (action.shuffle ? shuffled(items) : items).map((i) => i.id),
            tiers: DEFAULT_TIERS,
            placements: [],
            finished: false,
          },
        });
      }

      return ok({
        ...state,
        playedAt,
        currentPickerId: null,
        game: {
          kind: "bracket",
          ...shared,
          positions: seedPositions(items, action.shuffle),
          decisions: [],
          selectedMatchId: null,
        },
      });
    }

    case "bracket/decide": {
      const game = state.game;
      if (game?.kind !== "bracket") return fail("No bracket in progress.");
      const match = readyMatches(buildBracket(game, state.roster)).find((m) => m.id === action.matchId);
      if (!match) return fail("That matchup isn't ready to be decided.");

      return ok({
        ...state,
        // Clearing the picker forces the host to call on the next person rather
        // than silently attributing two picks to the same one.
        currentPickerId: null,
        game: {
          ...game,
          selectedMatchId: null,
          decisions: [
            ...game.decisions,
            { matchId: action.matchId, winner: action.winner, by: state.currentPickerId, at: Date.now() },
          ],
        },
      });
    }

    case "bracket/selectMatch": {
      const game = state.game;
      if (game?.kind !== "bracket") return fail("No bracket in progress.");
      return ok({ ...state, game: { ...game, selectedMatchId: action.matchId } });
    }

    case "tier/place": {
      const game = state.game;
      if (game?.kind !== "tierlist") return fail("No tier list in progress.");
      if (game.finished) return fail("This tier list is finished.");
      if (!game.items.some((i) => i.id === action.itemId)) return fail("Unknown item.");
      if (!game.tiers.some((t) => t.id === action.tierId)) return fail("Unknown tier.");

      const board = buildBoard(game, state.roster);
      const alreadyThere = board.rows.find((r) => r.id === action.tierId)?.items.some((i) => i.id === action.itemId);
      if (alreadyThere) return fail("That item is already in that tier.");

      return ok({
        ...state,
        currentPickerId: null,
        game: {
          ...game,
          placements: [
            ...game.placements,
            { itemId: action.itemId, tierId: action.tierId, by: state.currentPickerId, at: Date.now() },
          ],
        },
      });
    }

    case "tier/finish": {
      const game = state.game;
      if (game?.kind !== "tierlist") return fail("No tier list in progress.");
      if (buildBoard(game, state.roster).unplaced.length) return fail("Some items still aren't placed.");
      return ok({ ...state, game: { ...game, finished: true } });
    }

    case "game/undo": {
      const game = state.game;
      if (!game) return fail("No game in progress.");

      if (game.kind === "bracket") {
        if (!game.decisions.length) return fail("Nothing to undo.");
        const undone = game.decisions[game.decisions.length - 1];
        return ok({
          ...state,
          // Put the matchup back on screen and the picker back on the clock.
          currentPickerId: undone.by,
          game: { ...game, decisions: game.decisions.slice(0, -1), selectedMatchId: undone.matchId },
        });
      }

      if (game.finished) return ok({ ...state, game: { ...game, finished: false } });
      if (!game.placements.length) return fail("Nothing to undo.");
      const undone = game.placements[game.placements.length - 1];
      return ok({
        ...state,
        currentPickerId: undone.by,
        game: { ...game, placements: game.placements.slice(0, -1) },
      });
    }

    case "game/reset":
      return ok({ ...state, game: null, currentPickerId: null });

    case "sets/save": {
      const title = action.set.title.trim();
      if (!title) return fail("A set needs a title.");
      const items = readItems(action.set.items);
      if (items.length < 2) return fail("A set needs at least 2 entries.");
      if (new Set(items.map((i) => i.label.toLowerCase())).size !== items.length) {
        return fail("Entries must be unique.");
      }

      const set: ItemSet = {
        id: action.set.id?.trim() || slug(title),
        title,
        subtitle: action.set.subtitle.trim(),
        items: action.set.items,
        updatedAt: Date.now(),
      };
      saveSet(set);
      return ok(state, true);
    }

    case "images/put": {
      if (!isImageId(action.id)) return fail("Bad image id.");
      const bytes = Buffer.from(action.data, "base64");
      // 320x320 WebP is tens of kilobytes; anything near this cap isn't one.
      if (!bytes.length || bytes.length > 2_000_000) return fail("Image is too large.");
      if (!saveImage(action.id, bytes)) return fail("Could not store that image.");
      return ok(state);
    }

    case "packs/import": {
      const pack = action.pack;
      if (!pack || !Array.isArray(pack.sets)) return fail("That doesn't look like a pack file.");
      const r = importPack(pack);
      if (!r.sets) return fail("No usable sets in that pack.");
      const parts = [`Imported ${r.sets} set${r.sets === 1 ? "" : "s"}`];
      if (r.images) parts.push(`${r.images} image${r.images === 1 ? "" : "s"}`);
      if (r.renamed) parts.push(`${r.renamed} renamed to avoid clashes`);
      if (r.skipped) parts.push(`${r.skipped} skipped`);
      return { state, setsChanged: true, notice: parts.join(" · ") };
    }

    case "sound/toggle":
      return ok({ ...state, soundOn: !state.soundOn });

    case "images/prune": {
      const gone = pruneImages();
      return { state, setsChanged: true, notice: gone ? `Removed ${gone} unused image${gone === 1 ? "" : "s"}.` : "Nothing to remove." };
    }

    case "sets/delete":
      // A game already under way keeps running; it holds its own copy of the
      // items and no longer needs the set it came from.
      deleteSet(action.id);
      return ok(state, true);
  }
}

export function bracketCurrentMatchId(state: AppState): string | null {
  if (state.game?.kind !== "bracket") return null;
  const bracket = buildBracket(state.game, state.roster);
  return resolveCurrentMatch(bracket, state.game.selectedMatchId)?.id ?? null;
}

export type { Item };

import { buildBracket, readyMatches, resolveCurrentMatch, seedPositions } from "../shared/bracket.js";
import type { AppState, BracketSet, Entrant } from "../shared/types.js";
import type { Action } from "../shared/protocol.js";
import { deleteSet, loadSets, saveSet } from "./store.js";

function slug(input: string): string {
  const base = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return base || `set-${Date.now().toString(36)}`;
}

function personId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export type ReduceResult = { state: AppState; setsChanged: boolean; error?: string };

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
      return ok({
        ...state,
        roster: [...state.roster, { id: personId(), name, present: true }],
      });
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
        // Someone marked absent should not stay on the clock.
        currentPickerId:
          !action.present && state.currentPickerId === action.id ? null : state.currentPickerId,
      });

    case "roster/setCurrent":
      return ok({ ...state, currentPickerId: action.id });

    case "game/start": {
      const set = loadSets().find((s) => s.id === action.setId);
      if (!set) return fail("That bracket set no longer exists.");
      const items = set.items.map((s) => s.trim()).filter(Boolean);
      if (items.length < 2) return fail("A bracket needs at least 2 entries.");

      const entrants: Entrant[] = items.map((label, i) => ({ id: `e${i}`, label }));
      return ok({
        ...state,
        selectedMatchId: null,
        // Recorded here rather than on the set file, which is committed content.
        playedAt: { ...state.playedAt, [set.id]: Date.now() },
        game: {
          setId: set.id,
          title: set.title,
          subtitle: set.subtitle,
          entrants,
          positions: seedPositions(entrants, action.shuffle),
          decisions: [],
          startedAt: Date.now(),
        },
      });
    }

    case "game/decide": {
      const game = state.game;
      if (!game) return fail("No game in progress.");
      const bracket = buildBracket(game, state.roster);
      const match = readyMatches(bracket).find((m) => m.id === action.matchId);
      if (!match) return fail("That matchup isn't ready to be decided.");

      return ok({
        ...state,
        selectedMatchId: null,
        // Clearing the picker forces the host to call on the next person
        // rather than silently attributing two picks to the same one.
        currentPickerId: null,
        game: {
          ...game,
          decisions: [
            ...game.decisions,
            {
              matchId: action.matchId,
              winner: action.winner,
              by: state.currentPickerId,
              at: Date.now(),
            },
          ],
        },
      });
    }

    case "game/selectMatch":
      return ok({ ...state, selectedMatchId: action.matchId });

    case "game/undo": {
      const game = state.game;
      if (!game || game.decisions.length === 0) return fail("Nothing to undo.");
      const decisions = game.decisions.slice(0, -1);
      const undone = game.decisions[game.decisions.length - 1];
      return ok({
        ...state,
        game: { ...game, decisions },
        // Put the matchup back on screen and the picker back on the clock.
        selectedMatchId: undone.matchId,
        currentPickerId: undone.by,
      });
    }

    case "game/reset":
      return ok({ ...state, game: null, selectedMatchId: null, currentPickerId: null });

    case "sets/save": {
      const title = action.set.title.trim();
      if (!title) return fail("A set needs a title.");
      const items = action.set.items.map((s) => s.trim()).filter(Boolean);
      if (items.length < 2) return fail("A set needs at least 2 entries.");
      if (new Set(items.map((i) => i.toLowerCase())).size !== items.length) {
        return fail("Entries must be unique.");
      }

      const set: BracketSet = {
        id: action.set.id?.trim() || slug(title),
        title,
        subtitle: action.set.subtitle.trim(),
        items,
        updatedAt: Date.now(),
      };
      saveSet(set);
      return ok(state, true);
    }

    case "sets/delete": {
      deleteSet(action.id);
      // A game already under way keeps running; it holds its own copy of the
      // entrants and no longer needs the set it came from.
      return ok(state, true);
    }
  }
}

export function currentMatchId(state: AppState): string | null {
  if (!state.game) return null;
  const bracket = buildBracket(state.game, state.roster);
  return resolveCurrentMatch(bracket, state.selectedMatchId)?.id ?? null;
}

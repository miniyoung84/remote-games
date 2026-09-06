import { buildBracket, readyMatches, resolveCurrentMatch } from "../shared/bracket.js";
import { buildBoard } from "../shared/tierlist.js";
import type { AppState, DisplayGame, DisplayState, HostGame, HostState } from "../shared/types.js";
import { loadSets } from "./store.js";
import { orphanImages } from "./packs.js";

/**
 * Role projection is mandatory rather than optional — see docs/architecture.md.
 * The display receives only what it renders, so a game that does hold secrets
 * can't leak them by default.
 */

function displayGame(state: AppState): DisplayGame | null {
  const game = state.game;
  if (!game) return null;

  if (game.kind === "bracket") {
    const bracket = buildBracket(game, state.roster);
    return {
      kind: "bracket",
      phase: bracket.champion ? "complete" : "playing",
      bracket,
      currentMatchId: resolveCurrentMatch(bracket, game.selectedMatchId)?.id ?? null,
      actionCount: game.decisions.length,
    };
  }

  return { kind: "tierlist", board: buildBoard(game, state.roster), actionCount: game.placements.length };
}

export function projectDisplay(state: AppState): DisplayState {
  const picker = state.roster.find((p) => p.id === state.currentPickerId) ?? null;
  return {
    presentCount: state.roster.filter((p) => p.present).length,
    soundOn: state.soundOn,
    pickerName: picker?.name ?? null,
    game: displayGame(state),
  };
}

function hostGame(state: AppState): HostGame | null {
  const game = state.game;
  if (!game) return null;

  if (game.kind === "bracket") {
    const bracket = buildBracket(game, state.roster);
    return {
      kind: "bracket",
      phase: bracket.champion ? "complete" : "playing",
      bracket,
      currentMatchId: resolveCurrentMatch(bracket, game.selectedMatchId)?.id ?? null,
      remaining: readyMatches(bracket).length,
    };
  }

  const board = buildBoard(game, state.roster);
  return { kind: "tierlist", board, remaining: board.unplaced.length };
}

export function projectHost(state: AppState): HostState {
  const game = state.game;
  const canUndo =
    game?.kind === "bracket"
      ? game.decisions.length > 0
      : game?.kind === "tierlist"
        ? game.placements.length > 0 || game.finished
        : false;

  return {
    roster: state.roster,
    soundOn: state.soundOn,
    currentPickerId: state.currentPickerId,
    sets: loadSets().map((set) => ({ ...set, lastPlayedAt: state.playedAt[set.id] })),
    unusedImages: orphanImages().length,
    canUndo,
    game: hostGame(state),
  };
}

import { buildBracket, readyMatches, resolveCurrentMatch } from "../shared/bracket.js";
import type { AppState, DisplayState, HostState } from "../shared/types.js";
import { loadSets } from "./store.js";

/**
 * Role projection is mandatory rather than optional — see docs/architecture.md.
 * Brackets hold no secrets today, but the display still receives only what it
 * renders, so a game that does hold secrets can't leak them by default.
 */

function phaseOf(state: AppState): "idle" | "playing" | "complete" {
  if (!state.game) return "idle";
  return buildBracket(state.game, state.roster).champion ? "complete" : "playing";
}

export function projectDisplay(state: AppState): DisplayState {
  if (!state.game) {
    return {
      phase: "idle",
      bracket: null,
      currentMatchId: null,
      pickerName: null,
      presentCount: state.roster.filter((p) => p.present).length,
      decisionCount: 0,
    };
  }

  const bracket = buildBracket(state.game, state.roster);
  const picker = state.roster.find((p) => p.id === state.currentPickerId) ?? null;

  return {
    phase: bracket.champion ? "complete" : "playing",
    bracket,
    currentMatchId: resolveCurrentMatch(bracket, state.selectedMatchId)?.id ?? null,
    pickerName: picker?.name ?? null,
    presentCount: state.roster.filter((p) => p.present).length,
    decisionCount: state.game.decisions.length,
  };
}

export function projectHost(state: AppState): HostState {
  const bracket = state.game ? buildBracket(state.game, state.roster) : null;

  return {
    phase: phaseOf(state),
    bracket,
    currentMatchId: bracket ? (resolveCurrentMatch(bracket, state.selectedMatchId)?.id ?? null) : null,
    roster: state.roster,
    currentPickerId: state.currentPickerId,
    sets: loadSets().map((set) => ({ ...set, lastPlayedAt: state.playedAt[set.id] })),
    canUndo: (state.game?.decisions.length ?? 0) > 0,
    remaining: bracket ? readyMatches(bracket).length : 0,
  };
}

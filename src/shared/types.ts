/** A single competitor. `seed` is its bracket position, filled in by buildBracket. */
export type Entrant = { id: string; label: string; seed?: number };

/** An editable bracket set — the content an operator authors in the host view. */
export type BracketSet = {
  id: string;
  title: string;
  subtitle: string;
  items: string[];
  updatedAt: number;
};

/**
 * A set as the host view sees it: the stored set plus runtime play history.
 * `lastPlayedAt` lives in state.json, never in the set file — set files are
 * committed content and shouldn't churn every time someone plays.
 */
export type BracketSetView = BracketSet & { lastPlayedAt?: number };

/** One recorded pick. `by` is a roster person id, or null for an auto-resolved bye. */
export type Decision = {
  matchId: string;
  winner: "a" | "b";
  by: string | null;
  at: number;
};

/**
 * A game is stored as its seeding plus an ordered decision log, never as a
 * derived board. Undo is then "drop the last decision and rebuild", which
 * cannot leave the bracket in a half-updated state.
 */
export type Game = {
  setId: string;
  title: string;
  subtitle: string;
  entrants: Entrant[];
  /** Bracket positions, length is a power of two. null is a bye. */
  positions: (string | null)[];
  decisions: Decision[];
  startedAt: number;
};

export type Person = { id: string; name: string; present: boolean };

export type AppState = {
  roster: Person[];
  /** setId -> when it was last started. */
  playedAt: Record<string, number>;
  currentPickerId: string | null;
  selectedMatchId: string | null;
  game: Game | null;
};

/* ---------- derived board ---------- */

export type Match = {
  id: string;
  round: number;
  slot: number;
  a: Entrant | null;
  b: Entrant | null;
  winner: "a" | "b" | null;
  /** Roster person who made the call, resolved to a display name. */
  decidedBy: string | null;
  /** True when this match resolved itself because one side was a bye. */
  bye: boolean;
};

export type Bracket = {
  title: string;
  subtitle: string;
  rounds: Match[][];
  champion: Entrant | null;
};

/* ---------- projections ---------- */

export type DisplayState = {
  phase: "idle" | "playing" | "complete";
  bracket: Bracket | null;
  currentMatchId: string | null;
  pickerName: string | null;
  presentCount: number;
  decisionCount: number;
};

export type HostState = {
  phase: "idle" | "playing" | "complete";
  bracket: Bracket | null;
  currentMatchId: string | null;
  roster: Person[];
  currentPickerId: string | null;
  sets: BracketSetView[];
  canUndo: boolean;
  remaining: number;
};

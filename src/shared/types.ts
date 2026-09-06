/**
 * Optional visual for an item. Art lives on the *set*, not on a game, so every
 * game that uses sets gets it. `image` is reserved — the upload pipeline isn't
 * built yet, and nothing renders it.
 */
export type Art = { emoji: string } | { color: string } | { image: string };

/** One thing that can be ranked, drafted or knocked out. */
export type Item = { id: string; label: string; art?: Art };

/** An item in a bracket, carrying its tournament seed. */
export type Entrant = Item & { seed?: number };

/** Set files may write an item as a bare string or as an object with art. */
export type RawItem = string | { label: string; art?: Art };

export type ItemSet = {
  id: string;
  title: string;
  subtitle: string;
  items: RawItem[];
  updatedAt: number;
};

/**
 * A set as the host view sees it: the stored set plus runtime play history.
 * `lastPlayedAt` lives in state.json, never in the set file — set files are
 * committed content and shouldn't churn every time someone plays.
 */
export type ItemSetView = ItemSet & { lastPlayedAt?: number };

export type Person = { id: string; name: string; present: boolean };

export type GameKind = "bracket" | "tierlist";

/* ---------- bracket ---------- */

/** One recorded pick. `by` is a roster person id, or null for a bye. */
export type Decision = { matchId: string; winner: "a" | "b"; by: string | null; at: number };

export type BracketGame = {
  kind: "bracket";
  setId: string;
  title: string;
  subtitle: string;
  items: Item[];
  /** Bracket positions, length is a power of two. null is a bye. */
  positions: (string | null)[];
  decisions: Decision[];
  selectedMatchId: string | null;
  startedAt: number;
};

export type Match = {
  id: string;
  round: number;
  slot: number;
  a: Entrant | null;
  b: Entrant | null;
  winner: "a" | "b" | null;
  decidedBy: string | null;
  bye: boolean;
};

export type Bracket = { title: string; subtitle: string; rounds: Match[][]; champion: Entrant | null };

/* ---------- tier list ---------- */

export type Tier = { id: string; label: string; color: string };

/** One placement. Moving an already-placed item appends another of these. */
export type Placement = { itemId: string; tierId: string; by: string | null; at: number };

export type TierGame = {
  kind: "tierlist";
  setId: string;
  title: string;
  subtitle: string;
  items: Item[];
  /** The order items are offered in. */
  order: string[];
  tiers: Tier[];
  placements: Placement[];
  /** Set when the host calls it, which locks the board for the final reveal. */
  finished: boolean;
  startedAt: number;
};

export type TierRow = Tier & { items: Item[] };

/** What just happened, so the display can animate it. `from` set = a move. */
export type TierAction = {
  item: Item;
  tierId: string;
  by: string | null;
  from: string | null;
};

export type TierBoard = {
  title: string;
  subtitle: string;
  rows: TierRow[];
  unplaced: Item[];
  /** The item on offer this turn. */
  current: Item | null;
  phase: "placing" | "revising" | "final";
  last: TierAction | null;
  placed: number;
  total: number;
};

export type Game = BracketGame | TierGame;

export type AppState = {
  roster: Person[];
  /** setId -> when it was last started. */
  playedAt: Record<string, number>;
  currentPickerId: string | null;
  game: Game | null;
};

/* ---------- projections ---------- */

export type DisplayGame =
  | { kind: "bracket"; phase: "playing" | "complete"; bracket: Bracket; currentMatchId: string | null; actionCount: number }
  | { kind: "tierlist"; board: TierBoard; actionCount: number };

export type DisplayState = {
  presentCount: number;
  pickerName: string | null;
  game: DisplayGame | null;
};

export type HostGame =
  | { kind: "bracket"; phase: "playing" | "complete"; bracket: Bracket; currentMatchId: string | null; remaining: number }
  | { kind: "tierlist"; board: TierBoard; remaining: number };

export type HostState = {
  roster: Person[];
  currentPickerId: string | null;
  sets: ItemSetView[];
  canUndo: boolean;
  game: HostGame | null;
};

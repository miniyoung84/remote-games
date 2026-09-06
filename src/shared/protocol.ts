import type { DisplayState, GameKind, HostState, ItemSet } from "./types.js";

export type Role = "display" | "host";

export type Action =
  | { type: "roster/add"; name: string }
  | { type: "roster/remove"; id: string }
  | { type: "roster/setPresent"; id: string; present: boolean }
  | { type: "roster/setCurrent"; id: string | null }
  | { type: "game/start"; setId: string; kind: GameKind; shuffle: boolean }
  | { type: "game/undo" }
  | { type: "game/reset" }
  | { type: "bracket/decide"; matchId: string; winner: "a" | "b" }
  | { type: "bracket/selectMatch"; matchId: string | null }
  | { type: "tier/place"; itemId: string; tierId: string }
  | { type: "tier/finish" }
  | { type: "sets/save"; set: ItemSet }
  | { type: "sets/delete"; id: string };

export type ClientMessage = { type: "action"; action: Action };

export type ServerMessage =
  | { type: "state"; role: "display"; state: DisplayState }
  | { type: "state"; role: "host"; state: HostState }
  | { type: "error"; message: string };

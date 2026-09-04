import type { BracketSet, DisplayState, HostState } from "./types.js";

export type Role = "display" | "host";

export type Action =
  | { type: "roster/add"; name: string }
  | { type: "roster/remove"; id: string }
  | { type: "roster/setPresent"; id: string; present: boolean }
  | { type: "roster/setCurrent"; id: string | null }
  | { type: "game/start"; setId: string; shuffle: boolean }
  | { type: "game/decide"; matchId: string; winner: "a" | "b" }
  | { type: "game/selectMatch"; matchId: string | null }
  | { type: "game/undo" }
  | { type: "game/reset" }
  | { type: "sets/save"; set: BracketSet }
  | { type: "sets/delete"; id: string };

export type ClientMessage = { type: "action"; action: Action };

export type ServerMessage =
  | { type: "state"; role: "display"; state: DisplayState }
  | { type: "state"; role: "host"; state: HostState }
  | { type: "error"; message: string };

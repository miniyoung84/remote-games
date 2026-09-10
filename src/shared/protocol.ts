import type { Art, DisplayState, GameKind, HostState, ItemSet, Pack, TierMode } from "./types.js";

export type Role = "display" | "host";

export type Action =
  | { type: "roster/add"; name: string }
  | { type: "roster/remove"; id: string }
  | { type: "roster/setPresent"; id: string; present: boolean }
  | { type: "roster/setCurrent"; id: string | null }
  | { type: "game/start"; setId: string; kind: GameKind; shuffle: boolean; mode?: TierMode }
  | { type: "game/undo" }
  | { type: "game/reset" }
  | { type: "bracket/decide"; matchId: string; winner: "a" | "b" }
  | { type: "bracket/selectMatch"; matchId: string | null }
  | { type: "tier/place"; itemId: string; tierId: string }
  | { type: "tier/add"; label: string }
  | { type: "tier/setArt"; itemId: string; art: Art }
  | { type: "tier/finish" }
  | { type: "draft/start"; topic: string; subtitle: string; rounds: number }
  | { type: "draft/pick"; label: string }
  | { type: "draft/finish" }
  | { type: "sets/save"; set: ItemSet }
  | { type: "sets/delete"; id: string }
  | { type: "images/put"; id: string; data: string }
  | { type: "packs/import"; pack: Pack }
  | { type: "images/prune" }
  | { type: "sound/toggle" };

export type ClientMessage = { type: "action"; action: Action };

export type ServerMessage =
  | { type: "state"; role: "display"; state: DisplayState }
  | { type: "state"; role: "host"; state: HostState }
  | { type: "error"; message: string }
  | { type: "notice"; message: string };

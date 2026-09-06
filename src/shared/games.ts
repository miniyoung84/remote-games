/**
 * The games this repo can run. The menu at `/` renders this list.
 *
 * To add a game: give it an entry with `status: "ready"` and the two routes it
 * serves. Everything else — the menu card, the live status line, the window
 * launcher — follows from that.
 */
export type GameEntry = {
  id: string;
  title: string;
  blurb: string;
  /** Players needed for it to work, shown on the card. */
  players: string;
  status: "ready" | "planned";
  display?: string;
  host?: string;
};

export const GAMES: GameEntry[] = [
  {
    id: "bracket",
    title: "Bracket",
    blurb:
      "Sixteen things enter, one leaves. Each person decides a single matchup on their turn — no voting, no debate. Spans several standups.",
    players: "3+ · any order · pausable",
    status: "ready",
    display: "/display",
    host: "/host?game=bracket",
  },
  {
    id: "tierlist",
    title: "Tier List",
    blurb:
      "Rank sixteen things from S down to D. On your turn you place one item — or move one somebody else placed, which is where the arguing starts.",
    players: "3+ · any order · pausable",
    status: "ready",
    display: "/display",
    host: "/host?game=tierlist",
  },
];

export const readyGames = (): GameEntry[] => GAMES.filter((g) => g.status === "ready");

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
    host: "/host",
  },
];

export const readyGames = (): GameEntry[] => GAMES.filter((g) => g.status === "ready");

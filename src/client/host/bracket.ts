import { roundName } from "../../shared/bracket.js";
import type { Action } from "../../shared/protocol.js";
import type { Bracket, HostGame, HostState, Match } from "../../shared/types.js";
import { button, text, type HostDom, type HostPanel } from "./panel.js";

type Game = Extract<HostGame, { kind: "bracket" }>;

export function mountBracketPanel(dom: HostDom, send: (a: Action) => void): HostPanel {
  const findMatch = (bracket: Bracket, id: string | null): Match | null =>
    id ? (bracket.rounds.flat().find((m) => m.id === id) ?? null) : null;

  function renderNow(state: HostState, game: Game): void {
    dom.now.replaceChildren();
    if (game.phase === "complete") {
      dom.now.append(text("div", "champion-note", `Champion: ${game.bracket.champion?.label ?? ""}`));
    }

    const match = findMatch(game.bracket, game.currentMatchId);
    if (match) {
      const picker = state.roster.find((p) => p.id === state.currentPickerId);
      const line = text("div", picker ? "picker-line" : "picker-line none");
      line.append(text("span", "round", roundName(match.round, game.bracket.rounds.length)));
      line.append(document.createTextNode(picker ? `${picker.name} is picking` : "Nobody on the clock — tap a name below"));
      dom.now.append(line);

      const choices = text("div", "choices");
      for (const side of ["a", "b"] as const) {
        const entrant = side === "a" ? match.a : match.b;
        const node = button("", "choice");
        node.append(text("span", "key", side === "a" ? "A  ←" : "B  →"));
        node.append(document.createTextNode(entrant?.label ?? "—"));
        node.onclick = () => send({ type: "bracket/decide", matchId: match.id, winner: side });
        choices.append(node);
      }
      dom.now.append(choices);
    } else if (game.phase !== "complete") {
      dom.now.append(text("p", "empty", "No matchup ready."));
    }

    if (game.remaining > 1) {
      const skip = button("Different matchup", "ghost");
      skip.onclick = () => {
        const ready = game.bracket.rounds.flat().filter((m) => m.a && m.b && !m.winner);
        const index = ready.findIndex((m) => m.id === game.currentMatchId);
        send({ type: "bracket/selectMatch", matchId: ready[(index + 1) % ready.length]?.id ?? null });
      };
      const row = text("div", "row");
      row.append(skip);
      dom.now.append(row);
    }
  }

  function renderBoard(game: Game): void {
    dom.board.replaceChildren();
    game.bracket.rounds.forEach((matches, round) => {
      const column = text("div", "h-round");
      column.append(text("div", "h-round-name", roundName(round, game.bracket.rounds.length)));
      const list = text("div", "h-round-matches");

      for (const match of matches) {
        const node = text("div", "h-match");
        if (match.bye) node.classList.add("bye");
        if (match.id === game.currentMatchId) node.classList.add("current");
        if (match.a && match.b && !match.winner) {
          node.classList.add("ready");
          node.title = "Jump to this matchup";
          node.onclick = () => send({ type: "bracket/selectMatch", matchId: match.id });
        }
        for (const side of ["a", "b"] as const) {
          const entrant = side === "a" ? match.a : match.b;
          const slot = text("div", "h-slot", entrant?.label ?? "—");
          if (entrant) slot.classList.add("filled");
          if (match.winner === side) slot.classList.add("winner");
          else if (match.winner) slot.classList.add("loser");
          node.append(slot);
        }
        list.append(node);
      }
      column.append(list);
      dom.board.append(column);
    });
  }

  return {
    render: (state, game) => {
      if (game.kind !== "bracket") return;
      renderNow(state, game);
      renderBoard(game);
    },
    key: (event, _state, game) => {
      if (game.kind !== "bracket" || !game.currentMatchId) return false;
      const key = event.key.toLowerCase();
      const side = key === "a" || key === "arrowleft" ? "a" : key === "b" || key === "arrowright" ? "b" : null;
      if (!side) return false;
      send({ type: "bracket/decide", matchId: game.currentMatchId, winner: side });
      return true;
    },
    unmount: () => {},
  };
}

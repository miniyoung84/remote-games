import { roundName } from "../../shared/bracket.js";
import type { Bracket, DisplayGame, DisplayState, Match } from "../../shared/types.js";
import { artNode, resetProgress, setHeader, setProgress, stagger, text, type DisplayDom, type Renderer, type Sound } from "./dom.js";

type BracketGame = Extract<DisplayGame, { kind: "bracket" }>;
type Frame = { state: DisplayState; game: BracketGame };

const DECISION_HOLD_MS = 1500;

export function mountBracket(dom: DisplayDom, sound: Sound): Renderer<Frame> {
  const matchNodes = new Map<string, HTMLElement>();
  let boardKey = "";
  let shown: Frame | null = null;
  let queued: Frame | null = null;
  let animating = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function buildBoard(bracket: Bracket): void {
    dom.board.replaceChildren();
    matchNodes.clear();
    dom.board.dataset.size = String(bracket.rounds[0].length);

    bracket.rounds.forEach((matches, round) => {
      const column = text("div", "round");
      const heading = text("div", "round-name");
      heading.append(text("span", "", roundName(round, bracket.rounds.length)));
      column.append(heading);

      const list = text("div", "round-matches");
      for (const match of matches) {
        const node = text("div", "match");
        node.append(text("div", "slot"), text("div", "slot"));
        matchNodes.set(match.id, node);
        list.append(node);
      }
      column.append(list);
      dom.board.append(column);
    });
    stagger(dom.board.querySelectorAll<HTMLElement>(".round"), "entering", 70);
  }

  function paintSlot(slot: HTMLElement, match: Match, side: "a" | "b"): void {
    const entrant = side === "a" ? match.a : match.b;
    slot.className = "slot";
    const art = entrant ? artNode(entrant, "chip") : null;
    slot.replaceChildren(
      text("span", "seed", entrant?.seed ? String(entrant.seed) : ""),
      ...(art ? [art] : []),
      text("span", "label", entrant?.label ?? "—"),
    );
    if (!entrant) return;
    slot.classList.add("filled");
    if (match.winner === side) slot.classList.add("winner");
    else if (match.winner) slot.classList.add("loser");
  }

  function renderBoard(frame: Frame, justDecided: string | null): void {
    const bracket = frame.game.bracket;
    const key = `${bracket.title}:${bracket.rounds[0].length}`;
    if (key !== boardKey) {
      boardKey = key;
      buildBoard(bracket);
    }

    for (const match of bracket.rounds.flat()) {
      const node = matchNodes.get(match.id);
      if (!node) continue;
      const [a, b] = node.children as unknown as HTMLElement[];
      paintSlot(a, match, "a");
      paintSlot(b, match, "b");
      node.classList.toggle("bye", match.bye);
      node.classList.toggle("current", match.id === frame.game.currentMatchId && !animating);

      if (match.id === justDecided) {
        node.classList.remove("just-decided");
        void node.offsetWidth;
        node.classList.add("just-decided");
      }
    }
  }

  function findMatch(bracket: Bracket, id: string | null): Match | null {
    return id ? (bracket.rounds.flat().find((m) => m.id === id) ?? null) : null;
  }

  function duel(match: Match, decided: boolean): HTMLElement {
    const wrap = text("div", "duel");
    for (const side of ["a", "b"] as const) {
      const entrant = side === "a" ? match.a : match.b;
      const label = entrant?.label ?? "—";
      const node = text("div", `duel-side ${side}`);
      const art = entrant ? artNode(entrant, "hero") : null;
      node.append(text("span", "duel-key", side.toUpperCase()));
      if (art) node.append(art);
      node.append(text("span", "duel-name", label));
      if (label.length > 32) node.classList.add("xlong");
      else if (label.length > 22) node.classList.add("long");
      if (art) node.classList.add("has-art");
      if (decided && match.winner) node.classList.add(match.winner === side ? "won" : "lost");
      wrap.append(node);
      if (side === "a") wrap.append(text("div", "duel-vs", "VS"));
    }
    return wrap;
  }

  function renderBand(frame: Frame, decidedMatch: Match | null): void {
    const bracket = frame.game.bracket;
    const match = decidedMatch ?? findMatch(bracket, frame.game.currentMatchId);
    if (!match) {
      dom.band.replaceChildren(text("div", "band-message", frame.game.phase === "complete" ? "That's the bracket." : ""));
      return;
    }

    const meta = text("div", "band-meta");
    meta.append(text("span", "band-round", roundName(match.round, bracket.rounds.length)));
    if (decidedMatch) {
      const winner = match.winner === "a" ? match.a : match.b;
      meta.append(
        text("span", "band-picker", match.decidedBy ? `${match.decidedBy} picked ${winner?.label ?? ""}` : `${winner?.label ?? ""} advances`),
      );
    } else if (frame.state.pickerName) {
      meta.append(text("span", "band-picker", `${frame.state.pickerName} is picking`));
    }
    dom.band.replaceChildren(meta, duel(match, Boolean(decidedMatch)));
  }

  function renderChampion(frame: Frame): void {
    const bracket = frame.game.bracket;
    if (frame.game.phase !== "complete" || !bracket.champion) {
      dom.overlay.hidden = true;
      return;
    }
    const name = bracket.champion.label;
    const nameNode = text("div", "champion-name", name);
    if (name.length > 20) nameNode.classList.add("xlong");
    else if (name.length > 13) nameNode.classList.add("long");

    const final = bracket.rounds[bracket.rounds.length - 1][0];
    const beaten = bracket.rounds
      .map((round) => round.find((m) => m.winner && (m.winner === "a" ? m.a : m.b)?.id === bracket.champion?.id))
      .map((m) => (m ? (m.winner === "a" ? m.b : m.a) : null))
      .filter((e): e is NonNullable<typeof e> => Boolean(e));

    const path = text("div", "champion-path");
    beaten.forEach((entrant, i) => {
      if (i > 0) path.append(text("span", "sep", "›"));
      path.append(text("span", "step", entrant.label));
    });

    const art = artNode(bracket.champion, "hero");
    const meta = [bracket.title, `${frame.game.actionCount} matchup${frame.game.actionCount === 1 ? "" : "s"}`, final.decidedBy ? `crowned by ${final.decidedBy}` : null]
      .filter(Boolean)
      .join(" · ");

    dom.overlay.className = "champion";
    dom.overlay.replaceChildren(
      text("div", "champion-label", "Champion"),
      ...(art ? [art] : []),
      nameNode,
      text("div", "champion-rule"),
      ...(beaten.length ? [text("div", "champion-path-label", "Road to the title"), path] : []),
      text("div", "champion-meta", meta),
    );
    dom.overlay.hidden = false;
  }

  function justDecided(prev: Frame | null, next: Frame): Match | null {
    if (!prev || !prev.game.currentMatchId || next.game.actionCount <= prev.game.actionCount) return null;
    const match = findMatch(next.game.bracket, prev.game.currentMatchId);
    return match?.winner ? match : null;
  }

  function pump(): void {
    if (animating || !queued) return;
    const next = queued;
    queued = null;
    const decided = justDecided(shown, next);
    shown = next;

    const bracket = next.game.bracket;
    setHeader(dom, bracket.title, bracket.subtitle);
    const all = bracket.rounds.flat();
    setProgress(dom, all.filter((m) => m.winner && !m.bye).length, all.filter((m) => !m.bye).length, "decided");

    if (decided) {
      // Hold the result on screen so the pick reads as an event rather than
      // the board silently changing.
      if (next.game.phase === "complete") {
        sound.play("champion");
      } else {
        const rounds = next.game.bracket.rounds.length;
        sound.play("advance", rounds > 1 ? decided.round / (rounds - 1) : 0);
        // A round finishing is worth its own beat, offset so it doesn't collide.
        const nextRound = findMatch(next.game.bracket, next.game.currentMatchId)?.round;
        if (nextRound !== undefined && nextRound > decided.round) {
          setTimeout(() => sound.play("round"), 320);
        }
      }
      animating = true;
      renderBoard(next, decided.id);
      renderBand(next, decided);
      dom.overlay.hidden = true;
      timer = setTimeout(() => {
        animating = false;
        if (shown) {
          renderBoard(shown, null);
          renderBand(shown, null);
          renderChampion(shown);
        }
        pump();
      }, DECISION_HOLD_MS);
      return;
    }

    renderBoard(next, null);
    renderBand(next, null);
    renderChampion(next);
  }

  return {
    update: (frame) => {
      queued = frame;
      pump();
    },
    unmount: () => {
      clearTimeout(timer);
      resetProgress();
      matchNodes.clear();
      boardKey = "";
      dom.board.dataset.size = "";
    },
  };
}

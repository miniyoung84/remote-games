import { roundName } from "../../shared/bracket.js";
import type { Bracket, DisplayState, Match } from "../../shared/types.js";
import { connect } from "../connection.js";
import { autoFitStage } from "../stage.js";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
};

const stage = el("stage");
const title = el("title");
const progress = el("progress");
const board = el("board");
const band = el("band");
const champion = el("champion");
const offline = el("offline");

autoFitStage(stage);

/** Reused between renders so CSS animations survive a state push. */
const matchNodes = new Map<string, HTMLElement>();
let boardKey = "";

let shown: DisplayState | null = null;
let queued: DisplayState | null = null;
let animating = false;

const DECISION_HOLD_MS = 1500;

function text(tag: string, className: string, value = ""): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

/* ---------- bracket ---------- */

function buildBoard(bracket: Bracket): void {
  board.replaceChildren();
  matchNodes.clear();
  board.dataset.size = String(bracket.rounds[0].length);

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
    board.append(column);
  });
}

function paintSlot(slot: HTMLElement, match: Match, side: "a" | "b"): void {
  const entrant = side === "a" ? match.a : match.b;
  slot.className = "slot";
  slot.replaceChildren(
    text("span", "seed", entrant?.seed ? String(entrant.seed) : ""),
    text("span", "label", entrant?.label ?? "—"),
  );
  if (!entrant) return;
  slot.classList.add("filled");
  if (match.winner === side) slot.classList.add("winner");
  else if (match.winner) slot.classList.add("loser");
}

function renderBoard(state: DisplayState, justDecided: string | null): void {
  const bracket = state.bracket;
  if (!bracket) return;

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
    node.classList.toggle("current", match.id === state.currentMatchId && !animating);

    if (match.id === justDecided) {
      node.classList.remove("just-decided");
      void node.offsetWidth; // restart the animation
      node.classList.add("just-decided");
    }
  }
}

/* ---------- band ---------- */

function findMatch(bracket: Bracket | null, id: string | null): Match | null {
  if (!bracket || !id) return null;
  return bracket.rounds.flat().find((m) => m.id === id) ?? null;
}

function duel(match: Match, decided: boolean): HTMLElement {
  const wrap = text("div", "duel");
  for (const side of ["a", "b"] as const) {
    const entrant = side === "a" ? match.a : match.b;
    const label = entrant?.label ?? "—";
    const node = text("div", `duel-side ${side}`);
    node.append(text("span", "duel-key", side.toUpperCase()), text("span", "duel-name", label));
    if (label.length > 32) node.classList.add("xlong");
    else if (label.length > 22) node.classList.add("long");
    if (decided && match.winner) node.classList.add(match.winner === side ? "won" : "lost");
    wrap.append(node);
    if (side === "a") wrap.append(text("div", "duel-vs", "VS"));
  }
  return wrap;
}

function renderBand(state: DisplayState, decidedMatch: Match | null): void {
  const bracket = state.bracket;
  const match = decidedMatch ?? findMatch(bracket, state.currentMatchId);

  if (!bracket || !match) {
    band.replaceChildren(
      text("div", "band-message", state.phase === "complete" ? "That's the bracket." : "Waiting for the host"),
    );
    return;
  }

  const meta = text("div", "band-meta");
  meta.append(text("span", "band-round", roundName(match.round, bracket.rounds.length)));

  if (decidedMatch) {
    const winner = match.winner === "a" ? match.a : match.b;
    meta.append(
      text(
        "span",
        "band-picker",
        match.decidedBy ? `${match.decidedBy} picked ${winner?.label ?? ""}` : `${winner?.label ?? ""} advances`,
      ),
    );
  } else {
    meta.append(
      text("span", "band-picker", state.pickerName ? `${state.pickerName} is picking` : "Waiting for the host"),
    );
  }

  band.replaceChildren(meta, duel(match, Boolean(decidedMatch)));
}

/* ---------- champion ---------- */

function renderChampion(state: DisplayState): void {
  if (state.phase !== "complete" || !state.bracket?.champion) {
    champion.hidden = true;
    return;
  }
  const name = state.bracket.champion.label;
  const nameNode = text("div", "champion-name", name);
  if (name.length > 20) nameNode.classList.add("xlong");
  else if (name.length > 13) nameNode.classList.add("long");

  const final = state.bracket.rounds[state.bracket.rounds.length - 1][0];
  const runnerUp = final.winner === "a" ? final.b : final.a;

  champion.replaceChildren(
    text("div", "champion-label", "Champion"),
    nameNode,
    text("div", "champion-rule"),
    text("div", "champion-sub", runnerUp ? `beat ${runnerUp.label} in the final` : state.bracket.title),
    text(
      "div",
      "champion-meta",
      `${state.bracket.title} · ${state.decisionCount} matchup${state.decisionCount === 1 ? "" : "s"}`,
    ),
  );
  champion.hidden = false;
}

/* ---------- render pump ---------- */

function renderIdle(state: DisplayState): void {
  board.dataset.size = "";
  board.replaceChildren();
  matchNodes.clear();
  boardKey = "";

  const idle = text("div", "idle");
  idle.append(
    text("h2", "", "remote-games"),
    text(
      "p",
      "",
      state.presentCount > 0
        ? `${state.presentCount} here — waiting for the host to start a bracket`
        : "Waiting for the host to start a bracket",
    ),
  );
  board.append(idle);
  band.replaceChildren(text("div", "band-message", "Ready when you are"));
}

function renderHeader(state: DisplayState): void {
  if (!state.bracket) {
    title.textContent = "remote-games";
    progress.textContent = "";
    return;
  }
  title.replaceChildren(document.createTextNode(state.bracket.title));
  if (state.bracket.subtitle) title.append(text("span", "sub", state.bracket.subtitle));

  const all = state.bracket.rounds.flat();
  const decided = all.filter((m) => m.winner && !m.bye).length;
  const total = all.filter((m) => !m.bye).length;
  progress.replaceChildren(
    text("span", "num", String(decided)),
    text("span", "of", `/ ${total}`),
    text("span", "label", "decided"),
  );
}

/** A decision landed on the matchup that was on screen a moment ago. */
function justDecided(prev: DisplayState | null, next: DisplayState): Match | null {
  if (!prev?.currentMatchId || next.decisionCount <= prev.decisionCount) return null;
  const match = findMatch(next.bracket, prev.currentMatchId);
  return match?.winner ? match : null;
}

function pump(): void {
  if (animating || !queued) return;

  const next = queued;
  queued = null;
  const decided = justDecided(shown, next);
  shown = next;

  renderHeader(next);

  if (!next.bracket) {
    renderIdle(next);
    renderChampion(next);
    return;
  }

  if (decided) {
    // Hold the result on screen before moving on, so the pick reads as an
    // event rather than the board silently changing.
    animating = true;
    renderBoard(next, decided.id);
    renderBand(next, decided);
    champion.hidden = true;
    setTimeout(() => {
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

connect<DisplayState>("display", {
  onState: (state) => {
    queued = state;
    pump();
  },
  onStatus: (connected) => {
    offline.hidden = connected;
  },
});

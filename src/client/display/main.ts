import type { DisplayState } from "../../shared/types.js";
import { connect } from "../connection.js";
import { autoFitStage } from "../stage.js";
import { mountBracket } from "./bracket.js";
import { text, type DisplayDom, type Renderer } from "./dom.js";
import { mountTierlist } from "./tierlist.js";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
};

const dom: DisplayDom = {
  stage: el("stage"),
  title: el("title"),
  progress: el("progress"),
  board: el("board"),
  band: el("band"),
  overlay: el("champion"),
};
const offline = el("offline");

autoFitStage(dom.stage);

let kind: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let renderer: Renderer<any> | null = null;

function swapTo(next: string | null): void {
  if (kind === next) return;
  renderer?.unmount();
  renderer = null;
  kind = next;
  dom.board.replaceChildren();
  dom.band.replaceChildren();
  dom.overlay.hidden = true;
  if (next === "bracket") renderer = mountBracket(dom);
  else if (next === "tierlist") renderer = mountTierlist(dom);
}

function renderIdle(state: DisplayState): void {
  dom.title.replaceChildren(document.createTextNode("remote-games"));
  dom.progress.replaceChildren();
  const idle = text("div", "idle");
  idle.append(
    text("h2", "", "remote-games"),
    text(
      "p",
      "",
      state.presentCount > 0
        ? `${state.presentCount} here — waiting for the host to start a game`
        : "Waiting for the host to start a game",
    ),
  );
  dom.board.replaceChildren(idle);
  dom.band.replaceChildren(text("div", "band-message", "Ready when you are"));
}

connect<DisplayState>("display", {
  onState: (state) => {
    swapTo(state.game?.kind ?? null);
    if (!state.game) return renderIdle(state);
    renderer?.update({ state, game: state.game });
  },
  onStatus: (connected) => {
    offline.hidden = connected;
  },
});

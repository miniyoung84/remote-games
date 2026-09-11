import { pickNumber } from "../../shared/draft.js";
import type { DisplayGame, DisplayState, DraftBoard } from "../../shared/types.js";
import {
  artNode,
  captureRects,
  fitLabels,
  flyIn,
  resetProgress,
  setHeader,
  setProgress,
  stagger,
  text,
  type DisplayDom,
  type Renderer,
  type Sound,
} from "./dom.js";
import { PICK_STING_MS } from "./sound.js";

type DraftGame = Extract<DisplayGame, { kind: "draft" }>;
type Frame = { state: DisplayState; game: DraftGame };

/**
 * A pick is announced on a takeover card while the sting plays, and only then
 * does the board update: the chip flies off the card into its column. The
 * flight is guarded too, so a state push landing mid-flight can't cut it.
 */
const ANNOUNCE_MS = PICK_STING_MS;
const SETTLE_MS = 720;

const PICK_MAX = 150;
const PICK_MIN = 44;
const PICK_GAP = 6;

export function mountDraft(dom: DisplayDom, sound: Sound): Renderer<Frame> {
  let shown: Frame | null = null;
  let queued: Frame | null = null;
  let animating = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let builtKey = "";

  /** Picks take the height the deepest column has, so three picks aren't three thin bars. */
  function sizePicks(deepest: number): void {
    const list = dom.board.querySelector<HTMLElement>(".draft-picks");
    if (!list) return;
    const style = getComputedStyle(list);
    const avail = list.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const height = Math.max(PICK_MIN, Math.min(PICK_MAX, Math.floor((avail - (deepest - 1) * PICK_GAP) / deepest)));
    dom.board.style.setProperty("--pick-h", `${height}px`);
    dom.board.dataset.depth = height >= 120 ? "xl" : height >= 90 ? "l" : height >= 60 ? "m" : "s";
  }

  function renderBoard(board: DraftBoard, focusId: string | null): void {
    const deepest = Math.max(1, ...board.columns.map((c) => c.picks.length));
    dom.board.dataset.cols = String(Math.min(12, Math.max(1, board.columns.length)));

    const key = `${board.topic}:${board.columns.length}`;
    const fresh = key !== builtKey;
    builtKey = key;

    dom.board.replaceChildren(
      ...board.columns.map((column) => {
        const node = text("div", "draft-col");
        if (!column.present) node.classList.add("away");
        const receiving = Boolean(focusId) && column.picks.some((p) => p.id === focusId);
        if (receiving) node.classList.add("receiving");

        const head = text("div", "draft-head");
        head.append(text("span", "draft-name", column.name));
        const count = text("span", "draft-count", String(column.picks.length));
        if (receiving) count.classList.add("tick");
        head.append(count);
        node.append(head);

        const picks = text("div", "draft-picks");
        for (const pick of column.picks) {
          const chip = text("div", "draft-pick");
          chip.dataset.item = pick.id;
          const art = artNode(pick, "chip");
          if (art) {
            chip.append(art);
            chip.classList.add("has-art");
          }
          chip.append(text("span", "pick-num", pickNumber(pick)));
          chip.append(text("span", "pick-label", pick.label));
          if (pick.id === focusId) chip.classList.add("focus");
          picks.append(chip);
        }
        node.append(picks);
        return node;
      }),
    );
    sizePicks(deepest);
    fitLabels(dom.board.querySelectorAll<HTMLElement>(".pick-label"));
    if (fresh) stagger(dom.board.querySelectorAll<HTMLElement>(".draft-col"), "entering-up", 45);
  }

  function renderBand(frame: Frame): void {
    const board = frame.game.board;

    if (board.phase === "final") {
      dom.band.replaceChildren(text("div", "band-final", `Final · ${board.topic}`));
      return;
    }

    const meta = text("div", "band-meta");
    meta.append(text("span", "band-round", board.target ? `${board.total} of ${board.target}` : `${board.total} picked`));
    if (frame.state.pickerName) {
      meta.append(text("span", "band-picker", `${frame.state.pickerName} is on the clock`));
    }
    dom.band.replaceChildren(meta, text("div", "band-message", frame.state.pickerName ? "Say what you're taking" : ""));
  }

  /** The broadcast card: pick number, who, and what — over the whole stage. */
  function renderAnnouncement(board: DraftBoard): void {
    const last = board.last;
    if (!last) return;

    const card = text("div", "announce-card");

    const tag = text("div", "announce-pick");
    tag.append(text("span", "k", "Pick"), text("span", "n", pickNumber(last)));
    card.append(tag);

    const body = text("div", "announce-body");
    body.append(text("div", "announce-who", `${last.byName} selects`));
    const what = text("div", "announce-what");
    what.dataset.item = last.id; // the chip flies out of here
    const art = artNode(last, "hero");
    if (art) {
      what.append(art);
      what.classList.add("has-art");
    }
    const label = text("span", "announce-label", last.label);
    if (last.label.length > 30) label.classList.add("xlong");
    else if (last.label.length > 16) label.classList.add("long");
    what.append(label);
    body.append(what);
    card.append(body);

    dom.overlay.className = "announce";
    dom.overlay.replaceChildren(card);
    dom.overlay.hidden = false;
  }

  function render(frame: Frame, before: Map<string, DOMRect> | null, focusId: string | null): void {
    const board = frame.game.board;
    setHeader(dom, board.topic, board.subtitle);
    setProgress(dom, board.total, board.target || board.total, "picked");
    dom.stage.classList.toggle("tier-final", board.phase === "final");

    renderBoard(board, focusId);
    renderBand(frame);
    if (before) flyIn(dom, before, focusId);
  }

  function pump(): void {
    if (animating || !queued) return;
    const next = queued;
    queued = null;

    const picked = Boolean(shown) && next.game.actionCount > (shown?.game.actionCount ?? 0) && Boolean(next.game.board.last);
    const wasFinal = shown?.game.board.phase === "final";
    // Columns reflow when someone joins; let the existing picks slide over.
    const before = shown ? captureRects(dom) : null;
    shown = next;

    if (picked) {
      sound.play("pick");
      // The board stays as it was under the card; the pick lands after.
      renderAnnouncement(next.game.board);
      animating = true;
      timer = setTimeout(() => {
        if (!shown) return;
        const from = captureRects(dom); // the card is still up: that's where the chip starts
        dom.overlay.hidden = true;
        render(shown, from, shown.game.board.last?.id ?? null);
        timer = setTimeout(() => {
          animating = false;
          pump();
        }, SETTLE_MS);
      }, ANNOUNCE_MS);
      return;
    }

    if (!wasFinal && next.game.board.phase === "final") sound.play("champion");
    dom.overlay.hidden = true;
    render(next, before, null);
  }

  return {
    update: (frame) => {
      queued = frame;
      pump();
    },
    unmount: () => {
      clearTimeout(timer);
      resetProgress();
      builtKey = "";
      dom.board.dataset.depth = "";
      dom.board.dataset.cols = "";
      dom.board.style.removeProperty("--pick-h");
      dom.stage.classList.remove("tier-final");
    },
  };
}

import type { DisplayGame, DisplayState, TierAction, TierBoard } from "../../shared/types.js";
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

type TierGame = Extract<DisplayGame, { kind: "tierlist" }>;
type Frame = { state: DisplayState; game: TierGame };

const ACTION_HOLD_MS = 1600;

/** Chips are sized to the space the fullest row actually has, between these. */
const CHIP_MAX = 190;
const CHIP_MIN = 64;
const CHIP_GAP = 6;

const TRAY_MAX = 220;
const TRAY_MIN = 110;
const TRAY_GAP = 8;
const TRAY_SHOWN = 12;

export function mountTierlist(dom: DisplayDom, sound: Sound): Renderer<Frame> {
  let shown: Frame | null = null;
  let queued: Frame | null = null;
  let animating = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Identifies the board so the entrance only plays for a new one. */
  let builtKey = "";

  function chip(item: TierBoard["rows"][number]["items"][number], focus: boolean): HTMLElement {
    const node = text("div", `chip${focus ? " focus" : ""}`);
    node.dataset.item = item.id;
    const art = artNode(item, "chip");
    if (art) {
      node.append(art);
      node.classList.add("has-art");
    }
    node.append(text("span", "chip-label", item.label));
    return node;
  }

  /**
   * One chip width for the whole board, from the room the fullest row has.
   * Stepping the size on item count alone shrank every chip the moment a row
   * hit six, with two thirds of the row still empty.
   */
  function sizeChips(densest: number): void {
    const items = dom.board.querySelector<HTMLElement>(".tier-items");
    if (!items) return;
    // clientWidth is in stage pixels, untouched by the fit-to-window scale.
    const style = getComputedStyle(items);
    const avail = items.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const width = Math.max(CHIP_MIN, Math.min(CHIP_MAX, Math.floor((avail - (densest - 1) * CHIP_GAP) / densest)));
    dom.board.style.setProperty("--chip-w", `${width}px`);
    // Type and art still step, but on the width the chip ended up with.
    dom.board.dataset.density = width >= 170 ? "xl" : width >= 140 ? "l" : width >= 105 ? "m" : "s";
  }

  function renderBoard(board: TierBoard, action: TierAction | null, cascade: boolean): void {
    const densest = Math.max(1, ...board.rows.map((r) => r.items.length));

    // Not keyed on the item count: adding one mid-game must not replay the
    // whole board's entrance.
    const key = `${board.title}:${board.mode}`;
    const fresh = key !== builtKey;
    builtKey = key;

    // The tier layout has to be on before the rows are measured.
    if (!dom.board.dataset.density) dom.board.dataset.density = "xl";

    dom.board.replaceChildren(
      ...board.rows.map((row) => {
        const node = text("div", "tier");
        node.style.setProperty("--tier", row.color);
        if (action && action.tierId === row.id) node.classList.add("receiving");
        if (action?.from === row.id) node.classList.add("departing");

        node.append(text("div", "tier-label", row.label));
        const items = text("div", "tier-items");
        for (const item of row.items) items.append(chip(item, action?.item.id === item.id));
        node.append(items);
        return node;
      }),
    );
    sizeChips(densest);
    fitLabels(dom.board.querySelectorAll<HTMLElement>(".chip-label"));
    if (fresh || cascade) stagger(dom.board.querySelectorAll<HTMLElement>(".tier"));
  }

  function renderBand(frame: Frame, action: TierAction | null): void {
    const board = frame.game.board;

    if (board.phase === "final") {
      dom.band.replaceChildren(text("div", "band-final", `Final · ${board.title}`));
      return;
    }

    const meta = text("div", "band-meta");
    if (action) {
      const moved = Boolean(action.from);
      const fromLabel = board.rows.find((r) => r.id === action.from)?.label;
      const toLabel = board.rows.find((r) => r.id === action.tierId)?.label;
      meta.append(text("span", "band-round", moved ? `${fromLabel} → ${toLabel}` : `Into ${toLabel}`));
      meta.append(
        text(
          "span",
          `band-picker${moved ? " move" : ""}`,
          action.by ? `${action.by} ${moved ? "moved it" : "placed it"}` : moved ? "Moved" : "Placed",
        ),
      );
    } else if (board.phase === "revising") {
      meta.append(text("span", "band-round", "All placed"));
      if (frame.state.pickerName) meta.append(text("span", "band-picker", `${frame.state.pickerName} can move one`));
    } else if (board.mode === "open") {
      meta.append(text("span", "band-round", `${board.placed} of ${board.total} sorted`));
      if (frame.state.pickerName) meta.append(text("span", "band-picker", `${frame.state.pickerName} picks one`));
    } else {
      meta.append(text("span", "band-round", `${board.placed + 1} of ${board.total}`));
      if (frame.state.pickerName) meta.append(text("span", "band-picker", `${frame.state.pickerName} is placing`));
    }

    const subject = action ? action.item : board.current;

    // Open mode has no item on offer, so the band shows what's still unsorted
    // and the picker chooses from it.
    if (!subject && board.mode === "open" && board.unplaced.length) {
      const tray = text("div", "tier-tray");
      const shownItems = board.unplaced.slice(0, TRAY_SHOWN);
      for (const item of shownItems) {
        const node = text("div", "tray-chip");
        node.dataset.item = item.id; // so the pick flies out of the tray
        const art = artNode(item, "chip");
        if (art) {
          node.append(art);
          if (item.art && "image" in item.art) node.classList.add("has-image");
        }
        node.append(text("span", "tray-label", item.label));
        tray.append(node);
      }
      const more = board.unplaced.length - shownItems.length;
      if (more > 0) tray.append(text("span", "tray-more", `+${more}`));
      dom.band.replaceChildren(meta, tray);

      // Same idea as the board: chips take the room they have.
      const spare = more > 0 ? 70 : 0;
      const width = Math.floor((tray.clientWidth - spare - (shownItems.length - 1) * TRAY_GAP) / shownItems.length);
      tray.style.setProperty("--tray-w", `${Math.max(TRAY_MIN, Math.min(TRAY_MAX, width))}px`);
      fitLabels(tray.querySelectorAll<HTMLElement>(".tray-label"), 12);
      return;
    }

    if (!subject) {
      dom.band.replaceChildren(meta, text("div", "band-message", "Nothing left to place"));
      return;
    }

    const hero = text("div", `tier-hero${action?.from ? " moved" : ""}`);
    hero.dataset.item = subject.id;
    // A queued item was already sitting here before it was placed: it fades
    // rather than re-entering, since the chip that just flew off *is* it.
    if (action && !action.from && board.mode === "queue") hero.classList.add("held");
    const art = artNode(subject, "hero");
    if (art) {
      hero.append(art);
      hero.classList.add("has-art");
    }
    const label = text("span", "hero-label", subject.label);
    if (subject.label.length > 26) hero.classList.add("long");
    hero.append(label);

    dom.band.replaceChildren(meta, hero);
  }

  function render(frame: Frame, action: TierAction | null, before: Map<string, DOMRect> | null, cascade = false): void {
    const board = frame.game.board;
    setHeader(dom, board.title, board.subtitle);
    setProgress(dom, board.placed, board.total, "placed");
    dom.overlay.hidden = true;
    dom.stage.classList.toggle("tier-final", board.phase === "final");

    renderBoard(board, action, cascade);
    renderBand(frame, action);
    if (before) flyIn(dom, before, action?.item.id ?? null);
  }

  function pump(): void {
    if (animating || !queued) return;
    const next = queued;
    queued = null;

    const isAction = Boolean(shown) && next.game.actionCount > (shown?.game.actionCount ?? 0);
    const action = isAction ? next.game.board.last : null;
    const before = shown ? captureRects(dom) : null;
    const wasFinal = shown?.game.board.phase === "final";
    const becameFinal = Boolean(shown) && !wasFinal && next.game.board.phase === "final";
    shown = next;

    if (action) sound.play(action.from ? "move" : "place");
    else if (becameFinal) sound.play("finish");

    // The finished list is the artifact, so it gets its entrance back.
    render(next, action, before, becameFinal);

    if (action) {
      // Hold the result so the room registers who did what, then advance to the
      // next item on offer. Nothing moves on that re-render, so no FLIP.
      animating = true;
      timer = setTimeout(() => {
        animating = false;
        if (shown) render(shown, null, null);
        pump();
      }, ACTION_HOLD_MS);
    }
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
      delete dom.board.dataset.density;
      dom.board.style.removeProperty("--chip-w");
      dom.stage.classList.remove("tier-final");
    },
  };
}

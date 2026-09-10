import type { DisplayGame, DisplayState, TierAction, TierBoard } from "../../shared/types.js";
import { artNode, setHeader, setProgress, text, type DisplayDom, type Renderer, type Sound } from "./dom.js";

type TierGame = Extract<DisplayGame, { kind: "tierlist" }>;
type Frame = { state: DisplayState; game: TierGame };

const ACTION_HOLD_MS = 1600;
const FLIGHT_MS = 620;

export function mountTierlist(dom: DisplayDom, sound: Sound): Renderer<Frame> {
  let shown: Frame | null = null;
  let queued: Frame | null = null;
  let animating = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Screen-space rect of every chip, plus the item currently in the band.
   * A placement therefore flies in from the band and a move flies across rows,
   * both from the same captured map.
   */
  function capture(): Map<string, DOMRect> {
    const map = new Map<string, DOMRect>();
    for (const node of document.querySelectorAll<HTMLElement>("[data-item]")) {
      if (node.dataset.item) map.set(node.dataset.item, node.getBoundingClientRect());
    }
    return map;
  }

  /**
   * FLIP: nodes are already in their final position, so we invert them to where
   * they were and let a transition carry them home.
   *
   * The stage is CSS-scaled, so a screen-space delta has to be divided by that
   * scale before it's used as a local transform — otherwise the scaling is
   * applied twice and chips fly off in the wrong direction.
   */
  function flip(before: Map<string, DOMRect>, focusId: string | null): void {
    const rect = dom.board.getBoundingClientRect();
    const scale = dom.board.offsetWidth ? rect.width / dom.board.offsetWidth : 1;
    if (!scale) return;

    const moved: HTMLElement[] = [];
    for (const node of dom.board.querySelectorAll<HTMLElement>("[data-item]")) {
      const id = node.dataset.item;
      const from = id ? before.get(id) : undefined;
      if (!from) continue;

      const to = node.getBoundingClientRect();
      const dx = (from.left - to.left) / scale;
      const dy = (from.top - to.top) / scale;
      const ds = to.width ? from.width / to.width : 1;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(ds - 1) < 0.02) continue;

      node.style.transition = "none";
      node.style.transform = `translate(${dx}px, ${dy}px) scale(${ds})`;
      if (id === focusId) node.classList.add("in-flight");
      moved.push(node);
    }
    if (!moved.length) return;

    void dom.board.offsetWidth; // commit the inverted positions
    for (const node of moved) {
      node.style.transition = `transform ${FLIGHT_MS}ms cubic-bezier(.22,.9,.24,1)`;
      node.style.transform = "";
    }
    setTimeout(() => {
      for (const node of moved) {
        node.style.transition = "";
        node.classList.remove("in-flight");
      }
    }, FLIGHT_MS + 40);
  }

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

  function renderBoard(board: TierBoard, action: TierAction | null): void {
    // Chip size is driven by the fullest row, so a lopsided S tier doesn't
    // overflow while the others sit half empty.
    const densest = Math.max(1, ...board.rows.map((r) => r.items.length));
    dom.board.dataset.density = densest <= 5 ? "5" : densest <= 8 ? "8" : densest <= 11 ? "11" : "16";

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
      meta.append(text("span", "band-picker", frame.state.pickerName ? `${frame.state.pickerName} can move one` : "Move something, or finish"));
    } else if (board.mode === "open") {
      meta.append(text("span", "band-round", `${board.placed} of ${board.total} sorted`));
      meta.append(
        text("span", "band-picker", frame.state.pickerName ? `${frame.state.pickerName} picks one` : "Waiting for the host"),
      );
    } else {
      meta.append(text("span", "band-round", `${board.placed + 1} of ${board.total}`));
      meta.append(text("span", "band-picker", frame.state.pickerName ? `${frame.state.pickerName} is placing` : "Waiting for the host"));
    }

    const subject = action ? action.item : board.current;

    // Open mode has no item on offer, so the band shows what's still unsorted
    // and the picker chooses from it.
    if (!subject && board.mode === "open" && board.unplaced.length) {
      const tray = text("div", "tier-tray");
      for (const item of board.unplaced.slice(0, 12)) {
        const chip = text("div", "tray-chip");
        const art = artNode(item, "chip");
        if (art) chip.append(art);
        chip.append(text("span", "", item.label));
        tray.append(chip);
      }
      if (board.unplaced.length > 12) tray.append(text("span", "tray-more", `+${board.unplaced.length - 12}`));
      dom.band.replaceChildren(meta, tray);
      return;
    }

    if (!subject) {
      dom.band.replaceChildren(meta, text("div", "band-message", "Nothing left to place"));
      return;
    }

    const hero = text("div", `tier-hero${action?.from ? " moved" : ""}`);
    hero.dataset.item = subject.id;
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

  function render(frame: Frame, action: TierAction | null, before: Map<string, DOMRect> | null): void {
    const board = frame.game.board;
    setHeader(dom, board.title, board.subtitle);
    setProgress(dom, board.placed, board.total, "placed");
    dom.overlay.hidden = true;
    dom.stage.classList.toggle("tier-final", board.phase === "final");

    renderBoard(board, action);
    renderBand(frame, action);
    if (before) flip(before, action?.item.id ?? null);
  }

  function pump(): void {
    if (animating || !queued) return;
    const next = queued;
    queued = null;

    const isAction = Boolean(shown) && next.game.actionCount > (shown?.game.actionCount ?? 0);
    const action = isAction ? next.game.board.last : null;
    const before = shown ? capture() : null;
    const wasFinal = shown?.game.board.phase === "final";
    shown = next;

    if (action) sound.play(action.from ? "move" : "place");
    else if (!wasFinal && next.game.board.phase === "final") sound.play("finish");

    render(next, action, before);

    if (action) {
      // Hold the result so the room registers who did what, then advance to the
      // next item on offer.
      animating = true;
      timer = setTimeout(() => {
        animating = false;
        if (shown) render(shown, null, capture());
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
      dom.board.dataset.density = "";
      dom.stage.classList.remove("tier-final");
    },
  };
}

import type { DisplayGame, DisplayState, DraftBoard } from "../../shared/types.js";
import { resetProgress, setHeader, setProgress, stagger, text, type DisplayDom, type Renderer, type Sound } from "./dom.js";

type DraftGame = Extract<DisplayGame, { kind: "draft" }>;
type Frame = { state: DisplayState; game: DraftGame };

const PICK_HOLD_MS = 1600;
const FLIGHT_MS = 620;

export function mountDraft(dom: DisplayDom, sound: Sound): Renderer<Frame> {
  let shown: Frame | null = null;
  let queued: Frame | null = null;
  let animating = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let builtKey = "";

  function capture(): Map<string, DOMRect> {
    const map = new Map<string, DOMRect>();
    for (const node of document.querySelectorAll<HTMLElement>("[data-item]")) {
      if (node.dataset.item) map.set(node.dataset.item, node.getBoundingClientRect());
    }
    return map;
  }

  /** Same FLIP as the tier list: a new pick flies out of the band into its column. */
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

    void dom.board.offsetWidth;
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

  function renderBoard(board: DraftBoard, focusId: string | null): void {
    const deepest = Math.max(1, ...board.columns.map((c) => c.picks.length));
    dom.board.dataset.depth = deepest <= 3 ? "3" : deepest <= 5 ? "5" : deepest <= 8 ? "8" : "12";
    dom.board.dataset.cols = String(Math.min(12, Math.max(1, board.columns.length)));

    const key = `${board.topic}:${board.columns.length}`;
    const fresh = key !== builtKey;
    builtKey = key;

    dom.board.replaceChildren(
      ...board.columns.map((column) => {
        const node = text("div", "draft-col");
        if (!column.present) node.classList.add("away");
        if (focusId && column.picks.some((p) => p.id === focusId)) node.classList.add("receiving");

        const head = text("div", "draft-head");
        head.append(text("span", "draft-name", column.name));
        head.append(text("span", "draft-count", String(column.picks.length)));
        node.append(head);

        const picks = text("div", "draft-picks");
        for (const pick of column.picks) {
          const chip = text("div", "draft-pick", pick.label);
          chip.dataset.item = pick.id;
          if (pick.id === focusId) chip.classList.add("focus");
          picks.append(chip);
        }
        node.append(picks);
        return node;
      }),
    );
    if (fresh) stagger(dom.board.querySelectorAll<HTMLElement>(".draft-col"), "entering-up", 45);
  }

  function renderBand(frame: Frame, justPicked: boolean): void {
    const board = frame.game.board;

    if (board.phase === "final") {
      dom.band.replaceChildren(text("div", "band-final", `Final · ${board.topic}`));
      return;
    }

    const meta = text("div", "band-meta");
    if (justPicked && board.last) {
      meta.append(text("span", "band-round", `Pick ${board.total}`));
      meta.append(text("span", "band-picker", `${board.last.byName} took it`));
    } else {
      meta.append(text("span", "band-round", board.target ? `${board.total} of ${board.target}` : `${board.total} picked`));
      if (frame.state.pickerName) {
        meta.append(text("span", "band-picker", `${frame.state.pickerName} is on the clock`));
      }
    }

    if (justPicked && board.last) {
      const hero = text("div", "tier-hero");
      hero.dataset.item = board.last.id;
      hero.append(text("span", "hero-label", board.last.label));
      if (board.last.label.length > 26) hero.classList.add("long");
      dom.band.replaceChildren(meta, hero);
      return;
    }

    dom.band.replaceChildren(meta, text("div", "band-message", frame.state.pickerName ? "Say what you're taking" : ""));
  }

  function render(frame: Frame, justPicked: boolean, before: Map<string, DOMRect> | null): void {
    const board = frame.game.board;
    setHeader(dom, board.topic, board.subtitle);
    setProgress(dom, board.total, board.target || board.total, "picked");
    dom.overlay.hidden = true;
    dom.stage.classList.toggle("tier-final", board.phase === "final");

    renderBoard(board, justPicked ? (board.last?.id ?? null) : null);
    renderBand(frame, justPicked);
    if (before) flip(before, board.last?.id ?? null);
  }

  function pump(): void {
    if (animating || !queued) return;
    const next = queued;
    queued = null;

    const picked = Boolean(shown) && next.game.actionCount > (shown?.game.actionCount ?? 0);
    const wasFinal = shown?.game.board.phase === "final";
    const before = shown ? capture() : null;
    shown = next;

    if (picked) sound.play("place");
    else if (!wasFinal && next.game.board.phase === "final") sound.play("champion");

    render(next, picked, before);

    if (picked) {
      animating = true;
      timer = setTimeout(() => {
        animating = false;
        if (shown) render(shown, false, capture());
        pump();
      }, PICK_HOLD_MS);
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
      dom.board.dataset.depth = "";
      dom.board.dataset.cols = "";
      dom.stage.classList.remove("tier-final");
    },
  };
}

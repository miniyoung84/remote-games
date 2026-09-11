import { behindInPicks, pickNumber } from "../../shared/draft.js";
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
  /** Who the band last named, so a re-render for something else doesn't re-slam it. */
  let clockKey = "";

  /**
   * Picks take the height the deepest column has, so three picks aren't three
   * thin bars — but no taller than the column is wide, or fifteen across
   * becomes fifteen columns of tall thin slivers.
   */
  function sizePicks(deepest: number): void {
    const list = dom.board.querySelector<HTMLElement>(".draft-picks");
    if (!list) return;
    const style = getComputedStyle(list);
    const avail = list.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const cap = Math.min(PICK_MAX, Math.round(list.clientWidth * 0.9));
    const height = Math.max(PICK_MIN, Math.min(cap, Math.floor((avail - (deepest - 1) * PICK_GAP) / deepest)));
    dom.board.style.setProperty("--pick-h", `${height}px`);
    dom.board.dataset.depth = height >= 120 ? "xl" : height >= 90 ? "l" : height >= 60 ? "m" : "s";
  }

  function renderBoard(board: DraftBoard, focusId: string | null): void {
    const deepest = Math.max(1, ...board.columns.map((c) => c.picks.length));
    const cols = board.columns.length;
    dom.board.dataset.cols = String(Math.min(16, Math.max(1, cols)));
    // Type is capped by how narrow the columns are, on top of the height bands.
    dom.board.dataset.width = cols <= 6 ? "wide" : cols <= 10 ? "mid" : cols <= 13 ? "narrow" : "tight";

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

  /**
   * The on-the-clock strip. Whoever the host tapped is named large for as long
   * as they're talking, and the room can see who still owes a pick this round
   * — the fairness a snake order used to provide, made visible.
   */
  function renderBand(frame: Frame): void {
    const board = frame.game.board;

    if (board.phase === "final") {
      dom.band.replaceChildren(text("div", "band-final", `Final · ${board.topic}`));
      clockKey = "";
      return;
    }

    const present = board.columns.filter((c) => c.present);
    const fewest = present.length ? Math.min(...present.map((c) => c.picks.length)) : 0;
    const round = fewest + 1;

    const pill = text("div", "clock-round");
    pill.append(text("span", "band-round", `Round ${round}`));
    pill.append(text("span", "clock-count", board.target ? `${board.total} of ${board.target}` : `${board.total} picked`));

    const clock = text("div", "clock");
    const picker = frame.state.pickerName;
    if (picker) {
      clock.append(text("span", "clock-name", picker), text("span", "clock-tag", "is on the clock"));
    } else {
      clock.classList.add("idle");
      clock.append(text("span", "clock-name", "Waiting for the next hand"));
    }
    const key = picker ?? "";
    if (key === clockKey) clock.classList.add("still");
    clockKey = key;

    // Everyone on the fewest picks, minus whoever is already up. When that's
    // the whole room, a round has just started and there's nothing to nag about.
    const behind = behindInPicks(board)
      .map((id) => board.columns.find((c) => c.personId === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c) && c!.name !== picker);
    const owed = text("div", "owed");
    if (behind.length && behind.length < present.length) {
      owed.append(text("span", "owed-label", "Yet to pick"));
      const names = text("span", "owed-names");
      // Four names and a count reads; a wrapped list of twelve doesn't.
      const shownNames = behind.length > 5 ? 4 : 5;
      behind.slice(0, shownNames).forEach((c, i) => {
        if (i) names.append(text("span", "sep", "·"));
        names.append(text("span", "owed-name", c.name));
      });
      if (behind.length > shownNames) names.append(text("span", "sep", `+${behind.length - shownNames}`));
      owed.append(names);
    }

    dom.band.replaceChildren(pill, clock, owed);
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
    dom.stage.classList.add("draft");

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
      delete dom.board.dataset.depth;
      delete dom.board.dataset.cols;
      delete dom.board.dataset.width;
      dom.board.style.removeProperty("--pick-h");
      dom.stage.classList.remove("tier-final", "draft");
      clockKey = "";
    },
  };
}

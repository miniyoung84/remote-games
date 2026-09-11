import type { Item } from "../../shared/types.js";
import type { SoundPlayer } from "./sound.js";

export type DisplayDom = {
  stage: HTMLElement;
  title: HTMLElement;
  progress: HTMLElement;
  board: HTMLElement;
  band: HTMLElement;
  overlay: HTMLElement;
};

/** A mounted game renderer. main.ts swaps these when the running game changes. */
export type Renderer<S> = { update: (state: S) => void; unmount: () => void };

export type Sound = SoundPlayer;

export function text(tag: string, className: string, value = ""): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

/** Item art: emoji glyph, flat color swatch, or an uploaded image. */
export function artNode(item: Item, variant: "chip" | "hero"): HTMLElement | null {
  const art = item.art;
  if (!art) return null;

  if ("emoji" in art) {
    const node = text("span", `art art-emoji ${variant}`, art.emoji);
    node.setAttribute("aria-hidden", "true");
    return node;
  }
  if ("color" in art) {
    const node = text("span", `art art-swatch ${variant}`);
    node.style.background = art.color;
    return node;
  }

  const img = document.createElement("img");
  img.className = `art art-image ${variant}`;
  img.src = `/images/${art.image}.webp`;
  img.alt = "";
  // A missing image falls back to the label rather than a broken-image icon.
  img.onerror = () => {
    img.parentElement?.classList.remove("has-art");
    img.remove();
  };
  return img;
}

export function setHeader(dom: DisplayDom, title: string, subtitle: string): void {
  dom.title.replaceChildren(document.createTextNode(title));
  if (subtitle) dom.title.append(text("span", "sub", subtitle));
}

let lastProgress: number | null = null;

export function setProgress(dom: DisplayDom, done: number, total: number, label: string): void {
  const num = text("span", "num", String(done));
  // Only tick when the number actually moved, so a plain re-render is still.
  if (lastProgress !== null && done !== lastProgress) num.classList.add("tick");
  lastProgress = done;
  dom.progress.replaceChildren(num, text("span", "of", `/ ${total}`), text("span", "label", label));
}

export function resetProgress(): void {
  lastProgress = null;
}

const FLIGHT_MS = 620;

/**
 * Screen-space rect of everything carrying an item id: the board's chips, then
 * whatever the band or a takeover card is showing. The board wins when both
 * have the same id.
 * During a placement the chip and the band hero *are* the same item, and a
 * capture that preferred the hero sent the chip flying out of the band a
 * second time once the hold ended.
 */
export function captureRects(dom: DisplayDom): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  for (const root of [dom.board, dom.band, dom.overlay]) {
    if (root.hidden) continue;
    for (const node of root.querySelectorAll<HTMLElement>("[data-item]")) {
      const id = node.dataset.item;
      if (id && !map.has(id)) map.set(id, stillRect(node));
    }
  }
  return map;
}

/** A node's rect with its entrance animation ignored, so a hero measured on
 *  the frame it appears isn't reported at the 0% keyframe's scale. */
function stillRect(node: HTMLElement): DOMRect {
  const was = node.style.animation;
  node.style.animation = "none";
  const rect = node.getBoundingClientRect();
  node.style.animation = was;
  return rect;
}

/**
 * FLIP: the board's nodes are already in their final positions, so each one
 * that has a "before" rect is inverted back to it and a transition carries it
 * home. Deltas are centre-to-centre because the scale is about the centre too.
 *
 * The stage is CSS-scaled, so a screen-space delta has to be divided by that
 * scale before it's used as a local transform — otherwise the scaling is
 * applied twice and chips fly off in the wrong direction.
 *
 * The focus item gets a ring for the flight and a landing beat on arrival.
 */
export function flyIn(dom: DisplayDom, before: Map<string, DOMRect>, focusId: string | null, delay = 0): void {
  const rect = dom.board.getBoundingClientRect();
  const scale = dom.board.offsetWidth ? rect.width / dom.board.offsetWidth : 1;
  if (!scale) return;

  const moved: HTMLElement[] = [];
  for (const node of dom.board.querySelectorAll<HTMLElement>("[data-item]")) {
    const id = node.dataset.item;
    const from = id ? before.get(id) : undefined;
    if (!from) continue;

    const to = node.getBoundingClientRect();
    const dx = (from.left + from.width / 2 - (to.left + to.width / 2)) / scale;
    const dy = (from.top + from.height / 2 - (to.top + to.height / 2)) / scale;
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
    node.style.transition = `transform ${FLIGHT_MS}ms cubic-bezier(.22,.9,.24,1) ${delay}ms`;
    node.style.transform = "";
  }
  setTimeout(() => {
    for (const node of moved) {
      node.style.transition = "";
      if (node.classList.contains("in-flight")) {
        node.classList.remove("in-flight");
        node.classList.add("landed");
      }
    }
  }, FLIGHT_MS + delay + 40);
}

/**
 * Step a label's type down until its line clamp stops truncating it. Labels
 * get two or three lines; only the ones that still don't fit lose size, so
 * the board stays uniform unless something is genuinely long.
 */
export function fitLabels(nodes: Iterable<HTMLElement>, min = 11): void {
  for (const label of nodes) {
    label.style.fontSize = "";
    let size = parseFloat(getComputedStyle(label).fontSize);
    for (let i = 0; i < 4 && label.scrollHeight > label.clientHeight + 1; i++) {
      size = Math.round(size * 0.86);
      if (size < min) break;
      label.style.fontSize = `${size}px`;
    }
  }
}

/** Cascade children in, so a board resolves rather than appearing all at once. */
export function stagger(nodes: Iterable<HTMLElement>, className = "entering", step = 55): void {
  let i = 0;
  for (const node of nodes) {
    node.classList.add(className);
    node.style.animationDelay = `${i * step}ms`;
    i++;
  }
}

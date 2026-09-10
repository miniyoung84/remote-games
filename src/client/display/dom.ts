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

/** Cascade children in, so a board resolves rather than appearing all at once. */
export function stagger(nodes: Iterable<HTMLElement>, className = "entering", step = 55): void {
  let i = 0;
  for (const node of nodes) {
    node.classList.add(className);
    node.style.animationDelay = `${i * step}ms`;
    i++;
  }
}

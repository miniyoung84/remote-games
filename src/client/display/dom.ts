import type { Item } from "../../shared/types.js";

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

export function text(tag: string, className: string, value = ""): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

/**
 * Item art. Emoji and color render today; `image` is accepted by the type but
 * has no upload pipeline yet, so it falls through to the label.
 */
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
  return null;
}

export function setHeader(dom: DisplayDom, title: string, subtitle: string): void {
  dom.title.replaceChildren(document.createTextNode(title));
  if (subtitle) dom.title.append(text("span", "sub", subtitle));
}

export function setProgress(dom: DisplayDom, done: number, total: number, label: string): void {
  dom.progress.replaceChildren(
    text("span", "num", String(done)),
    text("span", "of", `/ ${total}`),
    text("span", "label", label),
  );
}

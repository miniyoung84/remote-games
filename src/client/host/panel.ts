import type { HostGame, HostState } from "../../shared/types.js";

export type HostDom = { now: HTMLElement; board: HTMLElement };

export type HostPanel = {
  render: (state: HostState, game: HostGame) => void;
  /** Return true if the key was handled, so the shell doesn't double-handle it. */
  key: (event: KeyboardEvent, state: HostState, game: HostGame) => boolean;
  unmount: () => void;
};

export function text(tag: string, className: string, value = ""): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

export function button(label: string, className = ""): HTMLButtonElement {
  const node = document.createElement("button");
  node.className = className;
  node.textContent = label;
  return node;
}

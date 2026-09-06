import { placedItems } from "../../shared/tierlist.js";
import type { Action } from "../../shared/protocol.js";
import type { HostGame, HostState, Item } from "../../shared/types.js";
import { button, text, type HostDom, type HostPanel } from "./panel.js";

type Game = Extract<HostGame, { kind: "tierlist" }>;

export function mountTierPanel(dom: HostDom, send: (a: Action) => void): HostPanel {
  /**
   * When a placed chip is selected, the tier buttons move that item instead of
   * placing the next one. Selecting straight from the board is faster than a
   * separate move mode, which matters when someone is mid-sentence.
   */
  let movingId: string | null = null;
  let latest: Game | null = null;

  const findItem = (game: Game, id: string): { item: Item; tierId: string } | null =>
    placedItems(game.board).find((p) => p.item.id === id) ?? null;

  function place(game: Game, tierId: string): void {
    const subject = movingId ? findItem(game, movingId)?.item : game.board.current;
    if (!subject) return;
    if (movingId && findItem(game, movingId)?.tierId === tierId) return; // already there
    send({ type: "tier/place", itemId: subject.id, tierId });
    movingId = null;
  }

  function renderNow(state: HostState, game: Game): void {
    dom.now.replaceChildren();

    const moving = movingId ? findItem(game, movingId) : null;
    if (movingId && !moving) movingId = null;

    if (game.board.phase === "final") {
      dom.now.append(text("div", "champion-note", "Finished — undo to reopen it."));
      return;
    }

    const picker = state.roster.find((p) => p.id === state.currentPickerId);
    const line = text("div", picker ? "picker-line" : "picker-line none");
    line.append(
      text("span", "round", moving ? `Moving from ${game.board.rows.find((r) => r.id === moving.tierId)?.label}` : game.board.current ? `${game.board.placed + 1} of ${game.board.total}` : "All placed"),
    );
    line.append(document.createTextNode(picker ? `${picker.name} is up` : "Nobody on the clock — tap a name below"));
    dom.now.append(line);

    const subject = moving?.item ?? game.board.current;
    if (subject) {
      const heading = text("div", "tier-subject");
      if (subject.art && "emoji" in subject.art) heading.append(text("span", "subject-art", subject.art.emoji));
      if (subject.art && "color" in subject.art) {
        const sw = text("span", "subject-swatch");
        sw.style.background = subject.art.color;
        heading.append(sw);
      }
      heading.append(text("span", "subject-label", subject.label));
      if (moving) heading.append(text("span", "subject-tag", "moving"));
      dom.now.append(heading);

      const tiers = text("div", "tier-buttons");
      game.board.rows.forEach((row, i) => {
        const node = button("", "tier-btn");
        node.style.setProperty("--tier", row.color);
        node.append(text("span", "key", String(i + 1)), text("span", "tier-name", row.label));
        node.disabled = Boolean(moving && moving.tierId === row.id);
        node.onclick = () => place(game, row.id);
        tiers.append(node);
      });
      dom.now.append(tiers);
    } else {
      dom.now.append(text("p", "empty", "Everything is placed. Move something, or finish."));
    }

    const actions = text("div", "row");
    if (moving) {
      const cancel = button("Cancel move", "ghost");
      cancel.onclick = () => {
        movingId = null;
        if (latest) renderNow(state, latest);
      };
      actions.append(cancel);
    }
    if (game.board.unplaced.length === 0) {
      const finish = button("Finish the list", "primary");
      finish.onclick = () => send({ type: "tier/finish" });
      actions.append(finish);
    }
    if (actions.childElementCount) dom.now.append(actions);
  }

  function renderBoard(state: HostState, game: Game): void {
    dom.board.replaceChildren();
    const wrap = text("div", "h-tiers");

    for (const row of game.board.rows) {
      const node = text("div", "h-tier");
      node.style.setProperty("--tier", row.color);
      node.append(text("div", "h-tier-label", row.label));
      const items = text("div", "h-tier-items");
      for (const item of row.items) {
        const chip = text("div", "h-chip", item.label);
        chip.title = "Select to move";
        if (item.id === movingId) chip.classList.add("moving");
        chip.onclick = () => {
          movingId = movingId === item.id ? null : item.id;
          if (latest) {
            renderNow(state, latest);
            renderBoard(state, latest);
          }
        };
        items.append(chip);
      }
      if (!row.items.length) items.append(text("span", "h-tier-empty", "—"));
      node.append(items);
      wrap.append(node);
    }

    if (game.board.unplaced.length) {
      const queue = text("div", "h-queue");
      queue.append(text("div", "h-queue-label", `Up next (${game.board.unplaced.length})`));
      const list = text("div", "h-queue-items");
      for (const item of game.board.unplaced.slice(0, 12)) list.append(text("span", "h-chip ghost", item.label));
      queue.append(list);
      wrap.append(queue);
    }

    dom.board.append(wrap);
  }

  return {
    render: (state, game) => {
      if (game.kind !== "tierlist") return;
      latest = game;
      renderNow(state, game);
      renderBoard(state, game);
    },
    key: (event, _state, game) => {
      if (game.kind !== "tierlist") return false;
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= game.board.rows.length) return false;
      place(game, game.board.rows[index].id);
      return true;
    },
    unmount: () => {
      movingId = null;
      latest = null;
    },
  };
}

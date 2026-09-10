import { placedItems } from "../../shared/tierlist.js";
import type { Action } from "../../shared/protocol.js";
import type { Art, HostGame, HostState, Item } from "../../shared/types.js";
import { button, text, type HostDom, type HostPanel } from "./panel.js";

type Game = Extract<HostGame, { kind: "tierlist" }>;

export type FindPicture = (
  labels: string[],
  apply: (label: string, art: Art) => void,
  done?: () => void,
) => void;

export function mountTierPanel(dom: HostDom, send: (a: Action) => void, findPicture: FindPicture): HostPanel {
  // Kept outside render so a state push mid-typing can't wipe what's in it.
  const addInput = document.createElement("input");
  addInput.className = "tier-add-input";
  addInput.placeholder = "Add something to sort…";
  addInput.autocomplete = "off";

  function submitAdd(): void {
    const label = addInput.value.trim();
    if (!label) return;
    send({ type: "tier/add", label });
    addInput.value = "";
  }

  addInput.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitAdd();
    }
  };

  /**
   * The item the tier buttons will act on. It can be a placed chip (a move) or,
   * in open mode, one picked out of the queue. Selecting straight off the board
   * beats a separate mode when someone is mid-sentence.
   */
  let selectedId: string | null = null;
  let latest: Game | null = null;

  const findItem = (game: Game, id: string): { item: Item; tierId: string } | null =>
    placedItems(game.board).find((p) => p.item.id === id) ?? null;

  function subjectOf(game: Game): { item: Item; from: string | null } | null {
    if (selectedId) {
      const placed = findItem(game, selectedId);
      if (placed) return { item: placed.item, from: placed.tierId };
      const queued = game.board.unplaced.find((i) => i.id === selectedId);
      if (queued) return { item: queued, from: null };
      selectedId = null;
    }
    return game.board.current ? { item: game.board.current, from: null } : null;
  }

  function place(game: Game, tierId: string): void {
    const subject = subjectOf(game);
    if (!subject) return;
    if (subject.from === tierId) return; // already there
    send({ type: "tier/place", itemId: subject.item.id, tierId });
    selectedId = null;
  }

  function renderNow(state: HostState, game: Game): void {
    dom.now.replaceChildren();

    const subject = subjectOf(game);
    const moving = subject?.from ? subject : null;

    if (game.board.phase === "final") {
      dom.now.append(text("div", "champion-note", "Finished — undo to reopen it."));
      return;
    }

    const picker = state.roster.find((p) => p.id === state.currentPickerId);
    const line = text("div", picker ? "picker-line" : "picker-line none");
    line.append(
      text(
        "span",
        "round",
        moving
          ? `Moving from ${game.board.rows.find((r) => r.id === moving.from)?.label}`
          : subject
            ? `${game.board.placed + 1} of ${game.board.total}`
            : "Pick something below",
      ),
    );
    line.append(document.createTextNode(picker ? `${picker.name} is up` : "Nobody on the clock — tap a name below"));
    dom.now.append(line);

    if (subject) {
      const art = subject.item.art;
      const heading = text("div", "tier-subject");
      if (art && "emoji" in art) heading.append(text("span", "subject-art", art.emoji));
      if (art && "color" in art) {
        const sw = text("span", "subject-swatch");
        sw.style.background = art.color;
        heading.append(sw);
      }
      if (art && "image" in art) {
        const img = document.createElement("img");
        img.className = "subject-image";
        img.src = `/images/${art.image}.webp`;
        img.alt = "";
        heading.append(img);
      }
      heading.append(text("span", "subject-label", subject.item.label));
      if (moving) heading.append(text("span", "subject-tag", "moving"));

      // Anything on the board can get a picture mid-game, not just new items.
      const findButton = button(subject.item.art ? "change picture" : "find a picture", "mini");
      findButton.onclick = () =>
        findPicture([subject.item.label], (_label, art) =>
          send({ type: "tier/setArt", itemId: subject.item.id, art }),
        );
      heading.append(findButton);
      dom.now.append(heading);

      const tiers = text("div", "tier-buttons");
      game.board.rows.forEach((row, i) => {
        const node = button("", "tier-btn");
        node.style.setProperty("--tier", row.color);
        node.append(text("span", "key", String(i + 1)), text("span", "tier-name", row.label));
        node.disabled = subject?.from === row.id;
        node.onclick = () => place(game, row.id);
        tiers.append(node);
      });
      dom.now.append(tiers);
    } else {
      dom.now.append(
        text(
          "p",
          "empty",
          game.board.unplaced.length
            ? "Choose-any mode — click something in Up next, or on the board to move it."
            : "Everything is placed. Move something, or finish.",
        ),
      );
    }

    // Someone always remembers one that isn't on the list.
    const addRow = text("div", "tier-add");
    const addButton = button("Add", "ghost");
    addButton.onclick = submitAdd;
    addRow.append(addInput, addButton);
    dom.now.append(addRow);

    const actions = text("div", "row");
    if (moving) {
      const cancel = button("Cancel move", "ghost");
      cancel.onclick = () => {
        selectedId = null;
        if (latest) {
          renderNow(state, latest);
          renderBoard(state, latest);
        }
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
        if (item.id === selectedId) chip.classList.add("moving");
        chip.onclick = () => {
          selectedId = selectedId === item.id ? null : item.id;
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
      for (const item of game.board.unplaced.slice(0, 16)) {
        const chip = text("span", "h-chip", item.label);
        if (item.id === selectedId) chip.classList.add("moving");
        chip.title = "Sort this one";
        chip.onclick = () => {
          selectedId = selectedId === item.id ? null : item.id;
          if (latest) {
            renderNow(state, latest);
            renderBoard(state, latest);
          }
        };
        list.append(chip);
      }
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
      selectedId = null;
      latest = null;
      addInput.value = "";
    },
  };
}

import { alreadyDrafted, behindInPicks, pickNumber } from "../../shared/draft.js";
import type { Action } from "../../shared/protocol.js";
import type { BoardPick, HostGame, HostState } from "../../shared/types.js";
import { button, text, type HostDom, type HostPanel } from "./panel.js";
import type { FindPicture } from "./tierlist.js";

type Game = Extract<HostGame, { kind: "draft" }>;

export function mountDraftPanel(dom: HostDom, send: (a: Action) => void, findPicture: FindPicture): HostPanel {
  // Kept outside the render so a state push mid-typing can't wipe the input.
  const input = document.createElement("input");
  input.className = "draft-input";
  input.placeholder = "What did they pick?";
  input.autocomplete = "off";
  const warning = text("p", "draft-warning");
  let latest: Game | null = null;

  /** A pick selected on the board for a typo fix or a picture. */
  let editingId: string | null = null;
  const editInput = document.createElement("input");
  editInput.autocomplete = "off";

  function submit(): void {
    const label = input.value.trim();
    if (!label) return;
    send({ type: "draft/pick", label });
    input.value = "";
    warning.textContent = "";
  }

  input.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };
  // Duplicates are flagged, never blocked — the host decides.
  input.oninput = () => {
    const owner = latest ? alreadyDrafted(latest.board, input.value) : null;
    warning.textContent = owner ? `${owner} already drafted that` : "";
  };

  function allPicks(game: Game): BoardPick[] {
    return game.board.columns.flatMap((c) => c.picks);
  }

  function findFor(pick: BoardPick): void {
    findPicture([pick.label], (_label, art) => send({ type: "draft/setArt", pickId: pick.id, art }));
  }

  function saveEdit(): void {
    const label = editInput.value.trim();
    if (!label || !editingId) return;
    send({ type: "draft/rename", pickId: editingId, label });
    editingId = null;
  }

  editInput.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveEdit();
    } else if (event.key === "Escape") {
      editingId = null;
      rerender();
    }
  };

  function rerender(): void {
    if (latest && latestState) {
      renderNow(latestState, latest);
      renderBoard(latest);
    }
  }
  let latestState: HostState | null = null;

  function renderNow(state: HostState, game: Game): void {
    dom.now.replaceChildren();

    if (game.board.phase === "final") {
      dom.now.append(text("div", "champion-note", "Draft finished — undo to reopen it."));
      return;
    }

    const board = game.board;
    const everyoneDone = board.target > 0 && board.columns.filter((c) => c.present).every((c) => c.picks.length >= board.rounds);
    const picker = state.roster.find((p) => p.id === state.currentPickerId);
    const line = text("div", picker ? "picker-line" : "picker-line none");
    line.append(text("span", "round", board.target ? `${board.total} of ${board.target} picks` : `${board.total} picks`));
    line.append(
      document.createTextNode(
        picker ? `${picker.name} is on the clock` : everyoneDone ? "Everyone has picked" : "Nobody on the clock — tap a name below",
      ),
    );
    dom.now.append(line);

    const row = text("div", "draft-entry");
    const add = button("Add pick", "primary");
    add.onclick = submit;
    row.append(input, add);
    dom.now.append(row, warning);

    // A selected pick: fix the name, or give it a picture. Typos are the
    // normal case when everything is typed live.
    const editing = editingId ? allPicks(game).find((p) => p.id === editingId) : null;
    if (editing) {
      const box = text("div", "draft-edit");
      box.append(text("span", "draft-edit-label", `Editing ${pickNumber(editing)}`));
      const editRow = text("div", "draft-edit-row");
      if (editInput.dataset.for !== editing.id) {
        editInput.value = editing.label;
        editInput.dataset.for = editing.id;
      }
      const save = button("Save", "primary");
      save.onclick = saveEdit;
      const picture = button(editing.art ? "change picture" : "find a picture", "mini");
      picture.onclick = () => findFor(editing);
      const cancel = button("Cancel", "ghost");
      cancel.onclick = () => {
        editingId = null;
        rerender();
      };
      editRow.append(editInput, save, picture, cancel);
      box.append(editRow);
      dom.now.append(box);
      editInput.focus();
    } else {
      if (picker) input.focus();
      // The pick that just went up is the one most likely to want a picture, so
      // it gets the button right here rather than a hunt through the board.
      const last = board.last;
      if (last) {
        const line = text("div", "draft-last");
        line.append(text("span", "draft-last-label", `${pickNumber(last)} · ${last.byName} took ${last.label}`));
        const find = button(last.art ? "change picture" : "find a picture", "mini");
        find.onclick = () => findFor(last);
        line.append(find);
        dom.now.append(line);
      }
    }

    // Who has the fewest picks — the fairness the snake order used to provide.
    const behind = behindInPicks(board)
      .map((id) => board.columns.find((c) => c.personId === id)?.name)
      .filter(Boolean);
    if (behind.length && behind.length < board.columns.length) {
      dom.now.append(text("p", "draft-behind", `Fewest picks: ${behind.join(", ")}`));
    }

    const actions = text("div", "row");
    // "One more round!" happens. So does realising three was too many.
    const more = button("+1 round", "ghost");
    more.title = `Everyone gets ${board.rounds + 1} picks`;
    more.disabled = board.rounds >= 12;
    more.onclick = () => send({ type: "draft/setRounds", rounds: board.rounds + 1 });
    const fewer = button("−1 round", "ghost");
    const deepest = Math.max(0, ...board.columns.map((c) => c.picks.length));
    fewer.disabled = board.rounds <= 1 || board.rounds - 1 < deepest;
    fewer.title = fewer.disabled ? "Someone already has that many picks" : `Everyone gets ${board.rounds - 1} picks`;
    fewer.onclick = () => send({ type: "draft/setRounds", rounds: board.rounds - 1 });
    actions.append(more, fewer);
    if (board.total) {
      const finish = button(everyoneDone ? "Finish the draft — everyone has picked" : "Finish the draft", everyoneDone ? "primary" : "ghost");
      finish.onclick = () => send({ type: "draft/finish" });
      actions.append(finish);
    }
    dom.now.append(actions);
  }

  function renderBoard(game: Game): void {
    dom.board.replaceChildren();
    const wrap = text("div", "h-draft");
    for (const column of game.board.columns) {
      const node = text("div", "h-draft-col");
      if (!column.present) node.classList.add("away");
      const head = text("div", "h-draft-head");
      head.append(text("span", "", column.name), text("span", "h-draft-count", String(column.picks.length)));
      node.append(head);
      const picks = text("div", "h-draft-picks");
      for (const pick of column.picks) {
        const chip = text("span", "h-chip", "");
        if (pick.art && "image" in pick.art) {
          const img = document.createElement("img");
          img.className = "h-thumb";
          img.src = `/images/${pick.art.image}.webp`;
          img.alt = "";
          chip.append(img);
        }
        chip.append(text("span", "h-pick-num", pickNumber(pick)), document.createTextNode(pick.label));
        chip.title = "Fix the name or find a picture";
        if (pick.id === editingId) chip.classList.add("editing");
        chip.onclick = () => {
          editingId = editingId === pick.id ? null : pick.id;
          rerender();
        };
        picks.append(chip);
      }
      if (!column.picks.length) picks.append(text("span", "h-tier-empty", "—"));
      node.append(picks);
      wrap.append(node);
    }
    dom.board.append(wrap);
  }

  return {
    render: (state, game) => {
      if (game.kind !== "draft") return;
      latest = game;
      latestState = state;
      // A pick undone out from under the editor closes it.
      if (editingId && !allPicks(game).some((p) => p.id === editingId)) editingId = null;
      renderNow(state, game);
      renderBoard(game);
    },
    key: () => false,
    unmount: () => {
      latest = null;
      latestState = null;
      editingId = null;
      input.value = "";
      warning.textContent = "";
    },
  };
}

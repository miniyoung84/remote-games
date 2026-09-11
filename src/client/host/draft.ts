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

  function findFor(pick: BoardPick): void {
    findPicture([pick.label], (_label, art) => send({ type: "draft/setArt", pickId: pick.id, art }));
  }

  function renderNow(state: HostState, game: Game): void {
    dom.now.replaceChildren();

    if (game.board.phase === "final") {
      dom.now.append(text("div", "champion-note", "Draft finished — undo to reopen it."));
      return;
    }

    const picker = state.roster.find((p) => p.id === state.currentPickerId);
    const line = text("div", picker ? "picker-line" : "picker-line none");
    line.append(text("span", "round", game.board.target ? `${game.board.total} of ${game.board.target} picks` : `${game.board.total} picks`));
    line.append(document.createTextNode(picker ? `${picker.name} is on the clock` : "Nobody on the clock — tap a name below"));
    dom.now.append(line);

    const row = text("div", "draft-entry");
    const add = button("Add pick", "primary");
    add.onclick = submit;
    row.append(input, add);
    dom.now.append(row, warning);
    if (picker) input.focus();

    // The pick that just went up is the one most likely to want a picture, so
    // it gets the button right here rather than a hunt through the board.
    const last = game.board.last;
    if (last) {
      const line = text("div", "draft-last");
      line.append(text("span", "draft-last-label", `${pickNumber(last)} · ${last.byName} took ${last.label}`));
      const find = button(last.art ? "change picture" : "find a picture", "mini");
      find.onclick = () => findFor(last);
      line.append(find);
      dom.now.append(line);
    }

    // Who has the fewest picks — the fairness the snake order used to provide.
    const behind = behindInPicks(game.board)
      .map((id) => game.board.columns.find((c) => c.personId === id)?.name)
      .filter(Boolean);
    if (behind.length && behind.length < game.board.columns.length) {
      dom.now.append(text("p", "draft-behind", `Fewest picks: ${behind.join(", ")}`));
    }

    if (game.board.total) {
      const actions = text("div", "row");
      const finish = button("Finish the draft", "ghost");
      finish.onclick = () => send({ type: "draft/finish" });
      actions.append(finish);
      dom.now.append(actions);
    }
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
        chip.title = pick.art ? "Change the picture" : "Find a picture";
        chip.onclick = () => findFor(pick);
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
      renderNow(state, game);
      renderBoard(game);
    },
    key: () => false,
    unmount: () => {
      latest = null;
      input.value = "";
      warning.textContent = "";
    },
  };
}
